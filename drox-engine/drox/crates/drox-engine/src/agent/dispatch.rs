//! Helpers de dispatch : erreurs outil, confirmation, specs LLM, workspace map.

use camino::Utf8Path;
use drox_llm::ToolSpec;
use drox_tools::{ToolContext, ToolRegistry, UserQuestion};
use drox_types::{Content, Message, Role, ToolUseId};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tracing::warn;

use crate::error::EngineError;
use crate::event::AgentEvent;

use super::loop_detect::PendingToolCall;

/// Au-delà de ce seuil, le JSON outil est spillé sur disque (1.6.0 T-1).
pub(crate) const TOOL_RESULT_SPILL_THRESHOLD_BYTES: usize = 48 * 1024;

const TOOL_RESULT_PREVIEW_BYTES: usize = 2 * 1024;

/// Corps du message `role = tool` renvoyé au LLM après exécution réussie.
///
/// Sans balisage explicite, certains modèles prennent un gros JSON (sortie
/// `glob`, `grep`, etc.) pour un « collage » utilisateur arbitraire au lieu
/// du résultat structuré de leur propre appel d'outil.
///
/// 1.6.0 T-1 : au-delà de [`TOOL_RESULT_SPILL_THRESHOLD_BYTES`], le body est
/// écrit sous `.drox/tool-outputs/` et le prompt ne reçoit qu'un pointeur.
pub(crate) fn format_tool_result_for_llm(
    tool_name: &str,
    value: &Value,
    workspace_root: &Utf8Path,
) -> String {
    let serialized = serde_json::to_string(value).unwrap_or_default();
    if serialized.len() <= TOOL_RESULT_SPILL_THRESHOLD_BYTES {
        return format!(
            "[drox: tool result for «{tool_name}» — JSON below; this is NOT a user message]\n{serialized}",
        );
    }
    match spill_tool_result_to_disk(workspace_root, tool_name, &serialized) {
        Ok(path) => {
            let preview_len = serialized.len().min(TOOL_RESULT_PREVIEW_BYTES);
            let preview = &serialized[..preview_len];
            format!(
                "[drox: tool result for «{tool_name}» — LARGE OUTPUT SPILLED TO DISK]\n\
                 Full JSON ({bytes} bytes) written to: {path}\n\
                 Preview (first {preview_len} bytes):\n{preview}\n\
                 Use `file_read` (or shell head/tail) on that path if you need more detail. \
                 Do NOT re-call the same tool just to re-fetch this blob.",
                bytes = serialized.len(),
            )
        }
        Err(e) => {
            warn!(
                tool = %tool_name,
                error = %e,
                "tool result spill failed — truncating inline"
            );
            let truncated = &serialized[..serialized.len().min(TOOL_RESULT_SPILL_THRESHOLD_BYTES)];
            format!(
                "[drox: tool result for «{tool_name}» — LARGE OUTPUT TRUNCATED (spill failed: {e})]\n\
                 {truncated}\n…[truncated]"
            )
        }
    }
}

fn spill_tool_result_to_disk(
    workspace_root: &Utf8Path,
    tool_name: &str,
    body: &str,
) -> std::io::Result<String> {
    let dir = workspace_root.join(".drox").join("tool-outputs");
    std::fs::create_dir_all(dir.as_std_path())?;
    let safe: String = tool_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
    let file_name = format!("{stamp}-{safe}.json");
    let path = dir.join(&file_name);
    std::fs::write(path.as_std_path(), body)?;
    Ok(path.to_string())
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
