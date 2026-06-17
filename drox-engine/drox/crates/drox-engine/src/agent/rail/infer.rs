//! Station alignment after assistant turns (C12/C17).
//!
//! Complements upstream `filter_tool_specs_for_station` (pre-LLM tool visibility) —
//! updates `RunRailState.station` from tool names when `[gate:]` is absent.

use super::policy;
use super::station::RunStation;
use super::state::RunRailState;
use super::transition::OpenTodoCounts;
use super::verify::VerifyOutcome;

/// Raise `state.station` to at least `target` on the linear order.
pub fn set_station_at_least(state: &mut RunRailState, target: RunStation) {
    if RunRailState::station_ord(state.station) >= RunRailState::station_ord(target) {
        return;
    }
    state.station = target;
    if target == RunStation::Verify {
        state.visited_verify = true;
        if state.verify_outcome.failed() {
            state.verify_outcome = VerifyOutcome::Unknown;
        }
    }
}

/// Align station from pending tool calls on this assistant turn (no explicit `[gate:]`).
///
/// C17/C19: do not pre-advance to ACT when the turn mixes `todo_write` with mutations —
/// `pre_gate` must still see PLAN for `file_edit` in that turn.
pub fn align_station_from_tools(
    state: &mut RunRailState,
    tool_names: &[&str],
    open_todos: OpenTodoCounts,
) {
    if state.propose_awaiting_user || tool_names.is_empty() {
        return;
    }
    if open_todos.has_open() && state.station == RunStation::Act {
        return;
    }
    let Some(target) = infer_align_target(state.station, tool_names) else {
        return;
    };
    if state.station == RunStation::Act && target == RunStation::Verify {
        return;
    }
    set_station_at_least(state, target);
}

#[must_use]
fn infer_align_target(current: RunStation, tool_names: &[&str]) -> Option<RunStation> {
    let max_min = max_minimum_station(tool_names)?;
    let has_plan_tool = tool_names
        .iter()
        .any(|name| matches!(*name, "todo_write" | "architect_help"));
    let wants_act_or_verify = matches!(max_min, RunStation::Act | RunStation::Verify);

    if has_plan_tool
        && wants_act_or_verify
        && RunRailState::station_ord(current) <= RunRailState::station_ord(RunStation::Plan)
    {
        return Some(RunStation::Plan);
    }

    Some(max_min)
}

/// After a successful tool execution, refine station to match what just ran.
pub fn on_tool_success(state: &mut RunRailState, tool_name: &str) {
    if state.propose_awaiting_user {
        return;
    }
    if state.station == RunStation::Act && tool_name == "bash" {
        return;
    }
    set_station_at_least(state, policy::minimum_station_for_tool(tool_name));
}

#[must_use]
fn max_minimum_station(tool_names: &[&str]) -> Option<RunStation> {
    tool_names
        .iter()
        .map(|name| policy::minimum_station_for_tool(name))
        .max_by_key(|st| RunRailState::station_ord(*st))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn align_read_tools_from_intent() {
        let mut state = RunRailState::new();
        align_station_from_tools(&mut state, &["file_read", "grep"], OpenTodoCounts::default());
        assert_eq!(state.station, RunStation::Read);
    }

    #[test]
    fn explicit_gate_not_applied_here() {
        let mut state = RunRailState::new();
        set_station_at_least(&mut state, RunStation::Read);
        align_station_from_tools(&mut state, &["file_edit"], OpenTodoCounts::default());
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn bash_at_act_does_not_align_to_verify() {
        let mut state = RunRailState {
            station: RunStation::Act,
            ..RunRailState::new()
        };
        align_station_from_tools(&mut state, &["bash"], OpenTodoCounts::default());
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn bash_at_act_does_not_advance_on_success() {
        let mut state = RunRailState {
            station: RunStation::Act,
            ..RunRailState::new()
        };
        on_tool_success(&mut state, "bash");
        assert_eq!(state.station, RunStation::Act);
        assert!(!state.visited_verify);
    }

    #[test]
    fn bash_from_read_reaches_verify() {
        let mut state = RunRailState {
            station: RunStation::Read,
            ..RunRailState::new()
        };
        on_tool_success(&mut state, "bash");
        assert_eq!(state.station, RunStation::Verify);
    }

    #[test]
    fn open_todos_block_verify_align_from_act() {
        let mut state = RunRailState {
            station: RunStation::Act,
            ..RunRailState::new()
        };
        align_station_from_tools(
            &mut state,
            &["bash"],
            OpenTodoCounts {
                pending: 0,
                in_progress: 1,
            },
        );
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn mixed_plan_and_mutation_stays_at_plan() {
        let mut state = RunRailState {
            station: RunStation::Plan,
            ..RunRailState::new()
        };
        align_station_from_tools(&mut state, &["todo_write", "file_edit"], OpenTodoCounts::default());
        assert_eq!(state.station, RunStation::Plan);
    }

    #[test]
    fn pure_mutation_from_plan_reaches_act() {
        let mut state = RunRailState {
            station: RunStation::Plan,
            ..RunRailState::new()
        };
        align_station_from_tools(&mut state, &["file_edit"], OpenTodoCounts::default());
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn mutation_success_stays_at_act() {
        let mut state = RunRailState {
            station: RunStation::Read,
            ..RunRailState::new()
        };
        on_tool_success(&mut state, "file_edit");
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn propose_hold_blocks_align() {
        let mut state = RunRailState {
            station: RunStation::Propose,
            propose_awaiting_user: true,
            ..RunRailState::new()
        };
        align_station_from_tools(&mut state, &["file_read"], OpenTodoCounts::default());
        assert_eq!(state.station, RunStation::Propose);
    }
}
