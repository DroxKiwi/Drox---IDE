//! Boucle agent : orchestre `LlmClient` ↔ `ToolRegistry`.
//!
//! Sprint A (refonte 2026-05-13). Le moteur ne s'appuie plus sur des
//! heuristiques de détection de « réponses paresseuses » (regex de phrases
//! type « je vais explorer… »). À la place :
//!
//! 1. Le modèle peut annoncer des transitions via des marqueurs ligne
//!    `[phase: nom]` (`reading`, `planning`, `acting`, `verifying`,
//!    `clarifying`, `answering`, `done`). Les anciens marqueurs `reasoning` et
//!    `next-move` sont ignorés (ligne retirée sans effet). Voir
//!    [`crate::event::Phase`].
//! 2. `consume_stream` parse ces marqueurs ligne par ligne, les **retire** du
//!    texte assistant, et émet `AgentEvent::PhaseEnter`.
//! 3. La boucle agent applique **une seule règle de continuation** : si un
//!    tour assistant se termine **sans `tool_call`** et **sans** avoir signé
//!    `[phase: done]`, on injecte un rappel `system` et on relance l'LLM
//!    **une fois**. Si la relance reste muette, on accepte la réponse pour
//!    ne pas tourner indéfiniment ; sinon la borne dure reste
//!    `max_iterations`.

use std::sync::Arc;

use drox_llm::{ChatOptions, LlmClient, ToolSpec};
use drox_hooks::ToolHooksConfig;
use drox_tools::{ToolContext, ToolRegistry, UserQuestion};
use drox_types::{Content, Message, Role, ToolUseId};
use futures::{StreamExt, stream::BoxStream};
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tracing::{instrument, warn};

use crate::context::ContextPolicy;
use crate::error::EngineError;
use crate::event::AgentEvent;
use crate::run_spec::{RoleId, RunSpec};
use crate::memory::MemoryRuntime;
use crate::permissions::PermissionPolicy;

mod run_rail;
mod architect_gates;
mod architect_todo_gate;
mod cycle_sanity;
mod architect_state;
mod edit_start;
mod executor_gates;
mod gates;
mod r#loop;
mod nudges;
mod phases;
pub(crate) use phases::{parse_phase_marker, strip_phase_protocol_lines};
mod agent_stream;
mod final_answer_guard;
mod subagent_report_gate;

pub(crate) use agent_stream::PendingToolCall;
pub use architect_state::{ArchitectRunState, ARCHITECT_RUN_SNAPSHOT_MARKER};
pub use edit_start::{apply_architect_edit_start, ArchitectEditStartOutcome};

/// Corps du message `role = tool` renvoyé au LLM après exécution réussie.
///
/// Sans balisage explicite, certains modèles prennent un gros JSON (sortie
/// `glob`, `grep`, etc.) pour un « collage » utilisateur arbitraire au lieu
/// du résultat structuré de leur propre appel d'outil.
pub(crate) fn format_tool_result_for_llm(tool_name: &str, value: &Value) -> String {
    let serialized = serde_json::to_string(value).unwrap_or_default();
    format!(
        "[drox: tool result \"{tool_name}\" — JSON below; this is not a user message]\n{serialized}",
    )
}

#[must_use]
pub(crate) fn is_professor_run(policy: Option<&PermissionPolicy>) -> bool {
    policy.is_some_and(|p| p.mode.is_professor())
}

/// Configuration d'un agent.
#[derive(Debug, Clone)]
pub struct AgentConfig {
    /// System prompt optionnel injecté en tête de conversation.
    pub system_prompt: Option<String>,
    /// Nombre maximum d'allers-retours LLM ↔ tools dans un même `run()`.
    pub max_iterations: usize,
    /// Options passées tel quel au `LlmClient` (tools y sont ajoutés
    /// automatiquement à partir du `ToolRegistry`).
    pub chat_options: ChatOptions,
    /// Politique de permissions. Si `None`, aucun garde-fou : tous les tool
    /// calls sont exécutés (mode "ancien" pré-1.7). En production, fournir
    /// systématiquement une politique.
    pub permissions: Option<PermissionPolicy>,
    /// Politique de contexte (token counting + snip auto). Si `None`,
    /// l'historique n'est jamais réduit (sprint 1.4 behaviour).
    pub context: Option<ContextPolicy>,
    /// Persistance transcript JSONL (sprint 1.10). Si `None`, rien n'est
    /// écrit sur disque.
    pub transcript: Option<drox_session::TranscriptSessionConfig>,
    /// Sprint M1 — mémoire de session (compaction + persistance dans
    /// `.drox/memory/sessions/`). Si `None`, aucun résumé n'est produit et
    /// les tools `session_note` / `memory_*` ne sont pas branchés.
    pub memory: Option<MemoryRuntime>,
    /// Identifiant `ses_…` du transcript JSONL (JSON-RPC / extension). Sert
    /// aux enregistrements `context_chunk_summary` côté client.
    pub transcript_session_id: Option<String>,
    /// Empreinte workspace (chemin canonique) pour corréler l'index client.
    pub workspace_fingerprint: String,
    /// Nombre max de tools read-only exécutés en parallèle dans un même tour (§2.29).
    pub max_parallel_tool_calls: usize,
    /// Hooks pre/post tool (§2.6). `None` ou config vide = désactivé.
    pub tool_hooks: Option<ToolHooksConfig>,
    /// Objectif verrouillé du run (§2.25) — injecté en tête de conversation.
    pub run_objective: Option<String>,
    /// Id tâche architecte (`t1`, …) pour les sous-runs exécuteur.
    pub delegate_task_id: Option<String>,
    /// Contrat A — clôture exécuteur quand un `.md` est écrit sous ce dossier tâche.
    pub executor_deliverable_task_id: Option<String>,
    /// Dossier plan parent (`.drox/agent-output/<plan_id>/<task_id>/`).
    pub executor_deliverable_plan_id: Option<String>,
    /// Spécification d'exécution du run (couche B). Voir `run_spec`.
    pub run_spec: RunSpec,
    /// Paramètres strictness / gates résolus (`resolve_engine_tuning`).
    pub engine_tuning: crate::orchestration::EngineTuning,
    /// Id run orchestration (corrélation RPC / transcript).
    pub orchestration_run_id: Option<String>,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            system_prompt: None,
            max_iterations: 12,
            chat_options: ChatOptions::default(),
            permissions: None,
            context: None,
            transcript: None,
            memory: None,
            transcript_session_id: None,
            workspace_fingerprint: String::new(),
            max_parallel_tool_calls: crate::tool_orchestration::DEFAULT_MAX_PARALLEL_TOOL_CALLS,
            tool_hooks: None,
            run_objective: None,
            delegate_task_id: None,
            executor_deliverable_task_id: None,
            executor_deliverable_plan_id: None,
            run_spec: RunSpec::default(),
            engine_tuning: crate::orchestration::EngineTuning::default(),
            orchestration_run_id: None,
        }
    }
}

pub(crate) async fn mirror_workspace_map_from_tool(
    ctx: &ToolContext,
    tool_name: &str,
    output: &Value,
) {
    let Some(store) = ctx.workspace_map.as_ref() else {
        return;
    };
    match tool_name {
        "glob" => store.ingest_glob(output),
        "file_read" => store.ingest_file_read(output),
        "lsp" => store.ingest_lsp(output),
        _ => return,
    }
    store.save_if_dirty().await;
}

/// Stream typé d'événements agent.
pub type AgentStream = BoxStream<'static, Result<AgentEvent, EngineError>>;

/// Agent : boucle LLM streaming + dispatch de tool calls.
///
/// Cheap-to-clone : toutes les ressources lourdes sont derrière `Arc`.
#[derive(Clone)]
pub struct Agent {
    llm: Arc<dyn LlmClient>,
    registry: Arc<ToolRegistry>,
    ctx: ToolContext,
    config: AgentConfig,
}

impl Agent {
    /// Parent LLM for nested run-rail segments (`run_rail/segment/runner.rs`).
    #[must_use]
    pub(crate) fn llm_client(&self) -> Arc<dyn LlmClient> {
        self.llm.clone()
    }

    /// Tool context snapshot for segment sub-runs.
    #[must_use]
    pub(crate) fn tool_context(&self) -> ToolContext {
        self.ctx.clone()
    }

    /// Config snapshot for segment sub-runs.
    #[must_use]
    pub(crate) fn agent_config(&self) -> AgentConfig {
        self.config.clone()
    }

    pub fn new(
        llm: Arc<dyn LlmClient>,
        registry: Arc<ToolRegistry>,
        ctx: ToolContext,
        config: AgentConfig,
    ) -> Self {
        Self {
            llm,
            registry,
            ctx,
            config,
        }
    }

    /// Lance la boucle agent et retourne un stream d'événements.
    ///
    /// La tâche async est spawnée sur le runtime courant ; le stream se ferme
    /// quand l'agent atteint `Stop`, `MaxIterations`, ou une erreur.
    pub fn run(&self, prompt: impl Into<String>) -> AgentStream {
        self.run_with_history(Vec::new(), prompt)
    }

    /// Comme [`Self::run`], mais préfixe l'historique chargé depuis le disque
    /// (transcript JSONL) avant le nouveau message utilisateur.
    pub fn run_with_history(
        &self,
        history: Vec<Message>,
        prompt: impl Into<String>,
    ) -> AgentStream {
        self.run_with_history_blocks(history, vec![Content::text(prompt.into())])
    }

