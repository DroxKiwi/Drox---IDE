//! ACT stall — N idle turns at ACT with an open task → single directive nudge.

use crate::agent::nudges::ACT_STALL_NUDGE_PROMPT;

use super::policy;
use super::station::RunStation;
use super::state::RunRailState;

const MAX_ACT_IDLE_TURNS: u32 = 3;

/// Record an assistant turn with no tool calls at ACT; returns stall nudge when threshold hit.
#[must_use]
pub fn on_act_idle_turn(state: &mut RunRailState, has_in_progress_task: bool) -> Option<&'static str> {
    if state.station != RunStation::Act || !has_in_progress_task {
        state.act_idle_turns = 0;
        return None;
    }
    state.act_idle_turns = state.act_idle_turns.saturating_add(1);
    if state.act_idle_turns >= MAX_ACT_IDLE_TURNS {
        Some(ACT_STALL_NUDGE_PROMPT)
    } else {
        None
    }
}

/// Reset idle counter after a successful mutation tool at ACT.
pub fn reset_on_mutation_success(state: &mut RunRailState, tool_name: &str) {
    if state.station == RunStation::Act && policy::is_mutation_tool(tool_name) {
        state.act_idle_turns = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn third_idle_turn_at_act_returns_stall_nudge() {
        let mut state = RunRailState {
            station: RunStation::Act,
            ..RunRailState::new()
        };
        assert!(on_act_idle_turn(&mut state, true).is_none());
        assert!(on_act_idle_turn(&mut state, true).is_none());
        assert_eq!(
            on_act_idle_turn(&mut state, true),
            Some(ACT_STALL_NUDGE_PROMPT)
        );
    }

    #[test]
    fn idle_turns_reset_when_no_open_task() {
        let mut state = RunRailState {
            station: RunStation::Act,
            act_idle_turns: 2,
            ..RunRailState::new()
        };
        assert!(on_act_idle_turn(&mut state, false).is_none());
        assert_eq!(state.act_idle_turns, 0);
    }
}
