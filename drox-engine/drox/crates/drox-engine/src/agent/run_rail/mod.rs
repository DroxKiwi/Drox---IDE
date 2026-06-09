//! Run rail — linear conductor stations (`hold` / `advance`, mode A).
//!
//! Design: `drox-engine/docs/1.4/1.4.0/README.md`
//!
//! Phase 3: ACT segments (C7/C8), station UI events, `loop_hooks` facade.

mod act_failure;
mod boot;
mod cycle_sanity_gate;
mod loop_hooks;
mod markers;
mod nudges;
mod policy;
mod pre_gate;
mod propose_hold;
mod segment;
mod snapshot_block;
mod station;
mod station_events;
mod state;
mod transition;
mod user_turn;

pub use loop_hooks::{
    after_assistant_turn, on_act_tool_failure, on_turn_start, record_act_tool_step,
    refresh_snapshot, run_segment_for_tool, segment_spawn_request, should_observe_cycle_sanity,
    AfterAssistantAction,
};
pub use pre_gate::tool_pre_gate_rail;
pub use snapshot_block::{refresh_run_rail_snapshot, run_rail_snapshot_block};
pub use station_events::to_agent_event;
pub use station::RunStation;
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
    fn run_rail_active_on_normal_preset_only() {
        let normal = crate::EngineTuning::default();
        assert!(run_rail_active(&normal, RoleId::Architect));
        assert!(!run_rail_active(&normal, RoleId::ArchitectDiscussion));

        let relaxed =
            crate::orchestration::tuning::resolve_engine_tuning(Some("relaxed"), None);
        assert!(!run_rail_active(&relaxed, RoleId::Architect));
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
