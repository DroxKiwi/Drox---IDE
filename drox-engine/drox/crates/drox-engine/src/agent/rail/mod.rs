//! Run rail — linear conductor stations (`hold` / `advance`, mode A).
//!
//! Design: `drox-engine/docs/1.4/archive/1.4.0/README.md`

mod act_failure;
mod act_stall;
mod boot;
mod infer;
mod loop_hooks;
mod markers;
mod nudges;
mod policy;
mod pre_gate;
mod propose_hold;
mod snapshot_block;
mod station;
mod station_events;
mod state;
mod transition;
mod user_turn;
mod verify;

pub use loop_hooks::{
    after_assistant_turn, on_act_idle_turn, on_act_tool_failure, on_tool_success,
    on_turn_start, on_verify_tool_result, refresh_snapshot, AfterAssistantAction,
};
pub use transition::{
    force_act_for_expected_mutation, reopen_work_station_if_needed, OpenTodoCounts,
};
pub use policy::filter_tool_specs_for_station;
pub use pre_gate::tool_pre_gate_rail;
pub use snapshot_block::refresh_run_rail_snapshot;
pub use station_events::to_agent_event;
pub use state::RunRailState;

#[cfg(test)]
pub(crate) use station::RunStation;

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
            OpenTodoCounts::default(),
        );
        transition::apply_advance(&mut state, OpenTodoCounts::default());
        assert_eq!(state.station, RunStation::Propose);
    }

    #[test]
    fn infer_advances_to_read_without_gate_markers() {
        let mut state = RunRailState::new();
        transition::apply_assistant_turn(
            &mut state,
            "Let me inspect the repo.",
            &["file_read"],
            OpenTodoCounts::default(),
        );
        assert_eq!(state.station, RunStation::Read);
    }
}
