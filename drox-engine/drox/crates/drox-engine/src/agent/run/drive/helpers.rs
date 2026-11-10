//! Aides pures de la boucle : probe d'historique, skip bash, échec d'apply.

use drox_tools::ToolError;
use drox_types::{Content, Message, Role};
use serde_json::Value;

use super::super::super::loop_detect::PendingToolCall;
use crate::event::HistoryProbeEntry;

pub(super) fn history_probe_snapshot(messages: &[Message]) -> Vec<HistoryProbeEntry> {
    messages
        .iter()
        .map(|message| {
            let mut chars = 0usize;
            let mut text = String::new();
            let mut tools = Vec::new();
            for block in &message.content {
                match block {
                    Content::Text { text: block_text } => {
                        chars += block_text.chars().count();
                        text.push_str(block_text);
                    }
                    Content::ToolUse { name, input, .. } => {
                        tools.push(name.clone());
                        let rendered = input.to_string();
                        chars += rendered.chars().count();
                        text.push_str(&rendered);
                    }
                    Content::ToolResult { content, .. } => {
                        chars += content.chars().count();
                        text.push_str(content);
                    }
                    Content::Image { data, .. } => chars += data.len(),
                    _ => {}
                }
            }
            HistoryProbeEntry {
                role: match message.role {
                    Role::System => "system",
                    Role::User => "user",
                    Role::Assistant => "assistant",
                    Role::Tool => "tool",
                }
                .to_string(),
                chars,
                head: text.chars().take(240).collect(),
                text,
                tools,
            }
        })
        .collect()
}

/// One-shot: the user clicked Skip before this `bash` started. Do not spawn it.
pub(super) fn bash_stopped_if_requested(
    call: &PendingToolCall,
) -> Option<Result<Value, ToolError>> {
    if call.name != "bash" || !drox_tools::take_bash_user_stop() {
        return None;
    }
    let command = call
        .arguments
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or("");
    Some(Ok(drox_tools::bash_user_stopped_output(command)))
}

pub(super) fn tool_apply_failed(value: &Value) -> bool {
    value.get("applied").and_then(Value::as_bool) == Some(false)
}
