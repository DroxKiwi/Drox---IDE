//! Gate `todo_write` architecte — validation payload uniquement.

use drox_tools::normalize_todo_write_payload;
use serde_json::Value;

use crate::agent::nudges::{TODO_WRITE_EMPTY_TODOS, TODO_WRITE_MISSING_TODOS};

const PAYLOAD_PREVIEW_MAX: usize = 240;

#[must_use]
fn payload_preview(arguments: &Value) -> String {
    let raw = arguments.to_string();
    if raw.chars().count() <= PAYLOAD_PREVIEW_MAX {
        return raw;
    }
    let truncated: String = raw.chars().take(PAYLOAD_PREVIEW_MAX).collect();
    format!("{truncated}… [payload truncated]")
}

#[must_use]
pub(crate) fn todo_payload_shape_guard(arguments: &Value) -> Option<String> {
    let normalized = normalize_todo_write_payload(arguments.clone());
    let Some(todos) = normalized.get("todos").and_then(|v| v.as_array()) else {
        return Some(format!(
            "{}\n\nReceived payload (truncated): {}",
            TODO_WRITE_MISSING_TODOS,
            payload_preview(arguments)
        ));
    };
    if todos.is_empty() {
        return Some(format!(
            "{}\n\nReceived payload (truncated): {}",
            TODO_WRITE_EMPTY_TODOS,
            payload_preview(arguments)
        ));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shape_fail_includes_truncated_payload() {
        let msg = todo_payload_shape_guard(&json!({ "bad": "x".repeat(500) }))
            .expect("should fail");
        assert!(msg.contains("payload truncated") || msg.contains('…'));
        assert!(msg.contains(TODO_WRITE_MISSING_TODOS));
    }
}
