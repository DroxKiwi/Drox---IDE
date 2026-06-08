//! Run rail — linear conductor stations (`hold` / `advance`, mode A).
//!
//! Design: `drox-engine/docs/1.4/1.4.0/README.md`
//!
//! Phase 2: PROPOSE hold (C4), ACT circuit breaker (C6), VERIFY-only cycle_sanity.
//! `loop.rs` calls only [`loop_hooks`].

mod act_failure;
mod boot;
mod cycle_sanity_gate;
mod loop_hooks;
mod markers;
mod nudges;
mod policy;
mod pre_gate;
mod propose_hold;
mod snapshot_block;
mod station;
mod state;
mod transition;
mod user_turn;

pub use loop_hooks::{AfterAssistantAction, on_act_tool_failure, on_turn_start};
pub use loop_hooks::{after_assistant_turn, refresh_snapshot, should_observe_cycle_sanity};
pub use pre_gate::tool_pre_gate_rail;
pub use snapshot_block::{refresh_run_rail_snapshot, run_rail_snapshot_block};
#[allow(unused_imports)]
pub use station::{RunDepth, RunStation};
pub use state::RunRailState;

/// Whether the run rail conductor is active for this run (architect **edit** only).
#[must_use]
pub fn run_rail_active(tuning: &crate::EngineTuning, role_id: crate::run_spec::RoleId) -> bool {
    tuning.run_rail_enabled && role_id == crate::run_spec::RoleId::Architect
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::run_spec::RoleId;

    #[test]
    fn run_rail_inactive_by_default() {
        let tuning = crate::EngineTuning::default();
        assert!(!run_rail_active(&tuning, RoleId::Architect));
        assert!(!run_rail_active(&tuning, RoleId::ArchitectDiscussion));
    }

    #[test]
    fn run_rail_only_on_architect_edit_role() {
        let mut tuning = crate::EngineTuning::default();
        tuning.run_rail_enabled = true;
        assert!(run_rail_active(&tuning, RoleId::Architect));
        assert!(!run_rail_active(&tuning, RoleId::ArchitectDiscussion));
    }

    #[test]
    fn complex_path_reaches_propose() {
        let mut state = RunRailState::new();
        transition::apply_assistant_turn(&mut state, "[depth: complex]\n[gate: advance]");
        transition::apply_advance(&mut state);
        assert_eq!(state.station, RunStation::Propose);
    }
}
