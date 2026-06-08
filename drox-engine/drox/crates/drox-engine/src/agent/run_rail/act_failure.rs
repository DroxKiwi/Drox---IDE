//! ACT circuit breaker (C6) — same path fails twice → severe nudge + stop run.

use serde_json::Value;

use super::nudges::ACT_FAILURE_STOP_PROMPT;
use super::station::RunStation;
use super::state::RunRailState;

const MAX_STRIKES_SAME_PATH: u32 = 2;

/// Outcome after recording a failed mutation tool at ACT.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActFailureOutcome {
    /// First failure on this path — tool error only.
    Recorded,
    /// Second failure on same path — inject nudge and stop the run.
    SevereNudgeAndStop,
}

/// Record a failed tool at ACT; returns stop action when threshold is reached.
#[must_use]
pub fn record_act_tool_failure(
    state: &mut RunRailState,
    tool_name: &str,
    arguments: &Value,
) -> Option<ActFailureOutcome> {
    if state.station != RunStation::Act {
        return None;
    }
    let path = mutation_path(tool_name, arguments)?;
    if state.act_failure_last_path.as_deref() == Some(path.as_str()) {
        state.act_failure_strikes = state.act_failure_strikes.saturating_add(1);
    } else {
        state.act_failure_last_path = Some(path);
        state.act_failure_strikes = 1;
    }
    if state.act_failure_strikes >= MAX_STRIKES_SAME_PATH {
        Some(ActFailureOutcome::SevereNudgeAndStop)
    } else {
        Some(ActFailureOutcome::Recorded)
    }
}

/// English severe nudge (engine contract).
#[must_use]
pub fn severe_nudge_message() -> &'static str {
    ACT_FAILURE_STOP_PROMPT
}

#[must_use]
fn mutation_path(tool_name: &str, arguments: &Value) -> Option<String> {
    match tool_name {
        "file_edit" | "file_write" | "delete_path" | "copy_path" | "notebook_edit" => arguments
            .get("path")
            .or_else(|| arguments.get("file_path"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn second_failure_same_path_triggers_stop() {
        let mut state = RunRailState {
            station: RunStation::Act,
            ..RunRailState::new()
        };
        let args = json!({ "path": "src/a.css" });
        assert_eq!(
            record_act_tool_failure(&mut state, "file_edit", &args),
            Some(ActFailureOutcome::Recorded)
        );
        assert_eq!(
            record_act_tool_failure(&mut state, "file_edit", &args),
            Some(ActFailureOutcome::SevereNudgeAndStop)
        );
    }
}
