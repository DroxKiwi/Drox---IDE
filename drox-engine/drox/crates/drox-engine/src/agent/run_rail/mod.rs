//! Run rail — linear conductor stations (`hold` / `advance`, mode A).
//!
//! Design: `drox-engine/docs/1.4/1.4.0/README.md`
//!
//! Phase 0: types + state only. Loop hooks activate when `EngineTuning::run_rail_enabled`.

mod station;
mod state;

#[allow(unused_imports)]
pub use station::{RunDepth, RunStation};
pub use state::RunRailState;

/// Whether the run rail conductor is active for this run (architect **edit** only).
#[must_use]
#[allow(dead_code)] // Phase 1: wired in loop.rs
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
