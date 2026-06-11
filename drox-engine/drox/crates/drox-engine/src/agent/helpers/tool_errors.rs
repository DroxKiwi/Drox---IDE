use drox_tools::{ToolContext, UserQuestion};
use drox_types::{Message, ToolUseId};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tracing::warn;

use crate::agent::stream::PendingToolCall;
use crate::event::AgentEvent;
use crate::error::EngineError;

/// Pose une question oui/non Ã  l'humain via `UserAsker`. Retourne `false`
/// si pas d'asker disponible (fallback : refus) ou si l'humain refuse.
pub(crate) async fn confirm_with_user(
    ctx: &ToolContext,
    tool_name: &str,
    args: &Value,
    permission_message: &str,
) -> bool {
    let Some(asker) = ctx.user_asker.as_ref() else {
        warn!(tool = %tool_name, "Ask requis mais aucun UserAsker configurÃ© â†’ refus");
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
            warn!(?err, "asker a renvoyÃ© une erreur â†’ refus");
            false
        }
    }
}

/// Compte les Ã©checs consÃ©cutifs de `ask_user_question` pour le filet Â§2.21.
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

/// Pousse un `ToolFinish { is_error: true }` cÃ´tÃ© stream + un `tool_result`
/// d'erreur cÃ´tÃ© historique de messages.
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
