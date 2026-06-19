use drox_tools::{ToolContext, UserQuestion};
use drox_types::{Message, ToolUseId};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tracing::warn;

use crate::agent::stream::PendingToolCall;
use crate::agent::ArchitectRunState;
use crate::event::AgentEvent;
use crate::error::EngineError;

#[cfg(windows)]
use crate::agent::gates::verify_bash_failure_hint;

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
    architect_state: Option<&ArchitectRunState>,
) -> Result<(), ()> {
    if call.name == "ask_user_question" {
        *ask_failure_streak = ask_failure_streak.saturating_add(1);
    }
    push_tool_error(
        tx,
        messages,
        &call.id,
        enrich_tool_error_message(&call.name, &message, call, architect_state),
    )
    .await
}

/// Append schema hints for common tool failures (B-MOTOR-07).
#[must_use]
pub(crate) fn enrich_tool_error_message(
    tool_name: &str,
    message: &str,
    call: &PendingToolCall,
    architect_state: Option<&ArchitectRunState>,
) -> String {
    let lower = message.to_ascii_lowercase();
    let static_hint = match tool_name {
        "file_edit" if lower.contains("old_string not found") => {
            Some("\n\nHint: `file_read` the file first; match `old_string` exactly (including whitespace).")
        }
        "file_edit" if lower.contains("edits must not be empty") || lower.contains("requires") => {
            Some("\n\nHint: use `{ \"path\": \"…\", \"edits\": [{ \"old_string\": \"…\", \"new_string\": \"…\" }] }`.")
        }
        "file_write" if lower.contains("requires string fields") || lower.contains("path") => {
            Some(
                "\n\nHint: use `{ \"path\": \"relative/path\", \"content\": \"full file text\" }`. \
                 If the file is large, write a shorter version first, then extend with `file_edit`.",
            )
        }
        "internal_plan_write" if lower.contains("steps") => {
            Some("\n\nHint: `{ \"steps\": [{ \"id\": \"s1\", \"action\": \"…\", \"status\": \"pending\" }] }`.")
        }
        "bash" => bash_tool_error_hint(message),
        _ => None,
    };
    if let Some(hint) = static_hint {
        return format!("{message}{hint}");
    }

    if matches!(tool_name, "file_read" | "grep" | "file_edit" | "file_write")
        && path_io_failure(&lower)
    {
        return format!("{message}{}", path_tool_error_hint(tool_name, call, architect_state));
    }

    message.to_string()
}

#[must_use]
fn path_io_failure(lower: &str) -> bool {
    lower.contains("no such file")
        || lower.contains("cannot find")
        || lower.contains("not found")
        || lower.contains("path escape")
        || lower.contains("io error")
        || lower.contains("os error 2")
        || lower.contains("os error 3")
}

#[must_use]
fn path_tool_error_hint(
    tool_name: &str,
    call: &PendingToolCall,
    architect_state: Option<&ArchitectRunState>,
) -> String {
    let attempted = call
        .arguments
        .get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let mut hint = String::from(
        "\n\nHint: use a **workspace-relative** path (e.g. `app-kdds-main/src/...`), \
         never `/workspace/...` or an absolute path outside the workspace.",
    );
    if attempted.contains("/workspace/") || attempted.starts_with("workspace/") {
        hint.push_str(" Strip the `/workspace/` prefix and retry.");
    }
    if let Some(target) = architect_state.and_then(|s| s.diagnostic_target.as_ref()) {
        hint.push_str(&format!(
            "\nResolved diagnostic target: `{}` — try `file_read` on that path first.",
            target.display_line()
        ));
    } else if tool_name == "file_read" {
        hint.push_str(" Call `workspace_map_read` once if the relative path is still unknown.");
    }
    hint
}

#[must_use]
fn bash_tool_error_hint(message: &str) -> Option<&'static str> {
    #[cfg(windows)]
    {
        if let Some(hint) = verify_bash_failure_hint(message) {
            return Some(hint);
        }
    }
    let _ = message;
    None
}

#[cfg(test)]
mod enrich_tests {
    use super::*;
    use crate::agent::diagnostic_target::DiagnosticTarget;
    use drox_types::ToolUseId;

    fn empty_call() -> PendingToolCall {
        PendingToolCall {
            id: ToolUseId::new(),
            name: "file_read".into(),
            arguments: json!({ "path": "/workspace/app/src/foo.tsx" }),
        }
    }

    #[test]
    fn file_edit_empty_edits_includes_example() {
        let msg = enrich_tool_error_message(
            "file_edit",
            "edits must not be empty",
            &empty_call(),
            None,
        );
        assert!(msg.contains("old_string"));
    }

    #[test]
    fn file_read_io_error_suggests_relative_path() {
        let msg = enrich_tool_error_message(
            "file_read",
            "io error: no such file",
            &empty_call(),
            None,
        );
        assert!(msg.contains("workspace-relative"));
        assert!(msg.contains("/workspace/"));
    }

    #[test]
    fn file_read_io_error_includes_diagnostic_target() {
        let mut st = ArchitectRunState::new();
        st.diagnostic_target = Some(DiagnosticTarget {
            workspace_relative_path: "app-kdds-main/src/foo.tsx".into(),
            line: Some(92),
            column: None,
        });
        let msg = enrich_tool_error_message(
            "file_read",
            "cannot find path",
            &empty_call(),
            Some(&st),
        );
        assert!(msg.contains("app-kdds-main/src/foo.tsx:92"));
    }

    #[test]
    fn bash_windows_hint_when_stderr_matches() {
        if !cfg!(windows) {
            return;
        }
        let msg = enrich_tool_error_message(
            "bash",
            "Select-Object : not recognized",
            &empty_call(),
            None,
        );
        assert!(msg.contains("Select-Object") || msg.contains("PowerShell"));
    }
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