    /// Variante multimodale de [`Self::run_with_history`] : permet de pousser
    /// un message `user` constitué de blocs `Content` arbitraires (texte +
    /// images). Utilisée par le serveur JSON-RPC pour relayer des pièces
    /// jointes au modèle.
    #[instrument(skip(self, history, user_blocks), fields(max_iter = self.config.max_iterations, blocks = user_blocks.len()))]
    pub fn run_with_history_blocks(
        &self,
        history: Vec<Message>,
        user_blocks: Vec<Content>,
    ) -> AgentStream {
        let (tx, rx) = mpsc::channel::<Result<AgentEvent, EngineError>>(32);
        let agent = self.clone();
        tokio::spawn(async move {
            agent.drive_inner(history, user_blocks, tx).await;
        });
        ReceiverStream::new(rx).boxed()
    }

}


/// Pose une question oui/non à l'humain via `UserAsker`. Retourne `false`
/// si pas d'asker disponible (fallback : refus) ou si l'humain refuse.
pub(crate) async fn confirm_with_user(
    ctx: &ToolContext,
    tool_name: &str,
    args: &Value,
    permission_message: &str,
) -> bool {
    let Some(asker) = ctx.user_asker.as_ref() else {
        warn!(tool = %tool_name, "Ask requis mais aucun UserAsker configuré → refus");
        return false;
    };
    let args_pretty = serde_json::to_string_pretty(args).unwrap_or_else(|_| args.to_string());
    let question = UserQuestion {
        id: None,
        prompt: format!(
            "{permission_message}\n\nAllow this `{tool_name}` call?\nArgs:\n{args_pretty}"
        ),
        choices: vec!["yes".into(), "no".into()],
        structured_options: vec![],
        allow_multiple: false,
        allow_free_text: false,
    };
    match asker.ask(question).await {
        Ok(answer) => {
            if answer.indices.first().copied() == Some(0) {
                return true;
            }
            let trimmed = answer.text.trim().to_ascii_lowercase();
            matches!(trimmed.as_str(), "y" | "yes" | "0" | "ok")
        }
        Err(err) => {
            warn!(?err, "asker a renvoyé une erreur → refus");
            false
        }
    }
}

/// Compte les échecs consécutifs de `ask_user_question` pour le filet §2.21.
pub(crate) async fn push_tool_error_tracked(
    tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    messages: &mut Vec<Message>,
    call: &PendingToolCall,
    message: String,
    ask_failure_streak: &mut u32,
) -> Result<(), ()> {
    if call.name == "ask_user_question" {
        *ask_failure_streak = ask_failure_streak.saturating_add(1);
    }
    push_tool_error(tx, messages, &call.id, message).await
}

/// Pousse un `ToolFinish { is_error: true }` côté stream + un `tool_result`
/// d'erreur côté historique de messages.
async fn push_tool_error(
    tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    messages: &mut Vec<Message>,
    id: &ToolUseId,
    message: String,
) -> Result<(), ()> {
    let value = json!({ "error": message });
    tx.send(Ok(AgentEvent::ToolFinish {
        id: id.clone(),
        output: value,
        is_error: true,
    }))
    .await
    .map_err(|_| ())?;
    messages.push(Message::tool_result(id.clone(), message, true));
    Ok(())
}

