//! Pre-execution gate — block tools outside current station.

use super::policy;
use super::state::RunRailState;

use crate::orchestration::tool_folders::TOOL_INTERNAL_PLAN_WRITE;

/// Block tool when disallowed for the current station. Message is English (engine contract).
#[must_use]
pub fn tool_pre_gate_rail(state: &RunRailState, tool_name: &str) -> Option<String> {
    if tool_name == TOOL_INTERNAL_PLAN_WRITE {
        return None;
    }
    if policy::tool_allowed(state.station, tool_name) {
        return None;
    }
    let station = state.station.as_str();
    let action = policy::station_action_hint(state.station);
    Some(format!(
        "Run rail: at station `{station}`, tool `{tool_name}` is blocked. {action}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::rail::state::RunRailState;
    use crate::agent::rail::station::RunStation;
    use crate::orchestration::tool_folders::{FOLDER_EDIT_FILE, FOLDER_READ_WORKSPACE};

    #[test]
    fn internal_plan_write_allowed_at_intent() {
        let state = RunRailState::new();
        assert!(tool_pre_gate_rail(&state, "internal_plan_write").is_none());
    }

    #[test]
    fn blocks_mutation_in_read() {
        let state = RunRailState {
            station: RunStation::Read,
            ..RunRailState::new()
        };
        let msg = tool_pre_gate_rail(&state, "file_edit").expect("blocked");
        assert!(msg.contains("station `read`"));
        assert!(msg.contains("file_read"));
        assert!(!msg.contains("[gate: advance]"));
        assert!(!msg.contains("advance to verify"));
    }

    #[test]
    fn blocks_mutation_in_plan() {
        let state = RunRailState {
            station: RunStation::Plan,
            ..RunRailState::new()
        };
        let msg = tool_pre_gate_rail(&state, "file_edit").expect("blocked");
        assert!(msg.contains("station `plan`"));
        assert!(msg.contains("todo_write"));
        assert!(!msg.contains("[gate: hold]"));
    }

    #[test]
    fn allows_virtual_edit_file_folder_at_act() {
        let state = RunRailState {
            station: RunStation::Act,
            ..RunRailState::new()
        };
        assert!(tool_pre_gate_rail(&state, FOLDER_EDIT_FILE).is_none());
    }

    #[test]
    fn allows_virtual_read_workspace_at_intent() {
        let state = RunRailState::new();
        assert!(tool_pre_gate_rail(&state, FOLDER_READ_WORKSPACE).is_none());
    }

    #[test]
    fn blocks_read_workspace_at_act() {
        let state = RunRailState {
            station: RunStation::Act,
            ..RunRailState::new()
        };
        let msg = tool_pre_gate_rail(&state, FOLDER_READ_WORKSPACE).expect("blocked");
        assert!(msg.contains("station `act`"));
    }
}
