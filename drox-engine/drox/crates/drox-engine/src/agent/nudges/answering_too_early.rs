//! Gate « answering » avant exploration outils (brief mutation).

use drox_types::Message;

use crate::agent::stream::TurnOutcome;
use crate::event::Phase;
use crate::run_spec::RoleId;

use super::text_tool_marker::has_tool_results_since_user;

pub(crate) const ANSWERING_TOO_EARLY_NUDGE: &str = "\
Blocked: `[phase: answering]` is too early — no tools have run on this request yet.\n\
Explore first with **native `tool_calls`**: `internal_plan_write` (if required), then `workspace_map_read`, then `file_read` on real paths.\n\
Do not paste implementation code in thinking or answering until you have tool results.";

/// Brief mutation sans aucun `tool_result` depuis le dernier message utilisateur.
#[must_use]
pub(crate) fn is_premature_answering_turn(
    role_id: RoleId,
    mutation_expected: bool,
    mutation_count: u32,
    messages: &[Message],
    outcome: &TurnOutcome,
) -> bool {
    role_id == RoleId::Architect
        && mutation_expected
        && mutation_count == 0
        && !has_tool_results_since_user(messages)
        && outcome.tool_calls.is_empty()
        && (outcome.saw_answering || outcome.final_phase == Some(Phase::Answering))
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_types::{Content, Role, ToolUseId};

    fn mutation_outcome(saw_answering: bool) -> TurnOutcome {
        TurnOutcome {
            text: String::new(),
            tool_calls: vec![],
            reason: drox_types::StopReason::EndTurn,
            usage: drox_types::Usage::default(),
            final_phase: if saw_answering {
                Some(Phase::Answering)
            } else {
                None
            },
            saw_answering,
            run_objective: None,
        }
    }

    #[test]
    fn premature_when_answering_without_tools() {
        let messages = vec![
            Message::user("rewrite section-transition.tsx"),
            Message::assistant("[phase: answering]\nHere is the code"),
        ];
        assert!(is_premature_answering_turn(
            RoleId::Architect,
            true,
            0,
            &messages,
            &mutation_outcome(true),
        ));
    }

    #[test]
    fn not_premature_after_tool_result() {
        let messages = vec![
            Message::user("rewrite section-transition.tsx"),
            Message::assistant("reading"),
            Message::new(
                Role::Tool,
                vec![Content::ToolResult {
                    tool_use_id: ToolUseId::new(),
                    content: "{}".into(),
                    is_error: false,
                }],
            ),
        ];
        assert!(!is_premature_answering_turn(
            RoleId::Architect,
            true,
            0,
            &messages,
            &mutation_outcome(true),
        ));
    }

    #[test]
    fn not_premature_when_mutation_not_expected() {
        let messages = vec![Message::user("hello")];
        assert!(!is_premature_answering_turn(
            RoleId::Architect,
            false,
            0,
            &messages,
            &mutation_outcome(true),
        ));
    }
}
