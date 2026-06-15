//! Run rail — linear conductor stations (`hold` / `advance`, mode A).
//!
//! Design: `drox-engine/docs/1.4/archive/1.4.0/README.md`

mod act_failure;
mod act_stall;
mod boot;
mod cycle_reopen;
mod infer;
mod loop_hooks;
mod markers;
mod nudges;
mod policy;
mod post_todos_close;
mod pre_gate;
mod propose_hold;
mod snapshot_block;
mod station;
mod station_events;
mod state;
mod transition;
mod user_turn;
mod verify;

pub(crate) use post_todos_close::reset_post_todos_idle;
pub use loop_hooks::{
    after_assistant_turn, on_act_idle_turn, on_act_mutation_success, on_act_tool_failure,
    on_post_todos_idle_turn, on_tool_success, on_turn_start, on_verify_tool_result,
    refresh_snapshot, ActRailNudge, AfterAssistantAction,
};
pub use transition::{
    force_act_for_expected_mutation, reopen_work_station_if_needed, OpenTodoCounts,
    RailTransitionContext,
};
pub use policy::filter_tool_specs_for_station;
pub use pre_gate::tool_pre_gate_rail;
pub use snapshot_block::{is_run_rail_snapshot_message, refresh_run_rail_snapshot};
pub use station::RunStation;
pub use station_events::{to_agent_event, StationEvent};
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
    use super::station::RunStation;

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
        transition::apply_assistant_turn(
            &mut state,
            "[depth: complex]\n[gate: advance]",
            &[],
            transition::RailTransitionContext::default(),
        );
        transition::apply_advance(
            &mut state,
            transition::RailTransitionContext::default(),
        );
        assert_eq!(state.station, RunStation::Propose);
    }

    #[test]
    fn infer_advances_to_read_without_gate_markers() {
        let mut state = RunRailState::new();
        transition::apply_assistant_turn(
            &mut state,
            "Let me inspect the repo.",
            &["file_read"],
            transition::RailTransitionContext::default(),
        );
        assert_eq!(state.station, RunStation::Read);
    }
}