/// Extrait le premier message `user` du run sous forme texte (concatène les
/// blocs `Content::Text`). Utilisé comme **slug fallback** pour les sessions
/// archivées quand la compaction ne livre pas d'`## Objective` exploitable.
///
/// Retourne `None` si aucun message `user` n'a (encore) de texte —
/// l'appelant utilisera alors un slug générique (`"session"`).
fn user_message_text(m: &Message) -> Option<String> {
    if !matches!(m.role, Role::User) {
        return None;
    }
    let mut buf = String::new();
    for block in &m.content {
        if let Content::Text { text } = block {
            if !buf.is_empty() {
                buf.push(' ');
            }
            buf.push_str(text);
        }
    }
    let trimmed = buf.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(crate) fn first_user_text(messages: &[Message]) -> Option<String> {
    for m in messages {
        if let Some(t) = user_message_text(m) {
            return Some(t);
        }
    }
    None
}

/// Dernier message `user` non vide (message courant en session multi-tours).
pub(crate) fn last_user_text(messages: &[Message]) -> Option<String> {
    for m in messages.iter().rev() {
        if let Some(t) = user_message_text(m) {
            return Some(t);
        }
    }
    None
}

/// Construit la liste des `ToolSpec` à partir du registre.
///
/// Certains outils restent enregistrés pour exécution côté client / CLI
/// mais ne doivent **pas** être visibles du LLM (`session_end` : réservé
/// à la commande utilisateur `/session_end`).
pub(crate) fn build_tool_specs(
    registry: &ToolRegistry,
    professor: bool,
    run_spec: &RunSpec,
) -> Vec<ToolSpec> {
    const HIDDEN_FROM_LLM: &[&str] = &["session_end"];
    let has_mcp_stubs = registry
        .names()
        .iter()
        .any(|n| n.starts_with("mcp__"));
    let mut specs = Vec::new();
    for name in registry.names() {
        if !run_spec.tool_visible(&name) {
            continue;
        }
        if HIDDEN_FROM_LLM.contains(&name.as_str()) {
            continue;
        }
        if has_mcp_stubs && name == "mcp_call" {
            continue;
        }
        if professor && name == "todo_write" {
            continue;
        }
        if !professor && name == "course_plan_write" {
            continue;
        }
        if let Some(tool) = registry.get(&name) {
            let description = if run_spec.role_id == RoleId::Architect {
                crate::orchestration::architect_tool_short_description(
                    &name,
                    run_spec.executor_delegation_enabled,
                )
                    .map(str::to_string)
                    .unwrap_or_else(|| tool.description().to_string())
            } else {
                tool.description().to_string()
            };
            specs.push(ToolSpec {
                name: tool.name().to_string(),
                description,
                parameters: tool.input_schema(),
            });
        }
    }
    specs
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use drox_llm::{LlmError, StreamHandle};
    use drox_tools::{TodoWriteTool, Tool, ToolRegistry};
    use drox_types::{StopReason, StreamEvent, Usage};
    use futures::stream;
    use std::sync::{Arc, Mutex};

    use crate::context::ContextPolicy;
    use crate::event::Phase;
    use crate::RoleId;
    use drox_context::{ContextBudget, RoughTokenCounter};
    use super::agent_stream::{TurnOutcome, consume_stream, run_has_promotable_user_facing_text};
    use super::nudges::step_by_step_todo_nudge;

    /// Client LLM en mémoire : retourne des scripts d'événements pré-définis,
    /// un par appel `stream_chat`.
    struct ScriptedLlm {
        scripts: Mutex<Vec<Vec<StreamEvent>>>,
    }

    impl ScriptedLlm {
        fn new(scripts: Vec<Vec<StreamEvent>>) -> Self {
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
    struct EchoTool;

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
    struct FakeFileEditTool;

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

    struct FakeBashTool;

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
    fn done_turn(text: &str) -> Vec<StreamEvent> {
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
    fn premature_done_turn(text: &str) -> Vec<StreamEvent> {
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
    fn read_then_one_todo_turn(note: &str) -> Vec<StreamEvent> {
        read_then_one_todo_turn_with_status(note, "completed")
    }

    /// Variante paramétrable : permet d'ouvrir une to-do en `in_progress`
    /// pour tester la gate « to-do non clôturée → refus `done` ».
    fn read_then_one_todo_turn_with_status(
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
    fn answering_turn_with_hallucinated_phase_tool() -> Vec<StreamEvent> {
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

    /// Sprint A.7 — relax de la gate aux read-only.
    ///
    /// `echo` (proxy d'un read-only en test) appelé **avant** tout
    /// `todo_write` ne doit plus déclencher la gate
    /// `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED`. C'était le faux `× Listed *`
    /// observé en début de chaque conversation : GLM appelle `glob` seul,
    /// le moteur le rejetait, le modèle retentait, et après 1-2 essais
    /// finissait par enchaîner. Maintenant, exploration libre.
    #[tokio::test]
    async fn read_only_tool_before_todo_write_is_allowed() {
        let tid_echo = ToolUseId::new();
        let tid_todo = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            // Tour 1 : reasoning + echo SEUL (pas de todo_write).
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nJe regarde rapidement.\n\
                           [phase: reading]\n"
                        .into(),
                },
                StreamEvent::ToolCall {
                    id: tid_echo.clone(),
                    name: "echo".into(),
                    arguments: json!({ "v": 1 }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            // Tour 2 : maintenant il pose son plan (todo_write seule).
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: planning]\nMaintenant je plan.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid_todo.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Étape",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("OK."),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(EchoTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let echo_ok = events.iter().any(|e| {
            matches!(
                e,
                AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tid_echo
            )
        });
        assert!(
            echo_ok,
            "echo (read-only proxy) doit s'exécuter sans erreur avant todo_write ; events={events:?}"
        );

        let any_error = events.iter().any(
            |e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }),
        );
        assert!(
            !any_error,
            "aucun ToolFinish en erreur — la gate ne s'applique plus aux read-only ; events={events:?}"
        );
    }

    /// Sprint A.7 (relax) — les mutateurs passent sans `todo_write` préalable ;
    /// le moteur injecte un nudge soft au tour suivant, pas une erreur tool.
    #[tokio::test]
    async fn mutating_tool_before_todo_write_allowed_with_soft_nudge() {
        let tid_bash = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            // Tour 1 : reasoning + bash SEUL (mutateur, pas de todo_write).
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nJe vais lancer un script.\n\
                           [phase: acting]\n"
                        .into(),
                },
                StreamEvent::ToolCall {
                    id: tid_bash.clone(),
                    name: "bash".into(),
                    arguments: json!({ "command": "ls" }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("OK."),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(FakeBashTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let bash_ok = events.iter().any(|e| {
            matches!(
                e,
                AgentEvent::ToolFinish {
                    id,
                    is_error: false,
                    ..
                } if id == &tid_bash
            )
        });
        assert!(
            bash_ok,
            "bash sans todo_write préalable doit s'exécuter (gate assouplie) ; events={events:?}"
        );
        let any_mutating_block = events.iter().any(|e| {
            matches!(
                e,
                AgentEvent::ToolFinish {
                    is_error: true,
                    output,
                    ..
                } if output
                    .get("error")
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| s.contains("Blocked") && s.contains("mutating"))
            )
        });
        assert!(
            !any_mutating_block,
            "aucun blocage dur mutating-before-todo ; events={events:?}"
        );
    }

    #[tokio::test]
    async fn professor_file_edit_blocked_without_course_plan() {
        use crate::permissions::PermissionPolicy;
        use drox_permissions::{PermissionEngine, PermissionMode, RuleSet};

        let tid_edit = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: acting]\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid_edit.clone(),
                    name: "file_edit".into(),
                    arguments: json!({
                        "path": "src/page.tsx",
                        "edits": [{ "old_string": "a", "new_string": "b" }]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("OK."),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(FakeFileEditTool));
        let registry = Arc::new(registry);

        let policy = PermissionPolicy::new(
            Arc::new(PermissionEngine::with_rules(RuleSet::new())),
            PermissionMode::Professor,
        );
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let cfg = AgentConfig {
            permissions: Some(policy),
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let mut blocked = false;
        let mut stream = std::pin::pin!(agent.run("modifie la page d'accueil"));
        while let Some(item) = stream.next().await {
            match item {
                Ok(AgentEvent::ToolFinish {
                    id,
                    is_error: true,
                    output,
                    ..
                }) if id.clone() == tid_edit
                    && output
                        .get("error")
                        .and_then(|v| v.as_str())
                        .is_some_and(|s| s.contains("course_plan_write")) =>
                {
                    blocked = true;
                    break;
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        assert!(
            blocked,
            "file_edit en mode professeur sans plan doit être bloqué"
        );
    }

    /// Cas observé GLM-4.7-Flash : le modèle bat che `[file_edit, todo_write]`
    /// (ou `[bash, todo_write]`) dans le même tour. Sans le réordonnement,
    /// le mutateur rate la gate `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED` au
    /// premier outil → UI affiche `× Edited foo.rs`. Avec le réordonnement,
    /// `todo_write` est exécuté en premier, le mutateur ensuite, les deux
    /// passent silencieusement.
    ///
    /// Note : `echo` n'est PAS un mutateur (cf. `MUTATING_TOOLS_FOR_STEP_TRACKING`).
    /// On utilise quand même `echo` ici par commodité (tool de test simple),
    /// mais ce qu'on teste réellement c'est l'ordre d'exécution préservé
    /// quand un batch contient `todo_write` non en tête. La gate elle-même
    /// n'est plus déclenchée par `echo` depuis le relax read-only.
    #[tokio::test]
    async fn todo_write_promoted_when_batched_with_other_tool() {
        let tid_echo = ToolUseId::new();
        let tid_todo = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nPlan + explore en un coup.\n\
                           [phase: reading]\n"
                        .into(),
                },
                StreamEvent::ToolCall {
                    id: tid_echo.clone(),
                    name: "echo".into(),
                    arguments: json!({ "value": "ping" }),
                },
                StreamEvent::ToolCall {
                    id: tid_todo.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Étape",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("OK."),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(EchoTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let any_error = events.iter().any(
            |e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }),
        );
        assert!(
            !any_error,
            "le batch [echo, todo_write] doit être réordonné, donc aucun ToolFinish en erreur ; events={events:?}"
        );

        let echo_finished_ok = events.iter().any(|e| {
            matches!(
                e,
                AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tid_echo
            )
        });
        let todo_finished_ok = events.iter().any(|e| {
            matches!(
                e,
                AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tid_todo
            )
        });
        assert!(
            echo_finished_ok && todo_finished_ok,
            "echo ET todo_write doivent finir sans erreur ; events={events:?}"
        );
    }

    /// Anti-régression : quand un `todo_write` a déjà réussi dans le run,
    /// l'ordre relatif du modèle est respecté (pas de promotion silencieuse
    /// au-delà de la première satisfaction de la gate).
    #[tokio::test]
    async fn todo_write_not_promoted_once_gate_already_satisfied() {
        let tid_echo = ToolUseId::new();
        let tid_todo2 = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            // Tour 1 : todo_write seul (satisfait la gate).
            read_then_one_todo_turn("Premier plan."),
            // Tour 2 : modèle bat che [echo, todo_write] dans un ordre
            // volontaire — on veut que l'ordre soit conservé (echo exécuté
            // en premier puis nouvelle MAJ du plan).
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: acting]\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid_echo.clone(),
                    name: "echo".into(),
                    arguments: json!({ "value": "ping" }),
                },
                StreamEvent::ToolCall {
                    id: tid_todo2.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Étape",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("OK."),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(EchoTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        // Aucun ToolFinish en erreur (les deux passent toujours).
        let any_error = events.iter().any(
            |e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }),
        );
        assert!(!any_error, "events={events:?}");

        // Garde-fou comportemental : l'ordre des ToolFinish (echo puis
        // todo_write n°2) doit correspondre à l'ordre demandé par le
        // modèle, pas être inversé par le réordonnement.
        let finish_seq: Vec<&ToolUseId> = events
            .iter()
            .filter_map(|e| match e {
                AgentEvent::ToolFinish { id, .. } => Some(id),
                _ => None,
            })
            .collect();
        // 3 ToolFinish attendus : tour 1 (todo_write n°1), tour 2 (echo), tour 2 (todo_write n°2).
        // On ne vérifie que l'ordre relatif des deux du tour 2 :
        let echo_pos = finish_seq.iter().position(|id| *id == &tid_echo);
        let todo2_pos = finish_seq.iter().position(|id| *id == &tid_todo2);
        match (echo_pos, todo2_pos) {
            (Some(e), Some(t)) => assert!(
                e < t,
                "ordre relatif modèle préservé (echo avant todo_write n°2) ; finish_seq={finish_seq:?}"
            ),
            _ => panic!("echo et todo_write n°2 doivent être finis ; events={events:?}"),
        }
    }

    #[tokio::test]
    async fn hallucinated_phase_tool_skips_permission_ask_and_surfaces_engine_hint() {
        use drox_permissions::{
            PermissionBehavior, PermissionEngine, PermissionMode, Rule, RuleSet, RuleSource,
            RuleValue,
        };

        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn("Plan minimal."),
            answering_turn_with_hallucinated_phase_tool(),
            done_turn("OK."),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);

        let mut rules = RuleSet::new();
        rules.push(Rule {
            value: RuleValue::tool_wide("echo"),
            behavior: PermissionBehavior::Deny,
            source: RuleSource::CliArg,
        });
        let policy = PermissionPolicy::new(
            Arc::new(PermissionEngine::with_rules(rules)),
            PermissionMode::Default,
        );

        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let cfg = AgentConfig {
            permissions: Some(policy),
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let has_phase_recovered = events.iter().any(|e| {
            matches!(
                e,
                AgentEvent::ToolFinish {
                    is_error: false,
                    output,
                    ..
                } if output.get("recovered_phase").and_then(|v| v.as_str()) == Some("done")
            )
        });
        assert!(
            has_phase_recovered,
            "attendu récupération silencieuse de [phase: done] ; events={events:?}"
        );
        let has_phase_enter_done = events.iter().any(|e| {
            matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })
        });
        assert!(has_phase_enter_done, "attendu PhaseEnter::Done ; events={events:?}");
        let any_user_denied = events.iter().any(|e| {
            matches!(
                e,
                AgentEvent::ToolFinish {
                    is_error: true,
                    output,
                    ..
                } if output
                    .get("error")
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| s.contains("User denied permission"))
            )
        });
        assert!(
            !any_user_denied,
            "le faux outil phase ne doit pas passer par Ask → refus ; events={events:?}"
        );
    }

    fn todo_then_code_edit_turn(path: &str) -> Vec<StreamEvent> {
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

    #[tokio::test]
    async fn done_blocked_when_code_edited_without_testing() {
        let tid_bash = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            todo_then_code_edit_turn("src/lib.rs"),
            done_turn("réponse sans test"),
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: testing]\ncheck\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid_bash,
                    name: "bash".into(),
                    arguments: json!({ "command": "cargo check" }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("réponse après test"),
            done_turn("réponse après test"),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(FakeFileEditTool));
        registry.register(Arc::new(FakeBashTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let raw: Vec<_> = agent.run("corrige le bug").collect().await;
        let events: Vec<AgentEvent> = raw.into_iter().filter_map(Result::ok).collect();

        let testing_idx = events
            .iter()
            .position(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Testing }));
        assert!(
            testing_idx.is_some(),
            "expected Testing phase after code edit nudge, got {events:?}"
        );
        let testing_idx = testing_idx.unwrap();
        assert!(
            !events[..testing_idx]
                .iter()
                .any(|e| matches!(e, AgentEvent::Stop { .. })),
            "run must not Stop before testing phase"
        );
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
            "expected eventual Done, got {events:?}"
        );
    }

    #[tokio::test]
    async fn done_allowed_when_only_markdown_edited() {
        let llm = Arc::new(ScriptedLlm::new(vec![
            todo_then_code_edit_turn("docs/README.md"),
            done_turn("doc mise à jour"),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(FakeFileEditTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let raw: Vec<_> = agent.run("mets à jour le readme").collect().await;
        let events: Vec<AgentEvent> = raw.into_iter().filter_map(Result::ok).collect();

        assert!(
            !events
                .iter()
                .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Testing })),
            "markdown-only edit must not require testing phase, got {events:?}"
        );
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
            "expected Done without testing, got {events:?}"
        );
    }

    #[tokio::test]
    async fn consume_stream_sets_saw_testing_flag() {
        let (tx, _rx) = mpsc::channel::<Result<AgentEvent, EngineError>>(8);
        let script = vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: testing]\nrun checks\n".into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ];
        let stream = stream::iter(script.into_iter().map(Ok::<_, LlmError>)).boxed();
        let outcome = consume_stream(stream, &tx, false).await.expect("channel open");
        assert!(outcome.saw_testing);
        assert_eq!(outcome.final_phase, Some(Phase::Testing));
    }

    #[tokio::test]
    async fn done_blocked_when_todos_still_open() {
        // Scénario : le modèle ouvre la to-do en `in_progress` puis tente de
        // clôturer directement (réponse + done). La nouvelle gate doit refuser
        // ce `done` (todo non clôturée) et nudger. Le tour 3 met à jour la
        // to-do en `completed` et seulement là le moteur accepte de fermer.
        let tid_close = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            // Tour 1 : ouverture de la to-do (in_progress).
            read_then_one_todo_turn_with_status(
                "Je vais traiter la demande.",
                "in_progress",
            ),
            // Tour 2 : answering + done, mais la to-do est toujours ouverte
            // → la gate doit nudger et NE PAS clôturer.
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: answering]\nréponse hâtive\n[phase: done]".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
            // Tour 3 : le modèle clôture la to-do puis re-tente.
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: verifying]\nJe ferme la to-do.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid_close,
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Étape de test",
                            "status": "completed",
                        }]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            // Tour 4 : answering + done. Tout est OK, on doit fermer.
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: answering]\nréponse finale\n[phase: done]".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("salut")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        // On exige qu'on ait vu DEUX appels todo_write (ouverture + clôture).
        let todo_finishes = events
            .iter()
            .filter(|e| matches!(e, AgentEvent::ToolFinish { is_error: false, .. }))
            .count();
        assert!(
            todo_finishes >= 2,
            "expected at least 2 successful todo_write tool finishes (open + close), got {todo_finishes} — events: {events:?}",
        );

        // Le run doit se clôturer normalement (Stop final) : la gate finit
        // par accepter `done` une fois la to-do passée en `completed`.
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
            "expected PhaseEnter(Done) eventually, got {events:?}",
        );
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));

        // La réponse finale doit être celle du tour 4, pas la hâtive du tour 2.
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::TextDelta { text } if text.contains("réponse finale"))),
            "expected final answer to come from the post-close turn, got {events:?}",
        );
    }

    #[tokio::test]
    async fn done_marker_terminates_turn() {
        // `todo_write` obligatoire + `answering` avant `done` : deux tours.
        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn("Alignement sur le message utilisateur."),
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: answering]\nbonjour\n[phase: done]".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage {
                        input_tokens: 1,
                        output_tokens: 1,
                    },
                },
            ],
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("salut")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::PhaseEnter { phase: Phase::Done })),
            "expected PhaseEnter(Done) in {events:?}"
        );
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::TextDelta { text } if text.contains("bonjour"))),
            "expected text 'bonjour' to be emitted (without marker), got {events:?}"
        );
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }

    #[tokio::test]
    async fn tool_call_triggers_execute_and_second_turn() {
        let tid_todo = ToolUseId::new();
        let tid_echo = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nJe vais émettre echo après todo.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid_todo,
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Ping echo",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::ToolCall {
                    id: tid_echo.clone(),
                    name: "echo".into(),
                    arguments: json!({ "msg": "ping" }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            // Tour 2 : modèle signe [phase: done] et conclut.
            done_turn("fini"),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(EchoTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::ToolStart { name, .. } if name == "echo"))
        );
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: false, .. }))
        );
        assert!(events.iter().any(
            |e| matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Done)
        ));
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::TextDelta { text } if text.contains("fini")))
        );
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }

    #[tokio::test]
    async fn unknown_tool_yields_is_error_finish() {
        let tid_todo = ToolUseId::new();
        let tid_bad = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nJ'essaie un outil inconnu.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid_todo,
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Étape",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            vec![
                StreamEvent::Start,
                StreamEvent::ToolCall {
                    id: tid_bad.clone(),
                    name: "does_not_exist".into(),
                    arguments: json!({}),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn(""),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("x")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }))
        );
    }

    #[tokio::test]
    async fn permission_deny_skips_execution() {
        use crate::permissions::PermissionPolicy;
        use drox_permissions::{
            PermissionBehavior, PermissionEngine, PermissionMode, Rule, RuleSet, RuleSource,
            RuleValue,
        };

        let tid_todo = ToolUseId::new();
        let tid_echo = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nJ'appelle echo après todo.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid_todo,
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Echo",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::ToolCall {
                    id: tid_echo.clone(),
                    name: "echo".into(),
                    arguments: json!({ "msg": "ping" }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("ok"),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(EchoTool));
        let registry = Arc::new(registry);

        let mut rules = RuleSet::new();
        rules.push(Rule {
            value: RuleValue::tool_wide("echo"),
            behavior: PermissionBehavior::Deny,
            source: RuleSource::CliArg,
        });
        let policy = PermissionPolicy::new(
            Arc::new(PermissionEngine::with_rules(rules)),
            PermissionMode::Default,
        );

        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let cfg = AgentConfig {
            permissions: Some(policy),
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        // Le ToolFinish doit être marqué is_error: true (refus de permission),
        // l'agent ne doit PAS avoir exécuté EchoTool.
        let has_denial = events
            .iter()
            .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. }));
        assert!(has_denial, "expected a denial ToolFinish in {events:?}");
    }

    #[tokio::test]
    async fn context_snip_event_emitted_when_history_exceeds_threshold() {
        use crate::context::ContextPolicy;
        use drox_context::{ContextBudget, RoughTokenCounter, SnipConfig};

        // Tour 1 : modèle conclut (pas de tool call). On veut juste que le
        // snip pré-tour se déclenche sur l'historique initial.
        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn("Contexte pour le snip."),
            done_turn("ok"),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);

        // Budget minuscule (1k window, 0 reserved, 0 autocompact buffer) →
        // n'importe quelle conversation dépasse autocompact_threshold.
        let policy = ContextPolicy::new(
            Arc::new(RoughTokenCounter::new(4)),
            ContextBudget {
                window_size: 1_000,
                reserved_output: 0,
                autocompact_buffer: 1_000,
                warning_buffer: 800,
                error_buffer: 600,
                manual_compact_buffer: 200,
            },
            Some(SnipConfig {
                min_tokens: 100,
                keep_recent_results: 0,
                placeholder: "[snip]".into(),
            }),
        );

        // On injecte un gros prompt utilisateur initial pour forcer le déclenchement.
        // Note : seuls les tool_results sont snipés, donc on doit injecter
        // un tool_result géant via le prompt initial — pas possible dans ce
        // setup minimal. On vérifie juste que le snip se déclenche sur les
        // tool_results déjà présents.
        // Pour la démonstration : un tour minimal sans tool_result ne
        // produira pas de ContextSnip mais ne doit pas crasher non plus.
        let cfg = AgentConfig {
            context: Some(policy),
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let events: Vec<_> = agent
            .run("x")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();
        // L'agent doit s'être arrêté proprement, peu importe si ContextSnip
        // a été émis (pas de tool_result à snipper dans ce setup).
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }

    #[tokio::test]
    async fn max_iterations_yields_error() {
        // Le LLM redemande toujours echo → boucle infinie bornée par max_iter.
        let make_opening_turn = || {
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nBoucle echo.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: ToolUseId::new(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Echo",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::ToolCall {
                    id: ToolUseId::new(),
                    name: "echo".into(),
                    arguments: json!({}),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ]
        };
        let make_echo_turn = || {
            vec![
                StreamEvent::Start,
                StreamEvent::ToolCall {
                    id: ToolUseId::new(),
                    name: "echo".into(),
                    arguments: json!({}),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ]
        };
        let llm = Arc::new(ScriptedLlm::new(vec![
            make_opening_turn(),
            make_echo_turn(),
            make_echo_turn(),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(EchoTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let cfg = AgentConfig {
            max_iterations: 2,
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let results: Vec<_> = agent.run("loop").collect::<Vec<_>>().await;
        let last = results.into_iter().last().expect("at least one event");
        assert!(matches!(last, Err(EngineError::MaxIterations(2))));
    }

    #[test]
    fn run_has_promotable_user_facing_text_detects_long_reading_answer() {
        let outcome = TurnOutcome {
            text: "[phase: reading]\n# Analyse\n\nContenu détaillé suffisamment long \
                pour dépasser le seuil minimal de promotion automatique sans phase answering.\n\
                [phase: done]"
                .to_string(),
            tool_calls: vec![],
            reason: StopReason::EndTurn,
            usage: Usage::default(),
            final_phase: Some(Phase::Done),
            saw_answering: false,
            saw_analyzing: false,
            saw_testing: false,
            run_objective: None,
        };
        assert!(run_has_promotable_user_facing_text(
            &outcome,
            &[],
            RoleId::Architect,
            &crate::EngineTuning::default(),
        ));
    }

    #[test]
    fn run_has_promotable_user_facing_text_accepts_short_discussion_greeting() {
        let outcome = TurnOutcome {
            text: "Salut ! Comment puis-je vous aider ?".to_string(),
            tool_calls: vec![],
            reason: StopReason::EndTurn,
            usage: Usage::default(),
            final_phase: None,
            saw_answering: false,
            saw_analyzing: false,
            saw_testing: false,
            run_objective: None,
        };
        assert!(run_has_promotable_user_facing_text(
            &outcome,
            &[],
            RoleId::ArchitectDiscussion,
            &crate::EngineTuning::default(),
        ));
    }

    #[test]
    fn run_has_promotable_user_facing_text_rejects_short_done_only() {
        let outcome = TurnOutcome {
            text: "[phase: done]".to_string(),
            tool_calls: vec![],
            reason: StopReason::EndTurn,
            usage: Usage::default(),
            final_phase: Some(Phase::Done),
            saw_answering: false,
            saw_analyzing: false,
            saw_testing: false,
            run_objective: None,
        };
        assert!(!run_has_promotable_user_facing_text(
            &outcome,
            &[],
            RoleId::Architect,
            &crate::EngineTuning::default(),
        ));
    }

    #[tokio::test]
    async fn consecutive_same_phase_markers_are_deduplicated() {
        // Devstral / Gemma ponctuent leur prose avec `[phase: reading]` à
        // répétition. Le consommateur ne doit voir QU'UN seul `PhaseEnter`
        // tant que la phase ne change pas effectivement. Tour 2 : texte
        // riche puis `answering` + `done` (todo déjà posé au tour 1).
        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn("Préambule."),
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nP1\n[phase: reading]\nP2\n\
                           [phase: reading]\nP3\n[phase: reading]\n\
                           lit le repo\n\
                           [phase: answering]\nréponse finale\n[phase: done]"
                        .into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("x")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let phase_enters: Vec<Phase> = events
            .iter()
            .filter_map(|e| match e {
                AgentEvent::PhaseEnter { phase } => Some(*phase),
                _ => None,
            })
            .collect();
        // Tour 1 : reading + todo. Tour 2 : plusieurs `reading` identiques → 1
        // `PhaseEnter` tant que la phase ne change pas ; puis answering ; done.
        let dedup_tail = &[
            Phase::Reading,
            Phase::Answering,
            Phase::Done,
        ];
        assert!(
            phase_enters.windows(dedup_tail.len()).any(|w| w == dedup_tail),
            "expected dedup tail {dedup_tail:?} as a subslice, got {phase_enters:?}"
        );
    }

    // --- Boucle agent : nudge unique ----------------------------------------

    #[tokio::test]
    async fn silent_turn_triggers_one_nudge_then_done() {
        // Tour 1 : lecture / prose sans outil → nudge générique.
        // Tour 2 : todo obligatoire.
        // Tour 3 : answering + done.
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nok, je commence.\n".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
            read_then_one_todo_turn("Je pose la liste."),
            done_turn("voici la réponse"),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("salut")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        // On doit voir au moins le texte du tour 1 ET le marqueur Done du tour 3.
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::TextDelta { text } if text.contains("je commence")))
        );
        assert!(events.iter().any(
            |e| matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Done)
        ));
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }

    #[tokio::test]
    async fn nudge_loops_until_max_iterations_when_done_never_emitted() {
        // Sprint A.2 : la seule règle de fin propre est `[phase: done]`. Si
        // le modèle ne le signale jamais, on relance jusqu'à atteindre
        // `max_iterations` (garde-fou unique). Le test borne explicitement
        // `max_iterations: 3` pour rester rapide, et fournit assez de tours
        // muets pour couvrir cette borne sans paniquer (`ScriptedLlm` panic
        // si on dépasse).
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\ntour 1 muet\n".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\ntour 2 muet\n".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\ntour 3 muet\n".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
        ]));
        let registry = Arc::new(ToolRegistry::new());
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let cfg = AgentConfig {
            max_iterations: 3,
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let raw: Vec<_> = agent.run("salut").collect::<Vec<_>>().await;
        let events: Vec<&AgentEvent> = raw.iter().filter_map(|r| r.as_ref().ok()).collect();

        // Les 3 tours ont été consommés (donc on a bien relancé à chaque
        // fois). Aucun `Done` n'a été émis, et la dernière entrée du stream
        // est l'erreur `MaxIterations(3)`.
        assert_eq!(
            events
                .iter()
                .filter(
                    |e| matches!(e, AgentEvent::TextDelta { text } if text.contains("muet"))
                )
                .count(),
            3,
            "les 3 tours muets doivent tous avoir été consommés"
        );
        assert!(
            !events
                .iter()
                .any(|e| matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Done)),
            "aucun `[phase: done]` n'a été émis, donc aucun PhaseEnter Done"
        );
        assert!(
            matches!(raw.last(), Some(Err(EngineError::MaxIterations(3)))),
            "le stream doit se terminer par MaxIterations(3), got {:?}",
            raw.last()
        );
    }

    /// Sprint Plan « un seul plan par run » — quand le modèle clôture toutes
    /// les étapes d'une liste puis tente d'en re-créer une nouvelle from
    /// scratch (ids inédits), le moteur rejette l'appel avec
    /// `TODO_RECREATION_BLOCKED` et laisse au modèle l'opportunité de
    /// re-soumettre avec les anciens items en `completed` + nouveaux items.
    #[tokio::test]
    async fn todo_recreation_after_all_completed_is_blocked() {
        let tu1 = ToolUseId::new();
        let tu2 = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            // Tour 1 : plan A à 1 item directement completed.
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nPlan A.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tu1.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [
                            { "id": "1", "content": "étape A", "status": "completed" }
                        ]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            // Tour 2 : tentative de re-création avec ids tout neufs (plan B).
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nPlan B from scratch.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tu2.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [
                            { "id": "10", "content": "étape B1", "status": "pending" },
                            { "id": "11", "content": "étape B2", "status": "in_progress" }
                        ]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            // Tour 3 : conformément au nudge, soumet plan A en completed
            // + plan B en pending → accepté, puis clôture.
            done_turn("OK"),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let raw: Vec<_> = agent.run("essai").collect::<Vec<_>>().await;
        // Attendu : un ToolFinish avec is_error: true pour le tu2 (le plan B),
        // contenant le message de re-création.
        let blocked = raw.iter().any(|ev| match ev {
            Ok(AgentEvent::ToolFinish {
                id,
                output,
                is_error,
            }) => {
                *is_error
                    && id == &tu2
                    && output
                        .to_string()
                        .contains("Blocked: you tried to **replace**")
            }
            _ => false,
        });
        assert!(
            blocked,
            "le tour 2 (plan B from scratch) devait être bloqué avec TODO_RECREATION_BLOCKED"
        );
    }

    /// Sprint Plan — anti-faux-positif : un `todo_write` qui **mette à jour**
    /// la liste (mêmes ids, statuts changés + nouveaux ids ajoutés) doit
    /// passer SANS rejet, même si la liste précédente était all-completed.
    #[tokio::test]
    async fn todo_extension_with_kept_ids_is_allowed_even_when_previous_was_completed() {
        let tu1 = ToolUseId::new();
        let tu2 = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nPlan A.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tu1.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [
                            { "id": "1", "content": "étape A", "status": "completed" }
                        ]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            // Tour 2 : reprend l'id "1" en completed + ajoute "2" en pending.
            // → extension légitime, doit passer.
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nExtension.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tu2.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [
                            { "id": "1", "content": "étape A", "status": "completed" },
                            { "id": "2", "content": "étape B", "status": "completed" }
                        ]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("OK"),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let raw: Vec<_> = agent.run("essai").collect::<Vec<_>>().await;
        let any_blocked = raw.iter().any(|ev| match ev {
            Ok(AgentEvent::ToolFinish {
                output,
                is_error: true,
                ..
            }) => output
                .to_string()
                .contains("Blocked: you tried to **replace**"),
            _ => false,
        });
        assert!(
            !any_blocked,
            "une extension légitime (ids communs préservés) ne doit pas être bloquée"
        );
    }

    /// Sprint Hotfix « boucle édition/lecture » — empreinte de texte assistant
    /// répétée à l'identique sur trois tours consécutifs. Attendu :
    /// 1er tour `Ok` (rien à comparer) → nudge structurel (DONE_ONLY) → reset.
    /// 2e tour `Warn` (1er strike) → nudge anti-boucle.
    /// 3e tour `Abort` → `EngineError::LoopDetected { kind: "text", turns: 3 }`.
    #[tokio::test]
    async fn repeated_assistant_text_triggers_loop_detected_after_nudge() {
        let same_turn = || {
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nje cherche…\n\
                           [phase: answering]\nVoici ce que je trouve.\n"
                        .into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ]
        };
        let llm = Arc::new(ScriptedLlm::new(vec![
            same_turn(),
            same_turn(),
            same_turn(),
        ]));
        let registry = Arc::new(ToolRegistry::new());
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        // `max_iterations` largement supérieur à 3 pour s'assurer que c'est
        // bien le `LoopDetector` qui clôt le run, pas le garde-fou.
        let mut cfg = AgentConfig {
            max_iterations: 12,
            ..AgentConfig::default()
        };
        cfg.engine_tuning.loop_strikes_before_abort = 1;
        cfg.engine_tuning.gate_done_requires_answering = true;
        cfg.engine_tuning.promotable_answer_min_chars = 10_000;
        let agent = Agent::new(llm, registry, ctx, cfg);

        let raw: Vec<_> = agent.run("explique").collect::<Vec<_>>().await;
        match raw.last() {
            Some(Err(EngineError::LoopDetected { kind, turns })) => {
                // Sans tool_calls dans les tours, les empreintes texte ET
                // tool_calls (= vide) coïncident toutes les deux → kind est
                // « both ». L'important est que la détection ait lieu.
                assert!(
                    *kind == "both" || *kind == "text",
                    "kind doit refléter une répétition de texte, got {kind:?}"
                );
                assert!(*turns >= 2, "au moins deux strikes consécutifs : got {turns}");
            }
            other => panic!("expected LoopDetected, got {other:?}"),
        }
    }

    /// Sprint Hotfix « boucle » — variation : le 2e tour est **différent** du
    /// 1er (donc on reset le compteur), et seuls les tours 2-3-4 sont
    /// identiques. Doit aussi déclencher `LoopDetected` (sur les tours 2-3
    /// puis abort au 4).
    #[tokio::test]
    async fn loop_detector_resets_when_intermediate_turn_differs() {
        let same_turn = || {
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\npar ici\n\
                           [phase: answering]\nrésultat identique\n"
                        .into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ]
        };
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nje commence\n\
                           [phase: answering]\nréponse #1\n"
                        .into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
            same_turn(),
            same_turn(),
            same_turn(),
            same_turn(),
            same_turn(),
        ]));
        let registry = Arc::new(ToolRegistry::new());
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let mut cfg = AgentConfig {
            max_iterations: 12,
            ..AgentConfig::default()
        };
        cfg.engine_tuning.loop_strikes_before_abort = 1;
        cfg.engine_tuning.gate_done_requires_answering = true;
        cfg.engine_tuning.promotable_answer_min_chars = 10_000;
        let agent = Agent::new(llm, registry, ctx, cfg);

        let raw: Vec<_> = agent.run("essaie").collect::<Vec<_>>().await;
        assert!(
            matches!(raw.last(), Some(Err(EngineError::LoopDetected { .. }))),
            "expected LoopDetected after 3 identical tail turns, got {:?}",
            raw.last()
        );
    }

    /// Sprint Hotfix « boucle » — anti-faux-positif : le détecteur ne doit
    /// PAS pénaliser un run normal qui converge en quelques tours différents.
    /// Le run minimal `reasoning + todo (1 completed) + answering + done`
    /// passe sans déclencher `LoopDetected`.
    #[tokio::test]
    async fn loop_detector_does_not_flag_legitimate_short_run() {
        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn("ok"),
            done_turn("OK."),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent.run("hi").collect::<Vec<_>>().await;
        assert!(
            !matches!(events.last(), Some(Err(EngineError::LoopDetected { .. }))),
            "un run normal ne doit pas se faire flagger comme boucle"
        );
        assert!(events.iter().any(|e| matches!(e, Ok(AgentEvent::Stop { .. }))));
    }

    #[tokio::test]
    async fn answering_phase_alone_does_not_terminate_loop() {
        // Important : `[phase: answering]` ne termine pas la boucle. Seul
        // `[phase: done]` ferme. Tour 1 : reasoning + answering sans done.
        // Tour 2 : todo obligatoire. Tour 3 : conforme.
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nPuis answering sans done.\n\
                           [phase: answering]\nVoici la réponse.\n"
                        .into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
            read_then_one_todo_turn("Liste minimale."),
            done_turn("Voici la réponse (confirmée)."),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("question")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let phases: Vec<Phase> = events
            .iter()
            .filter_map(|e| match e {
                AgentEvent::PhaseEnter { phase } => Some(*phase),
                _ => None,
            })
            .collect();
        assert!(phases.contains(&Phase::Answering));
        assert!(phases.contains(&Phase::Done));
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }

    #[tokio::test]
    async fn done_without_answering_promotes_substantial_text_without_second_llm_turn() {
        // Anti-doublon UI : analyse longue dans `reading` + `done` → promotion
        // `answering` côté événements, sans relancer le LLM.
        let long_analysis = "Voici l'analyse complète du projet avec suffisamment \
            de détails techniques pour dépasser le seuil de promotion automatique \
            côté moteur sans second tour LLM ni répétition visible pour l'utilisateur.";
        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn("Analyse demandée."),
            premature_done_turn(long_analysis),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("analyse")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let phases: Vec<Phase> = events
            .iter()
            .filter_map(|e| match e {
                AgentEvent::PhaseEnter { phase } => Some(*phase),
                _ => None,
            })
            .collect();
        assert!(phases.contains(&Phase::Reading));
        assert!(phases.contains(&Phase::Answering));
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }

    #[tokio::test]
    async fn done_without_answering_still_nudges_when_text_too_short() {
        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn("Analyse demandée."),
            premature_done_turn("OK."),
            done_turn(
                "Voici l'analyse complète du projet avec assez de contenu pour \
                 clôturer proprement dans la phase answering sans ambiguïté.",
            ),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("analyse")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let phases: Vec<Phase> = events
            .iter()
            .filter_map(|e| match e {
                AgentEvent::PhaseEnter { phase } => Some(*phase),
                _ => None,
            })
            .collect();
        assert!(phases.contains(&Phase::Answering));
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }

    #[tokio::test]
    async fn tool_call_without_prior_phase_synthesizes_fallback_phase() {
        // Sprint A.4 — filet de sécurité : sans marqueur, le moteur synthétise
        // une phase avant `ToolStart`. `echo` n'est pas listé dans `phase_for_tool`
        // comme read-only → inférence **Acting** (comportement actuel du moteur).
        let tu_bad = ToolUseId::new();
        let tu_todo = ToolUseId::new();
        let tu_echo = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::ToolCall {
                    id: tu_bad.clone(),
                    name: "echo".into(),
                    arguments: json!({}),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nEcho conforme.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tu_todo,
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Echo",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::ToolCall {
                    id: tu_echo.clone(),
                    name: "echo".into(),
                    arguments: json!({}),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("ok"),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(EchoTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            !events.iter().any(|e| matches!(
                e,
                AgentEvent::ToolFinish { id, is_error: true, .. } if id == &tu_bad
            )),
            "echo sans marqueur ne doit pas être en erreur ; events={events:?}"
        );
        assert!(
            events.iter().any(|e| matches!(
                e,
                AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tu_bad
            )),
            "premier echo doit réussir (phase synthétisée avant le tool) ; events={events:?}"
        );
        assert!(
            events.iter().any(|e| matches!(
                e,
                AgentEvent::ToolFinish { id, is_error: false, .. } if id == &tu_echo
            )),
            "deuxième echo doit réussir après flux conforme ; events={events:?}"
        );
        let idx_acting = events.iter().position(|e| {
            matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Acting)
        });
        let idx_first_echo = events.iter().position(|e| {
            matches!(e, AgentEvent::ToolStart { id, name, .. } if id == &tu_bad && name == "echo")
        });
        assert!(
            idx_acting.is_some()
                && idx_first_echo.is_some()
                && idx_acting < idx_first_echo,
            "PhaseEnter(Acting) synthétique doit précéder le premier ToolStart(echo) ; idx_acting={idx_acting:?} idx_first_echo={idx_first_echo:?} events={events:?}"
        );
    }

    /// Qwen3-Coder et consorts : `todo_write` en tout premier événement du
    /// tour sans marqueur de phase — le filet `phase_for_tool` injecte
    /// `Reading` avant `ToolStart` ; la gate todo/mutateur ne bloque pas.
    #[tokio::test]
    async fn opening_todo_write_without_marker_injects_reading_not_blocked() {
        let tid = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::ToolCall {
                    id: tid.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Saluer l'utilisateur",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: answering]\nSalut !\n[phase: done]".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("Salut")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            !events.iter().any(|e| matches!(
                e,
                AgentEvent::ToolFinish { is_error: true, .. }
            )),
            "todo_write en tête de tour ne doit pas être bloqué ; events={events:?}"
        );
        let idx_reading = events.iter().position(|e| {
            matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Reading)
        });
        let idx_todo = events.iter().position(|e| {
            matches!(e, AgentEvent::ToolStart { name, .. } if name == "todo_write")
        });
        assert!(
            idx_reading.is_some() && idx_todo.is_some() && idx_reading < idx_todo,
            "PhaseEnter(Reading) synthétique doit précéder ToolStart(todo_write) ; idx_reading={idx_reading:?} idx_todo={idx_todo:?} events={events:?}"
        );
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }

    /// Format-check du helper `step_by_step_todo_nudge` : il doit nommer le
    /// compte d'outils mutateurs, les compteurs `pending` / `in_progress`, et
    /// rappeler le bon mantra ("one `todo_write` per real step transition").
    #[test]
    fn step_by_step_nudge_message_mentions_counters_and_principle() {
        let msg = step_by_step_todo_nudge(3, 4, 1);
        assert!(msg.contains("3 mutating tools"), "msg={msg}");
        assert!(msg.contains("4 pending"), "msg={msg}");
        assert!(msg.contains("1 in_progress"), "msg={msg}");
        assert!(msg.contains("todo_write"), "msg={msg}");
        assert!(
            msg.contains("step transition") || msg.contains("step-by-step"),
            "le nudge doit rappeler la granularité step-by-step ; msg={msg}"
        );
    }

    /// Anti-régression : scénario réel observé sur GLM-4.7-Flash — le modèle
    /// crée un plan de 3 étapes puis enchaîne 3 outils mutateurs sans MAJ
    /// intermédiaire. Le filet moteur doit injecter un nudge `step_by_step`
    /// SANS bloquer le run (le tour avec les outils est accepté ; le nudge
    /// influence le tour suivant). Le test vérifie surtout que la séquence
    /// arrive à `Stop` propre, et que les outils mutateurs sont bien exécutés.
    #[allow(clippy::too_many_lines)]
    #[tokio::test]
    async fn run_completes_when_model_batches_mutating_tools_then_updates_todo() {
        let tu_todo_open = ToolUseId::new();
        let tu_bash_1 = ToolUseId::new();
        let tu_bash_2 = ToolUseId::new();
        let tu_todo_close = ToolUseId::new();

        let llm = Arc::new(ScriptedLlm::new(vec![
            // Tour 1 : reasoning + plan en 2 étapes (in_progress + pending).
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nJe planifie en 2 étapes.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tu_todo_open.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [
                            { "id": "1", "content": "Étape 1", "status": "in_progress" },
                            { "id": "2", "content": "Étape 2", "status": "pending" }
                        ]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            // Tour 2 : deux `bash` à la suite sans `todo_write` intercalé →
            // le moteur va injecter `step_by_step_todo_nudge` en fin de tour.
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: acting]\nLes deux étapes en backend.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tu_bash_1.clone(),
                    name: "bash".into(),
                    arguments: json!({ "cmd": "echo step1" }),
                },
                StreamEvent::ToolCall {
                    id: tu_bash_2.clone(),
                    name: "bash".into(),
                    arguments: json!({ "cmd": "echo step2" }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            // Tour 3 : le modèle reçoit le nudge, ferme la todo proprement
            // puis émet answering + done.
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: acting]\nJe mets à jour la todo.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tu_todo_close.clone(),
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [
                            { "id": "1", "content": "Étape 1", "status": "completed" },
                            { "id": "2", "content": "Étape 2", "status": "completed" }
                        ]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            // Tour 4 : answering + done.
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: answering]\nTerminé.\n[phase: done]".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(FakeBashTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("fais le job")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let bash_finishes = events
            .iter()
            .filter(|e| matches!(
                e,
                AgentEvent::ToolFinish { is_error: false, .. }
            ))
            .filter(|e| {
                if let AgentEvent::ToolFinish { id, .. } = e {
                    [&tu_bash_1, &tu_bash_2].contains(&id)
                } else {
                    false
                }
            })
            .count();
        assert_eq!(
            bash_finishes, 2,
            "les 2 bash batched doivent quand même s'exécuter (le nudge ne bloque pas) ; events={events:?}"
        );

        let todo_finishes = events
            .iter()
            .filter(|e| matches!(
                e,
                AgentEvent::ToolFinish { is_error: false, .. }
            ))
            .filter(|e| {
                if let AgentEvent::ToolFinish { id, .. } = e {
                    [&tu_todo_open, &tu_todo_close].contains(&id)
                } else {
                    false
                }
            })
            .count();
        assert_eq!(
            todo_finishes, 2,
            "les 2 todo_write (ouvert + clôture) doivent réussir ; events={events:?}"
        );

        assert!(
            matches!(events.last(), Some(AgentEvent::Stop { .. })),
            "le run doit clôturer proprement après le nudge ; events={events:?}"
        );
    }

    /// Anti-régression du bug « 2× réponse + 1 todo » observé sur GLM-4.7-Flash :
    /// quand le modèle a déjà rédigé sa réponse dans `[phase: answering]`
    /// mais a omis le `[phase: done]`, le nudge envoyé doit être minimaliste
    /// (« émets juste `[phase: done]` ») et NON le `NUDGE_PROMPT` générique
    /// qui demande de « write your final user-facing response » et provoque
    /// la duplication.
    #[tokio::test]
    async fn forgotten_done_after_answering_uses_minimal_nudge() {
        let llm = Arc::new(ScriptedLlm::new(vec![
            // Tour 1 : reasoning + answering, mais PAS de [phase: done].
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nSalutation triviale.\n\
                           [phase: answering]\nSalut ! Je suis prêt à t'aider."
                        .into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
            // Tour 2 : le modèle obéit au nudge minimal et émet juste `done`.
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: done]".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("Salut")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        // Le tour 2 ne doit PAS contenir de nouveau TextDelta avec « Salut »
        // (sinon = duplication). On vérifie que le texte « Salut ! Je suis
        // prêt » apparaît une seule fois dans tout le flux d'events.
        let salut_occurrences = events
            .iter()
            .filter(|e| {
                matches!(
                    e,
                    AgentEvent::TextDelta { text } if text.contains("Salut !")
                )
            })
            .count();
        assert_eq!(
            salut_occurrences, 1,
            "la réponse ne doit apparaître qu'UNE fois (pas de double-rédaction) ; \
             events={events:?}"
        );
        assert!(
            matches!(events.last(), Some(AgentEvent::Stop { .. })),
            "le run doit finir par Stop ; events={events:?}"
        );
    }

    /// Anti-régression : sur un simple « Salut », le moteur DOIT accepter
    /// `[phase: reading] → [phase: answering] → [phase: done]` sans
    /// `todo_write`. La gate qui exigeait `todo_write` avant `done` causait
    /// une boucle infinie (le modèle ré-écrivait sa salutation à chaque
    /// nudge `MISSING_TODO_WRITE_PROMPT`). Voir issue conversationnelle 2026-05-13.
    #[tokio::test]
    async fn done_accepted_for_pure_conversation_without_todo_write() {
        let llm = Arc::new(ScriptedLlm::new(vec![vec![
            StreamEvent::Start,
            StreamEvent::TextDelta {
                text: "[phase: reading]\nSalutation triviale.\n\
                       [phase: answering]\nSalut ! Comment puis-je t'aider ?\n\
                       [phase: done]"
                    .into(),
            },
            StreamEvent::Stop {
                reason: StopReason::EndTurn,
                usage: Usage::default(),
            },
        ]]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("Salut")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let todo_starts = events
            .iter()
            .filter(|e| matches!(e, AgentEvent::ToolStart { name, .. } if name == "todo_write"))
            .count();
        assert_eq!(
            todo_starts, 0,
            "aucun todo_write ne doit être déclenché pour une conversation triviale ; \
             events={events:?}",
        );
        let stops = events
            .iter()
            .filter(|e| matches!(e, AgentEvent::Stop { .. }))
            .count();
        assert_eq!(
            stops, 1,
            "le moteur doit clôturer en UN seul tour pour une salutation \
             (la boucle infinie vient d'une absence de Stop) ; events={events:?}",
        );
        assert!(
            matches!(events.last(), Some(AgentEvent::Stop { .. })),
            "le dernier événement doit être Stop ; events={events:?}",
        );
    }

    #[tokio::test]
    async fn tool_call_after_explicit_phase_does_not_synthesize() {
        // Le modèle déclare `reading` puis `planning` avant echo : pas de
        // phase synthétisée avant le tool. `todo_write` d'abord.
        let tu_todo = ToolUseId::new();
        let tu_echo = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nCadrage.\n[phase: planning]\nOn liste d'abord.\n"
                        .into(),
                },
                StreamEvent::ToolCall {
                    id: tu_todo,
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Echo test",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::ToolCall {
                    id: tu_echo.clone(),
                    name: "echo".into(),
                    arguments: json!({}),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("ok"),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(EchoTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let phases: Vec<Phase> = events
            .iter()
            .filter_map(|e| match e {
                AgentEvent::PhaseEnter { phase } => Some(*phase),
                _ => None,
            })
            .collect();
        assert_eq!(
            phases.first().copied(),
            Some(Phase::Reading),
            "first explicit marker must be reading, got {phases:?}"
        );
        assert!(
            phases.contains(&Phase::Planning),
            "expected Planning phase in {phases:?}"
        );
    }

    #[tokio::test]
    async fn synthesized_reading_for_glob_classifies_correctly() {
        // Tour 1 : glob seul (todo pas encore posée) — autorisé ; phase synthétisée Reading.
        // Tour 2 : todo. Tour 3 : glob sans marqueur → synthèse Reading.
        let tu1 = ToolUseId::new();
        let tu3 = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::ToolCall {
                    id: tu1.clone(),
                    name: "glob".into(),
                    arguments: json!({ "pattern": "*" }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            read_then_one_todo_turn("Lister le repo."),
            vec![
                StreamEvent::Start,
                StreamEvent::ToolCall {
                    id: tu3.clone(),
                    name: "glob".into(),
                    arguments: json!({ "pattern": "*" }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("vu"),
        ]));
        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let glob_phase = events
            .iter()
            .enumerate()
            .filter(|(_, e)| matches!(e, AgentEvent::ToolStart { name, .. } if name == "glob"))
            .find_map(|(i, _)| {
                (0..i).rev().find_map(|j| match &events[j] {
                    AgentEvent::PhaseEnter { phase } => Some(*phase),
                    _ => None,
                })
            })
            .expect("glob doit être précédé d'un PhaseEnter");
        assert_eq!(glob_phase, Phase::Reading, "glob orphelin → Reading");
    }

    #[tokio::test]
    async fn silent_turn_after_tool_call_still_nudges_to_done() {
        // Après todo obligatoire : tours muets avec reasoning, puis echo,
        // puis encore muet, puis done.
        let tid_echo = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn("Démarrage."),
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nréflexion sans action\n".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nJ'appelle echo.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid_echo.clone(),
                    name: "echo".into(),
                    arguments: json!({}),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nencore une réflexion sans action\n".into(),
                },
                StreamEvent::Stop {
                    reason: StopReason::EndTurn,
                    usage: Usage::default(),
                },
            ],
            done_turn("résultat final"),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        registry.register(Arc::new(EchoTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert_eq!(
            events
                .iter()
                .filter(|e| {
                    matches!(e, AgentEvent::ToolStart { name, .. } if name == "echo")
                })
                .count(),
            1
        );
        assert!(events.iter().any(
            |e| matches!(e, AgentEvent::PhaseEnter { phase } if *phase == Phase::Done)
        ));
    }

    // ---------------------------------------------------------------------
    // Sprint M1 — tests d'intégration mémoire de session.
    // ---------------------------------------------------------------------

    /// Construit un tour LLM de compaction : produit un markdown au format
    /// `## Objective\n…\n## Files touched\n- …`. Sert à fournir un résultat
    /// déterministe au pipeline `summarize_run` qui sera appelé par
    /// `maybe_persist_session` à la fin du run.
    fn compaction_turn(objective: &str, files: &[&str]) -> Vec<StreamEvent> {
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

    fn memory_runtime_for_test(
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

    /// Run terminé par `[phase: done]` sans compaction live → pas d'archive auto.
    #[tokio::test]
    async fn session_not_persisted_at_done_without_live_compaction() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

        // Trois scripts dans l'ordre : (1) reasoning + todo_write,
        // (2) answering + done, (3) compaction.
        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn("On va faire X."),
            done_turn("Voici le résultat."),
            compaction_turn("Refactorer le module X", &["src/x.rs", "src/y.rs"]),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(ws.clone(), false);
        let cfg = AgentConfig {
            memory: Some(memory_runtime_for_test(&ws, llm.clone())),
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let events: Vec<_> = agent
            .run("Refactorer le module X")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            !events
                .iter()
                .any(|e| matches!(e, AgentEvent::MemoryPersisted { .. })),
            "done seul ne doit pas archiver ; events={events:?}"
        );
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }

    /// Clôture du plan todo : pas d'archive automatique (uniquement compaction live).
    #[tokio::test]
    async fn memory_not_persisted_when_todo_plan_closes_before_done() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

        let close_tid = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            read_then_one_todo_turn_with_status("Ouverture plan", "in_progress"),
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: acting]\nClôture.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: close_tid,
                    name: "todo_write".into(),
                    arguments: json!({
                        "todos": [{
                            "id": "1",
                            "content": "Étape de test",
                            "status": "completed"
                        }]
                    }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            compaction_turn("Jalon : plan fermé", &["src/a.rs"]),
            done_turn("Réponse finale."),
            compaction_turn("Run terminé", &["src/b.rs"]),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(TodoWriteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(ws.clone(), false);
        let cfg = AgentConfig {
            memory: Some(memory_runtime_for_test(&ws, llm.clone())),
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let events: Vec<_> = agent
            .run("Tâche avec plan")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        let n_mem: usize = events
            .iter()
            .filter(|e| matches!(e, AgentEvent::MemoryPersisted { .. }))
            .count();
        assert_eq!(
            n_mem, 0,
            "jalon todo + done ne doivent pas archiver ; events={events:?}"
        );
    }

    /// Le modèle ne doit pas pouvoir exécuter `session_end` (réservé
    /// `/session_end` utilisateur) même si le tool est dans le registre.
    #[tokio::test]
    async fn session_end_tool_call_from_model_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let tid = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\n".into(),
                },
                StreamEvent::ToolCall {
                    id: tid.clone(),
                    name: "session_end".into(),
                    arguments: json!({}),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("Je continue sans clôturer la session."),
        ]));

        let registry = Arc::new(ToolRegistry::with_simple_tools());
        let ctx = ToolContext::new(ws, false);
        let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

        let events: Vec<_> = agent
            .run("test")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::ToolFinish { is_error: true, .. })),
            "session_end doit échouer côté moteur ; events={events:?}"
        );
    }

    /// Run trivial (juste answering + done, aucun outil appelé) → **pas**
    /// de persistance, pas d'événement `MemoryPersisted`, et le dossier
    /// `.drox/memory/sessions/` peut rester vide.
    #[tokio::test]
    async fn trivial_run_does_not_persist_session() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

        // Un seul tour : answering + done, sans tool. Pas de script de
        // compaction nécessaire — il ne sera pas appelé.
        let llm = Arc::new(ScriptedLlm::new(vec![done_turn("Salut !")]));

        let registry = Arc::new(ToolRegistry::new());
        let ctx = ToolContext::new(ws.clone(), false);
        let cfg = AgentConfig {
            memory: Some(memory_runtime_for_test(&ws, llm.clone())),
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let events: Vec<_> = agent
            .run("Salut")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            !events
                .iter()
                .any(|e| matches!(e, AgentEvent::MemoryPersisted { .. })),
            "trivial conversational run must NOT persist memory; events={events:?}"
        );
        let sessions_dir = ws.join(".drox/memory/sessions");
        if sessions_dir.exists() {
            let count = std::fs::read_dir(sessions_dir.as_std_path())
                .unwrap()
                .count();
            assert_eq!(count, 0, "sessions/ dir must be empty after trivial run");
        }
    }

    /// Tracker éligibilité : un `session_note` épinglé suffit à rendre le
    /// run non trivial même sans aucun tool mutateur (cas « conversation
    /// utile mais sans modification de code »).
    #[tokio::test]
    async fn pinned_session_note_alone_does_not_persist_without_live_compaction() {
        use drox_tools::SessionNoteTool;

        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

        // Tour 1 : reasoning + session_note (note seule, pas de todo, pas
        // de mutation). Tour 2 : answering + done. Tour 3 : compaction.
        let note_tid = ToolUseId::new();
        let llm = Arc::new(ScriptedLlm::new(vec![
            vec![
                StreamEvent::Start,
                StreamEvent::TextDelta {
                    text: "[phase: reading]\nJe pose une note.\n".into(),
                },
                StreamEvent::ToolCall {
                    id: note_tid,
                    name: "session_note".into(),
                    arguments: json!({ "content": "Hypothèse: revoir la stratégie de cache" }),
                },
                StreamEvent::Stop {
                    reason: StopReason::ToolUse,
                    usage: Usage::default(),
                },
            ],
            done_turn("OK noté."),
            compaction_turn("Note technique", &[]),
        ]));

        let mut registry = ToolRegistry::new();
        registry.register(Arc::new(SessionNoteTool));
        let registry = Arc::new(registry);
        let ctx = ToolContext::new(ws.clone(), false);
        let cfg = AgentConfig {
            memory: Some(memory_runtime_for_test(&ws, llm.clone())),
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let events: Vec<_> = agent
            .run("Note rapide")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            !events
                .iter()
                .any(|e| matches!(e, AgentEvent::MemoryPersisted { .. })),
            "session_note seul + done sans compaction live ne doit pas archiver; events={events:?}"
        );
    }

    /// M2 — compaction proactive : au premier tour, si le budget dépasse le
    /// seuil `autocompact`, le moteur appelle `summarize_run` puis réécrit
    /// l'historique et émet `ContextCompacted` avant le tour LLM principal.
    #[tokio::test]
    async fn live_compaction_emits_context_compacted_when_over_budget() {
        let dir = tempfile::tempdir().unwrap();
        let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();

        let history: Vec<Message> = (0..14)
            .map(|_| Message::user("z".repeat(10_000)))
            .collect();

        let llm = Arc::new(ScriptedLlm::new(vec![
            compaction_turn("Résumé intermédiaire", &["src/a.rs"]),
            done_turn("Terminé."),
        ]));

        let registry = Arc::new(ToolRegistry::new());
        let ctx = ToolContext::new(ws.clone(), false);
        let cfg = AgentConfig {
            system_prompt: Some("Tu es un assistant.".into()),
            context: Some(ContextPolicy::new(
                Arc::new(RoughTokenCounter::new(4)),
                ContextBudget {
                    window_size: 25_000,
                    reserved_output: 0,
                    autocompact_buffer: 5_000,
                    warning_buffer: 4_000,
                    error_buffer: 4_000,
                    manual_compact_buffer: 500,
                },
                None,
            )),
            memory: Some(memory_runtime_for_test(&ws, llm.clone())),
            transcript_session_id: Some("ses_test_compact".into()),
            workspace_fingerprint: ws.to_string(),
            ..AgentConfig::default()
        };
        let agent = Agent::new(llm, registry, ctx, cfg);

        let events: Vec<_> = agent
            .run_with_history(history, "suite")
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<_, _>>()
            .unwrap();

        assert!(
            events.iter().any(|e| matches!(e, AgentEvent::ContextCompacted { .. })),
            "expected ContextCompacted in stream; events={events:?}"
        );
        let compact = events.iter().find_map(|e| {
            if let AgentEvent::ContextCompacted {
                context_chunk_summary,
                ..
            } = e
            {
                context_chunk_summary.as_ref()
            } else {
                None
            }
        });
        assert!(
            compact.is_some_and(|c| {
                c.summary_text.contains("Résumé intermédiaire")
                    && c.transcript_session_id == "ses_test_compact"
                    && c.compaction_seq == 1
            }),
            "expected populated context_chunk_summary; compact={compact:?}"
        );
        let sessions_dir = ws.join(".drox/memory/sessions");
        let session_files: Vec<_> = std::fs::read_dir(sessions_dir.as_std_path())
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(session_files.len(), 1, "one session .md expected");
        let body = std::fs::read_to_string(session_files[0].path()).unwrap();
        assert!(
            body.contains("Résumé intermédiaire") && body.contains("src/a.rs"),
            "persisted session must reuse live compaction body, got:\n{body}"
        );
        if let Some(AgentEvent::ContextCompacted {
            tokens_before,
            tokens_after,
            ..
        }) = events.iter().find(|e| matches!(e, AgentEvent::ContextCompacted { .. }))
        {
            assert!(
                *tokens_after * 2 < *tokens_before,
                "compaction should at least halve token estimate (before={tokens_before}, after={tokens_after})"
            );
        }
        let compact_idx = events
            .iter()
            .position(|e| matches!(e, AgentEvent::ContextCompacted { .. }))
            .expect("ContextCompacted expected");
        let mem_idx = events
            .iter()
            .position(|e| matches!(e, AgentEvent::MemoryPersisted { .. }))
            .expect("MemoryPersisted expected after live compaction");
        assert!(
            mem_idx > compact_idx,
            "archive après compaction live ; events={events:?}"
        );
        assert!(matches!(events.last(), Some(AgentEvent::Stop { .. })));
    }
}
