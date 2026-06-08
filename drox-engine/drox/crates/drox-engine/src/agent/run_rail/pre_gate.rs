//! Pre-execution gate — block tools outside current station.

use super::policy;
use super::state::RunRailState;

/// Block tool when disallowed for the current station. Message is English (engine contract).
#[must_use]
pub fn tool_pre_gate_rail(state: &RunRailState, tool_name: &str) -> Option<String> {
    if policy::tool_allowed(state.station, tool_name) {
        return None;
    }
    let station = state.station.as_str();
    let next = state
        .next_candidate_mode_a()
        .map(|s| s.as_str())
        .unwrap_or("none");
    Some(format!(
        "Run rail: tool `{tool_name}` is not allowed in station `{station}`. \
        Next candidate (mode A): {next}. \
        Declare `[gate: hold]` to answer now, or `[gate: advance]` to enter the next station, \
        then call allowed tools."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::run_rail::station::RunStation;

    #[test]
    fn blocks_mutation_in_read() {
        let state = RunRailState {
            station: RunStation::Read,
            ..RunRailState::new()
        };
        let msg = tool_pre_gate_rail(&state, "file_edit").expect("blocked");
        assert!(msg.contains("station `read`"));
    }
}
