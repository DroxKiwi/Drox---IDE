//! User message boundaries — release PROPOSE hold (C4).

use drox_types::{Message, Role};

use super::propose_hold;
use super::state::RunRailState;

/// Last user message is after the last assistant message.
#[must_use]
pub fn has_user_reply_after_last_assistant(messages: &[Message]) -> bool {
    let last_assistant = messages.iter().rposition(|m| m.role == Role::Assistant);
    let last_user = messages.iter().rposition(|m| m.role == Role::User);
    match (last_assistant, last_user) {
        (Some(a), Some(u)) => u > a,
        _ => false,
    }
}

/// Clear PROPOSE hold when the user sent a new message after the proposal.
pub fn release_propose_hold_if_user_replied(state: &mut RunRailState, messages: &[Message]) {
    if state.propose_awaiting_user && has_user_reply_after_last_assistant(messages) {
        propose_hold::clear_awaiting_user(state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_user_after_assistant() {
        let messages = vec![
            Message::user("charte css"),
            Message::assistant("proposal?"),
            Message::user("option A"),
        ];
        assert!(has_user_reply_after_last_assistant(&messages));
    }

    #[test]
    fn releases_propose_hold_on_user_reply() {
        let mut state = RunRailState::new();
        propose_hold::enter_awaiting_user(&mut state);
        let messages = vec![Message::assistant("pick?"), Message::user("A")];
        release_propose_hold_if_user_replied(&mut state, &messages);
        assert!(!state.propose_awaiting_user);
    }
}
