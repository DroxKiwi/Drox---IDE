//! Helpers de dispatch : erreurs outil, confirmation, specs LLM, workspace map.

use drox_llm::ToolSpec;
use drox_tools::{ToolContext, ToolRegistry, UserQuestion};
use drox_types::{Content, Message, Role, ToolUseId};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tracing::warn;

use crate::error::EngineError;
use crate::event::AgentEvent;

use super::loop_detect::PendingToolCall;

/// Corps du message `role = tool` renvoyé au LLM après exécution réussie.
///
/// Sans balisage explicite, certains modèles prennent un gros JSON (sortie
/// `glob`, `grep`, etc.) pour un « collage » utilisateur arbitraire au lieu
/// du résultat structuré de leur propre appel d'outil.
pub(crate) fn format_tool_result_for_llm(tool_name: &str, value: &Value) -> String {
    let serialized = serde_json::to_string(value).unwrap_or_default();
    format!(
        "[drox: tool result for «{tool_name}» — JSON below; this is NOT a user message]\n{serialized}",
    )
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
pub(crate) async fn push_tool_error(
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
pub(crate) fn first_user_text(messages: &[Message]) -> Option<String> {
    for m in messages {
        if !matches!(m.role, Role::User) {
            continue;
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
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

/// Construit la liste des `ToolSpec` à partir du registre.
///
/// Certains outils restent enregistrés pour exécution côté client / CLI
/// mais ne doivent **pas** être visibles du LLM (`session_end` : réservé
/// à la commande utilisateur `/session_end`).
pub(crate) fn build_tool_specs(registry: &ToolRegistry, professor: bool) -> Vec<ToolSpec> {
    const HIDDEN_FROM_LLM: &[&str] = &["session_end"];
    let has_mcp_stubs = registry
        .names()
        .iter()
        .any(|n| n.starts_with("mcp__"));
    let mut specs = Vec::new();
    for name in registry.names() {
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
            specs.push(ToolSpec {
                name: tool.name().to_string(),
                description: tool.description().to_string(),
                parameters: tool.input_schema(),
            });
        }
    }
    specs
}
