//! Fixtures partagés et point d'entrée de la suite de tests agent.
//!
//! Contient les mocks LLM/outils et les builders de tours (`done_turn`,
//! `read_then_one_todo_turn`, …). Les cas sont ventilés dans les sous-modules.

pub(crate) use super::*;

use async_trait::async_trait;
use drox_llm::{ChatOptions, LlmClient, LlmError, StreamHandle};
use drox_tools::Tool;
use futures::stream;
use std::sync::Mutex;

use crate::memory::MemoryRuntime;

// Imports partagés réexportés pour les sous-modules (`use super::*`).
pub(crate) use drox_bash::command_is_inspect_only;
pub(crate) use drox_context::{ContextBudget, RoughTokenCounter};
pub(crate) use drox_tools::{TodoWriteTool, ToolContext, ToolRegistry};
pub(crate) use drox_types::{Message, StopReason, StreamEvent, ToolUseId, Usage};
pub(crate) use futures::StreamExt;
pub(crate) use serde_json::{json, Value};
pub(crate) use std::sync::Arc;
pub(crate) use tokio::sync::mpsc;

pub(crate) use crate::context::ContextPolicy;
pub(crate) use crate::error::EngineError;
pub(crate) use crate::event::{AgentEvent, Phase};
pub(crate) use crate::permissions::PermissionPolicy;

mod gates_tests;
mod hallucination_tests;
mod loop_tests;
mod phase_tests;
mod run_tests;

/// Client LLM en mémoire : retourne des scripts d'événements pré-définis,
/// un par appel `stream_chat`.
pub(crate) struct ScriptedLlm {
    scripts: Mutex<Vec<Vec<StreamEvent>>>,
}

impl ScriptedLlm {
    pub(crate) fn new(scripts: Vec<Vec<StreamEvent>>) -> Self {
        Self {
            scripts: Mutex::new(scripts),
        }
    }
}

#[async_trait]
impl LlmClient for ScriptedLlm {
    async fn stream_chat(
        &self,
        _messages: Vec<Message>,
        _options: ChatOptions,
    ) -> Result<StreamHandle, LlmError> {
        let script = {
            let mut s = self.scripts.lock().unwrap();
            if s.is_empty() {
                return Err(LlmError::InvalidConfig("no more scripts".into()));
            }
            s.remove(0)
        };
        let events = script.into_iter().map(Ok::<_, LlmError>);
        Ok(stream::iter(events).boxed())
    }
}

/// Tool d'écho minimal pour tester l'aller-retour.
pub(crate) struct EchoTool;

#[async_trait]
impl Tool for EchoTool {
    fn name(&self) -> &str {
        "echo"
    }
    fn description(&self) -> &str {
        "Renvoie l'input tel quel"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object" })
    }
    async fn execute(
        &self,
        _ctx: &ToolContext,
        input: Value,
    ) -> Result<Value, drox_tools::ToolError> {
        Ok(input)
    }
}

/// Mock du tool `bash` côté tests. Le vrai `bash` exécute des commandes
/// shell et n'est pas adapté aux tests unitaires asynchrones. Ici on
/// s'en sert uniquement pour faire incrémenter le tracker
/// `mutating_tools_since_last_todo` côté moteur (qui matche par `name`).
pub(crate) struct FakeFileEditTool;

#[async_trait]
impl Tool for FakeFileEditTool {
    fn name(&self) -> &str {
        "file_edit"
    }
    fn description(&self) -> &str {
        "fake file_edit (test only)"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object" })
    }
    async fn execute(
        &self,
        _ctx: &ToolContext,
        _input: Value,
    ) -> Result<Value, drox_tools::ToolError> {
        Ok(json!({ "applied": true, "path": "src/page.tsx" }))
    }
}

pub(crate) struct FakeBashTool;

#[async_trait]
impl Tool for FakeBashTool {
    fn name(&self) -> &str {
        "bash"
    }
    fn description(&self) -> &str {
        "fake bash (test only) — counts as a mutating tool for step tracking"
    }
    fn input_schema(&self) -> Value {
        json!({ "type": "object" })
    }
    async fn execute(
        &self,
        _ctx: &ToolContext,
        _input: Value,
    ) -> Result<Value, drox_tools::ToolError> {
        Ok(json!({ "stdout": "", "exit_code": 0 }))
    }
}

/// Forme un tour LLM qui se clôt proprement (`[phase: done]` puis texte).
/// Construit un tour LLM « happy path » : `[phase: answering]` + texte +
/// `[phase: done]`. Conforme à la règle answering-before-done (A.3) :
/// un tour qui prétend conclure DOIT passer par `answering`.
pub(crate) fn done_turn(text: &str) -> Vec<StreamEvent> {
    vec![
        StreamEvent::Start,
        StreamEvent::TextDelta {
            text: format!("[phase: answering]\n{text}\n[phase: done]"),
        },
        StreamEvent::Stop {
            reason: StopReason::EndTurn,
            usage: Usage::default(),
        },
    ]
}

