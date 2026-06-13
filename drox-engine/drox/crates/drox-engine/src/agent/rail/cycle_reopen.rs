//! B-CYCLE-01 — allow a second ACT→VERIFY cycle after late discovery at VERIFY/ANSWER.

use super::policy;
use super::station::RunStation;
use super::state::RunRailState;
use super::verify::VerifyOutcome;

/// Regress to ACT when a mutation succeeds after verify passed or at ANSWER.
pub fn reopen_work_on_late_mutation(state: &mut RunRailState, tool_name: &str) {
    if !policy::is_mutation_tool(tool_name) {
        return;
    }
    if matches!(state.station, RunStation::Verify | RunStation::Answer) {
        state.station = RunStation::Act;
        state.verify_outcome = VerifyOutcome::Unknown;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::verify::VerifyOutcome;

    #[test]
    fn mutation_at_answer_reopens_act() {
        let mut state = RunRailState {
            station: RunStation::Answer,
            verify_outcome: VerifyOutcome::Pass,
            ..RunRailState::new()
        };
        reopen_work_on_late_mutation(&mut state, "file_edit");
        assert_eq!(state.station, RunStation::Act);
        assert_eq!(state.verify_outcome, VerifyOutcome::Unknown);
    }

    #[test]
    fn read_only_tool_does_not_reopen() {
        let mut state = RunRailState {
            station: RunStation::Answer,
            verify_outcome: VerifyOutcome::Pass,
            ..RunRailState::new()
        };
        reopen_work_on_late_mutation(&mut state, "file_read");
        assert_eq!(state.station, RunStation::Answer);
    }
}
