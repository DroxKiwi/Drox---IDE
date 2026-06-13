//! ACT circuit breaker (C6) — same path fails twice → severe nudge + stop run.

use serde_json::Value;

use super::nudges::ACT_FAILURE_STOP_PROMPT;
use super::station::RunStation;
use super::state::RunRailState;

const MAX_STRIKES_SAME_PATH: u32 = 2;
const MAX_SPIRAL_ATTEMPTS_SAME_PATH: u32 = 5;

/// Outcome after recording a mutation attempt at ACT (success or failure).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActMutationAttemptOutcome {
    /// Same path rewritten many times — suggest a different strategy (B-TOOL-01).
    SpiralNudge,
    /// Second failure on same path — inject nudge and stop the run.
    SevereNudgeAndStop,
}

/// Record a failed tool at ACT; returns stop action when threshold is reached.
#[must_use]
pub fn record_act_tool_failure(
    state: &mut RunRailState,
    tool_name: &str,
    arguments: &Value,
) -> Option<ActMutationAttemptOutcome> {
    record_act_mutation_attempt(state, tool_name, arguments, true)
}

/// Count mutation attempts at ACT on the same path (B-TOOL-01).
#[must_use]
pub fn record_act_mutation_attempt(
    state: &mut RunRailState,
    tool_name: &str,
    arguments: &Value,
    failed: bool,
) -> Option<ActMutationAttemptOutcome> {
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
    if failed && state.act_failure_strikes >= MAX_STRIKES_SAME_PATH {
        return Some(ActMutationAttemptOutcome::SevereNudgeAndStop);
    }
    if state.act_failure_strikes >= MAX_SPIRAL_ATTEMPTS_SAME_PATH {
        return Some(ActMutationAttemptOutcome::SpiralNudge);
    }
    None
}

#[must_use]
pub fn spiral_nudge_message() -> &'static str {
    super::nudges::ACT_WRITE_SPIRAL_PROMPT
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
            None
        );
        assert_eq!(
            record_act_tool_failure(&mut state, "file_edit", &args),
            Some(ActMutationAttemptOutcome::SevereNudgeAndStop)
        );
    }

    #[test]
    fn fifth_attempt_same_path_triggers_spiral_nudge() {
        let mut state = RunRailState {
            station: RunStation::Act,
            ..RunRailState::new()
        };
        let args = json!({ "path": "src/a.tsx" });
        for _ in 0..4 {
            assert_eq!(
                record_act_mutation_attempt(&mut state, "file_write", &args, false),
                None
            );
        }
        assert_eq!(
            record_act_mutation_attempt(&mut state, "file_write", &args, false),
            Some(ActMutationAttemptOutcome::SpiralNudge)
        );
    }
}
