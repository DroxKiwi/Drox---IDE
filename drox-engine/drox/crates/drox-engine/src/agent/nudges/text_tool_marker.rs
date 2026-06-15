//! Détection des marqueurs `[tool_use]…</tool_use>` émis en texte (non exécutés).

use drox_types::{Message, Role};

pub(crate) const TEXT_TOOL_MARKER_NUDGE: &str = "\
Blocked: you wrote `[tool_use]…` markers in plain assistant text. They do **not** execute.\n\
Use **native API `tool_calls`** only (function calling), never text tags like `[tool_use]file_read</tool_use>`.\n\
Example: invoke `file_read` with `{\"path\":\"src/app/page.tsx\"}` via tool_calls — then wait for the tool result.";

pub(crate) const TEXT_TOOL_MARKER_STREAK_NUDGE: &str = "\
Blocked: repeated `[tool_use]` text markers still do not run.\n\
Use native `tool_calls` now. Order: `internal_plan_write` (if required), then `workspace_map_read`, then `file_read` with real paths from the map.\n\
Never emit `[tool_use]name</tool_use>` in assistant text.";

pub(crate) const CONTINUE_NO_RESULTS_YET: &str = "\
Continue as **Architect**: no tools have executed on this request yet.\n\n\
Use **native `tool_calls`** (not text `[tool_use]` tags). Start with `internal_plan_write` if required, then `workspace_map_read`.\n\n\
When the user-facing answer is ready: `[phase: answering]` then `[phase: done]`.";

/// Seuil à partir duquel le nudge streak (ordre outils explicite) remplace le nudge standard.
pub(crate) const TEXT_TOOL_MARKER_STREAK_ESCALATE: u32 = 3;

#[must_use]
pub(crate) fn assistant_text_has_tool_markers(text: &str) -> bool {
    text.contains("[tool_use]") || text.contains("</tool_use>")
}

/// `true` si au moins un message `tool` suit le dernier message `user` dans l'historique.
#[must_use]
pub(crate) fn has_tool_results_since_user(messages: &[Message]) -> bool {
    let Some(user_idx) = messages.iter().rposition(|m| m.role == Role::User) else {
        return false;
    };
    messages[user_idx + 1..]
        .iter()
        .any(|m| m.role == Role::Tool)
}

#[must_use]
pub(crate) fn text_tool_marker_nudge(streak: u32) -> &'static str {
    if streak >= TEXT_TOOL_MARKER_STREAK_ESCALATE {
        TEXT_TOOL_MARKER_STREAK_NUDGE
    } else {
        TEXT_TOOL_MARKER_NUDGE
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_types::{Content, ToolUseId};

    #[test]
    fn detects_tool_use_markers() {
        assert!(assistant_text_has_tool_markers(
            "[tool_use]file_read</tool_use>"
        ));
        assert!(assistant_text_has_tool_markers("prefix [tool_use]grep"));
        assert!(!assistant_text_has_tool_markers("use file_read via tool_calls"));
    }

    #[test]
    fn has_tool_results_since_user_after_assistant_only() {
        let messages = vec![
            Message::user("fix the homepage"),
            Message::assistant("[tool_use]file_read</tool_use>"),
        ];
        assert!(!has_tool_results_since_user(&messages));
    }

    #[test]
    fn has_tool_results_since_user_after_tool_message() {
        let messages = vec![
            Message::user("fix the homepage"),
            Message::assistant("calling tool"),
            Message::new(
                Role::Tool,
                vec![Content::ToolResult {
                    tool_use_id: ToolUseId::new(),
                    content: "{}".into(),
                    is_error: false,
                }],
            ),
        ];
        assert!(has_tool_results_since_user(&messages));
    }

    #[test]
    fn streak_nudge_escalates_at_threshold() {
        assert_eq!(
            text_tool_marker_nudge(TEXT_TOOL_MARKER_STREAK_ESCALATE - 1),
            TEXT_TOOL_MARKER_NUDGE
        );
        assert_eq!(
            text_tool_marker_nudge(TEXT_TOOL_MARKER_STREAK_ESCALATE),
            TEXT_TOOL_MARKER_STREAK_NUDGE
        );
    }
}
