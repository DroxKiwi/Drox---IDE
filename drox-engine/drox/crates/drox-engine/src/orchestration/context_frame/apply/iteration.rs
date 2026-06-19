//! `architect.*.iteration_start` — parité avec l'ancien `drive_iteration_start` inline.

use drox_types::Message;

use crate::agent::{
    internal_plan_snapshot_for_station, log_context_turn_metrics, on_turn_start,
    refresh_architect_run_snapshot, refresh_internal_plan_snapshot, refresh_snapshot,
    refresh_tool_protocol_snapshot, ArchitectRunState, OpenWorkCounts,
};
use crate::orchestration::{
    architect_run_context_block_per_turn, tool_supplements_architect_compact, EngineTuning,
};

use super::super::manifest::{
    architect_iteration_start_layer_names, architect_iteration_start_layers,
    frame_id_for_iteration_start,
};
use super::super::types::{FrameLayerSpec, LayerId};

/// Input for one architect iteration-start frame apply.
pub struct ArchitectIterationInput<'a> {
    pub messages: &'a mut Vec<Message>,
    pub architect_state: &'a mut ArchitectRunState,
    pub effective_run_objective: Option<&'a str>,
    pub engine_tuning: &'a EngineTuning,
    pub rail_active: bool,
}

/// Apply all layers of `architect.*.iteration_start` in manifest order.
pub fn apply_architect_iteration_start(input: &mut ArchitectIterationInput<'_>) {
    let frame_id = frame_id_for_iteration_start();
    tracing::debug!(
        target: "drox.context",
        frame_id = frame_id.as_str(),
        rail_active = input.rail_active,
        "context_frame_apply_start"
    );

    for layer in architect_iteration_start_layers() {
        if layer.requires_rail && !input.rail_active {
            continue;
        }
        apply_iteration_layer(layer, input);
    }

    log_context_turn_metrics(
        input.messages,
        frame_id.as_str(),
        architect_iteration_start_layer_names(),
    );
}

fn apply_iteration_layer(layer: &FrameLayerSpec, input: &mut ArchitectIterationInput<'_>) {
    match layer.id {
        LayerId::CtxRunSnapshot => apply_ctx_run_snapshot(input),
        LayerId::InternalPlanSnapshot => apply_internal_plan_snapshot(input),
        LayerId::ToolProtocols => apply_tool_protocols(input),
        LayerId::RailTurnHooks => apply_rail_turn_hooks(input),
        LayerId::RailSnapshot => apply_rail_snapshot(input),
    }
}

fn apply_ctx_run_snapshot(input: &mut ArchitectIterationInput<'_>) {
    let rail_station = input
        .rail_active
        .then_some(input.architect_state.rail.station);
    let snapshot = architect_run_context_block_per_turn(
        input.architect_state,
        input.effective_run_objective,
        rail_station,
    );
    refresh_architect_run_snapshot(input.messages, &snapshot);
}

fn apply_internal_plan_snapshot(input: &mut ArchitectIterationInput<'_>) {
    let station = input.rail_active.then_some(input.architect_state.rail.station);
    let snapshot = internal_plan_snapshot_for_station(input.architect_state, station);
    refresh_internal_plan_snapshot(input.messages, snapshot.as_deref());
}

fn apply_tool_protocols(input: &mut ArchitectIterationInput<'_>) {
    let tool_protocols = tool_supplements_architect_compact(input.engine_tuning);
    refresh_tool_protocol_snapshot(input.messages, &tool_protocols);
}

fn apply_rail_turn_hooks(input: &mut ArchitectIterationInput<'_>) {
    let open_work = OpenWorkCounts::from_state(input.architect_state);
    on_turn_start(
        &mut input.architect_state.rail,
        input.messages,
        false,
        open_work,
    );
}

fn apply_rail_snapshot(input: &mut ArchitectIterationInput<'_>) {
    let open_work = OpenWorkCounts::from_state(input.architect_state);
    let rail_focus = input
        .architect_state
        .current_focus_step_line()
        .map(|(id, action, _)| (id, action));
    let focus = rail_focus
        .as_ref()
        .map(|(id, action)| (id.as_str(), action.as_str()));
    refresh_snapshot(
        input.messages,
        &input.architect_state.rail,
        focus,
        open_work,
    );
}
