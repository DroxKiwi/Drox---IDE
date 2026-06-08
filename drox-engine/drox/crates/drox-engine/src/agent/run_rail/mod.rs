//! Run rail — linear conductor stations (`hold` / `advance`, mode A).
//!
//! Design: `drox-engine/docs/1.4/1.4.0/README.md`
//!
//! Phase 1: markers, policy, pre_gate, snapshot, loop hooks.

mod markers;
mod policy;
mod pre_gate;
mod snapshot_block;
mod station;
mod state;
mod transition;

pub use markers::{GateTransition, ParsedRailMarkers};
pub use pre_gate::tool_pre_gate_rail;
pub use snapshot_block::{refresh_run_rail_snapshot, run_rail_snapshot_block};
#[allow(unused_imports)]
pub use station::{RunDepth, RunStation};
pub use state::RunRailState;
pub use transition::apply_assistant_turn;

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
}
