//! Post-todos idle turns — nudge answering when work is done but UI never saw it (B-MOTOR-06).

use crate::agent::nudges::POST_TODOS_ANSWER_NUDGE_PROMPT;

use super::station::RunStation;
use super::state::RunRailState;

const MAX_POST_TODOS_IDLE_TURNS: u32 = 2;

/// Record an idle assistant turn after todos are terminal; returns nudge when threshold hit.
#[must_use]
pub fn on_post_todos_idle_turn(
    state: &mut RunRailState,
    todos_closed: bool,
    mutation_count: u32,
) -> Option<&'static str> {
    if !todos_closed || mutation_count == 0 {
        state.post_todos_idle_turns = 0;
        return None;
    }
    if !matches!(
        state.station,
        RunStation::Act | RunStation::Verify | RunStation::Answer
    ) {
        state.post_todos_idle_turns = 0;
        return None;
    }
    state.post_todos_idle_turns = state.post_todos_idle_turns.saturating_add(1);
    if state.post_todos_idle_turns >= MAX_POST_TODOS_IDLE_TURNS {
        Some(POST_TODOS_ANSWER_NUDGE_PROMPT)
    } else {
        None
    }
}

/// Reset counter after a visible answering phase or a new mutation.
pub fn reset_post_todos_idle(state: &mut RunRailState) {
    state.post_todos_idle_turns = 0;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_idle_turn_after_todos_closed_returns_nudge() {
        let mut state = RunRailState {
            station: RunStation::Verify,
            ..RunRailState::new()
        };
        assert!(on_post_todos_idle_turn(&mut state, true, 2).is_none());
        assert_eq!(
            on_post_todos_idle_turn(&mut state, true, 2),
            Some(POST_TODOS_ANSWER_NUDGE_PROMPT)
        );
    }

    #[test]
    fn no_nudge_without_mutations() {
        let mut state = RunRailState::new();
        assert!(on_post_todos_idle_turn(&mut state, true, 0).is_none());
        assert_eq!(state.post_todos_idle_turns, 0);
    }
}
