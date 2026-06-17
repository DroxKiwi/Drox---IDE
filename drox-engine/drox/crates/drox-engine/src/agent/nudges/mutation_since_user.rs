//! Successful workspace mutations since the last user message (current request).

use std::collections::HashMap;

use drox_types::{Content, Message, Role};

use crate::agent::rail::is_mutation_tool;

/// Count successful mutation tool results after the latest `user` message.
#[must_use]
pub(crate) fn successful_mutation_count_since_user(messages: &[Message]) -> u32 {
    let Some(user_idx) = messages.iter().rposition(|m| m.role == Role::User) else {
        return 0;
    };
    let slice = &messages[user_idx + 1..];
    let mut pending: HashMap<String, &str> = HashMap::new();
    let mut count = 0u32;
    for msg in slice {
        if msg.role == Role::Assistant {
            for block in &msg.content {
                if let Content::ToolUse { id, name, .. } = block {
                    pending.insert(id.as_str().to_string(), name.as_str());
                }
            }
            continue;
        }
        if msg.role != Role::Tool {
            continue;
        }
        for block in &msg.content {
            let Content::ToolResult {
                tool_use_id,
                is_error,
                ..
            } = block
            else {
                continue;
            };
            if *is_error {
                continue;
            }
            let Some(name) = pending.get(tool_use_id.as_str()) else {
                continue;
            };
            if is_mutation_tool(name) {
                count = count.saturating_add(1);
            }
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_types::ToolUseId;

    #[test]
    fn counts_successful_file_edit_after_user() {
        let tu = ToolUseId::new();
        let messages = vec![
            Message::user("fix the hero text"),
            Message::new(
                Role::Assistant,
                vec![Content::ToolUse {
                    id: tu.clone(),
                    name: "file_edit".into(),
                    input: serde_json::json!({}),
                }],
            ),
            Message::tool_result(tu, r#"{"ok":true}"#, false),
        ];
        assert_eq!(successful_mutation_count_since_user(&messages), 1);
    }

    #[test]
    fn ignores_mutations_before_last_user() {
        let old = ToolUseId::new();
        let messages = vec![
            Message::user("first task"),
            Message::new(
                Role::Assistant,
                vec![Content::ToolUse {
                    id: old.clone(),
                    name: "file_write".into(),
                    input: serde_json::json!({}),
                }],
            ),
            Message::tool_result(old, "{}", false),
            Message::user("second task — still broken"),
            Message::assistant("investigating"),
        ];
        assert_eq!(successful_mutation_count_since_user(&messages), 0);
    }

    #[test]
    fn ignores_failed_mutation() {
        let tu = ToolUseId::new();
        let messages = vec![
            Message::user("fix css"),
            Message::new(
                Role::Assistant,
                vec![Content::ToolUse {
                    id: tu.clone(),
                    name: "file_edit".into(),
                    input: serde_json::json!({}),
                }],
            ),
            Message::tool_result(tu, "merge conflict", true),
        ];
        assert_eq!(successful_mutation_count_since_user(&messages), 0);
    }
}