/// Tour LLM qui signe `[phase: done]` SANS jamais passer par `answering`.
/// Utilisé pour tester la branche A.3 : le moteur doit refuser la
/// clôture et injecter `MISSING_ANSWERING_PROMPT`.
pub(crate) fn premature_done_turn(text: &str) -> Vec<StreamEvent> {
    vec![
        StreamEvent::Start,
        StreamEvent::TextDelta {
            text: format!("[phase: reading]\n{text}\n[phase: done]"),
        },
        StreamEvent::Stop {
            reason: StopReason::EndTurn,
            usage: Usage::default(),
        },
    ]
}

/// Protocole test : `[phase: reading]` puis un `todo_write` à 1 item
/// directement `completed`. Pour les tests qui veulent un cycle minimal
/// qui passe **toutes** les gates moteur (todo clôturée avant `done`).
pub(crate) fn read_then_one_todo_turn(note: &str) -> Vec<StreamEvent> {
    read_then_one_todo_turn_with_status(note, "completed")
}

/// Variante paramétrable : permet d'ouvrir une to-do en `in_progress`
/// pour tester la gate « to-do non clôturée → refus `done` ».
pub(crate) fn read_then_one_todo_turn_with_status(
    note: &str,
    status: &str,
) -> Vec<StreamEvent> {
    let tid = ToolUseId::new();
    vec![
        StreamEvent::Start,
        StreamEvent::TextDelta {
            text: format!("[phase: reading]\n{note}\n"),
        },
        StreamEvent::ToolCall {
            id: tid,
            name: "todo_write".into(),
            arguments: json!({
                "todos": [{
                    "id": "1",
                    "content": "Étape de test",
                    "status": status,
                }]
            }),
        },
        StreamEvent::Stop {
            reason: StopReason::ToolUse,
            usage: Usage::default(),
        },
    ]
}

/// GLM / Qwen : `tool_calls` nommé `phase:` + `{\"done\":\"\"}` au lieu de la ligne texte.
pub(crate) fn answering_turn_with_hallucinated_phase_tool() -> Vec<StreamEvent> {
    let tid = ToolUseId::new();
    vec![
        StreamEvent::Start,
        StreamEvent::TextDelta {
            text: "[phase: answering]\nConclusion finale.\n".into(),
        },
        StreamEvent::ToolCall {
            id: tid,
            name: "phase:".into(),
            arguments: json!({ "done": "" }),
        },
        StreamEvent::Stop {
            reason: StopReason::ToolUse,
            usage: Usage::default(),
        },
    ]
}

pub(crate) fn todo_then_code_edit_turn(path: &str) -> Vec<StreamEvent> {
    let tid_todo = ToolUseId::new();
    let tid_edit = ToolUseId::new();
    vec![
        StreamEvent::Start,
        StreamEvent::TextDelta {
            text: "[phase: reading]\nprep\n".into(),
        },
        StreamEvent::ToolCall {
            id: tid_todo,
            name: "todo_write".into(),
            arguments: json!({
                "todos": [{
                    "id": "1",
                    "content": "Modifier le code",
                    "status": "completed",
                }]
            }),
        },
        StreamEvent::TextDelta {
            text: "[phase: acting]\nedit\n".into(),
        },
        StreamEvent::ToolCall {
            id: tid_edit,
            name: "file_edit".into(),
            arguments: json!({ "path": path, "old_string": "a", "new_string": "b" }),
        },
        StreamEvent::Stop {
            reason: StopReason::ToolUse,
            usage: Usage::default(),
        },
    ]
}

/// Construit un tour LLM de compaction : produit un markdown au format
/// `## Objective\n…\n## Files touched\n- …`. Sert à fournir un résultat
/// déterministe au pipeline `summarize_run` qui sera appelé par
/// `maybe_persist_session` à la fin du run.
pub(crate) fn compaction_turn(objective: &str, files: &[&str]) -> Vec<StreamEvent> {
    use std::fmt::Write as _;
    let mut md = String::new();
    let _ = writeln!(md, "## Objective\n{objective}");
    md.push_str("## Decisions\n- Decision A\n- Decision B\n");
    md.push_str("## Files touched\n");
    for f in files {
        let _ = writeln!(md, "- {f}");
    }
    md.push_str("## What's in progress\nNothing pending.\n");
    vec![
        StreamEvent::Start,
        StreamEvent::TextDelta { text: md },
        StreamEvent::Stop {
            reason: StopReason::EndTurn,
            usage: Usage::default(),
        },
    ]
}

pub(crate) fn memory_runtime_for_test(
    workspace: &camino::Utf8Path,
    llm: Arc<ScriptedLlm>,
) -> MemoryRuntime {
    MemoryRuntime {
        workspace_root: workspace.to_path_buf(),
        llm,
        compaction_prompt: "You are a compaction model. Produce markdown.".into(),
        compaction_config: crate::compaction::CompactionConfig::default(),
        notes: drox_tools::SessionNotesHandle::new(),
        model_label: "scripted-test".into(),
    }
}
