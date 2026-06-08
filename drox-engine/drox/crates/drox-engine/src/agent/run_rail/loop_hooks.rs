//! Thin facade for `loop.rs` — boot, turns, sanity gate, ACT failures, segments.
//!
//! `loop.rs` should call only this module.

use drox_types::Message;
use serde_json::Value;
use tokio::sync::mpsc;

use super::act_failure::{ActFailureOutcome, record_act_tool_failure, severe_nudge_message};
use super::segment::{
    evaluate_segment_spawn, mutation_target_bytes, run_act_segment, segment_tool_result_message,
    SegmentSpawnRequest,
};
use super::station_events::{self, StationEvent};
use super::transition::apply_assistant_turn;
use super::boot;
use super::cycle_sanity_gate;
use super::propose_hold;
use super::refresh_run_rail_snapshot;
use super::run_rail_snapshot_block;
use super::state::RunRailState;
use super::user_turn;
use crate::agent::{Agent, ArchitectRunState};
use crate::error::EngineError;
use crate::event::AgentEvent;

/// Action after processing an assistant turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AfterAssistantAction {
    Continue,
    /// PROPOSE hold active — end run so the user can reply (C4).
    PauseForUser,
}

/// Outcome of one assistant turn for the parent loop.
#[derive(Debug)]
pub struct RailAssistantTurn {
    pub action: AfterAssistantAction,
    pub station_events: Vec<StationEvent>,
}

/// Boot + each LLM iteration start.
pub fn on_turn_start(state: &mut RunRailState, messages: &[Message], is_boot: bool) {
    if is_boot {
        boot::restore_from_transcript(state, messages);
    }
    user_turn::release_propose_hold_if_user_replied(state, messages);
}

pub fn refresh_snapshot(messages: &mut Vec<Message>, state: &RunRailState) {
    refresh_run_rail_snapshot(messages, &run_rail_snapshot_block(state));
}

pub fn after_assistant_turn(
    state: &mut RunRailState,
    assistant_text: &str,
    focus: Option<(String, String)>,
) -> RailAssistantTurn {
    let before = station_events::snapshot(state);
    apply_assistant_turn(state, assistant_text);
    let station_events = station_events::diff_transitions(before, state, focus);
    let action = if propose_hold::should_pause_run(state) {
        AfterAssistantAction::PauseForUser
    } else {
        AfterAssistantAction::Continue
    };
    RailAssistantTurn {
        action,
        station_events,
    }
}

/// Failed mutation at ACT — returns nudge text when the run must stop (C6).
#[must_use]
pub fn on_act_tool_failure(
    state: &mut RunRailState,
    tool_name: &str,
    arguments: &Value,
) -> Option<&'static str> {
    match record_act_tool_failure(state, tool_name, arguments)? {
        ActFailureOutcome::Recorded => None,
        ActFailureOutcome::SevereNudgeAndStop => Some(severe_nudge_message()),
    }
}

#[must_use]
pub fn should_observe_cycle_sanity(rail_active: bool, state: &RunRailState, tool_name: &str) -> bool {
    cycle_sanity_gate::should_observe_cycle_sanity(rail_active, state.station, tool_name)
}

/// Whether the parent should spawn an ACT segment instead of running the tool inline.
pub async fn segment_spawn_request(
    rail: &RunRailState,
    architect: &ArchitectRunState,
    tool_name: &str,
    arguments: &Value,
    workspace: &camino::Utf8Path,
) -> Option<SegmentSpawnRequest> {
    let bytes = mutation_target_bytes(workspace, tool_name, arguments).await;
    evaluate_segment_spawn(
        rail,
        architect,
        tool_name,
        arguments,
        bytes,
        &rail.segment_spawned_paths,
    )
}

/// Run segment sub-loop; returns synthetic tool message for the parent transcript.
pub async fn run_segment_for_tool(
    parent: &Agent,
    tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    workspace: &camino::Utf8Path,
    run_id: &str,
    request: SegmentSpawnRequest,
    plan_id: Option<&str>,
    tool_id: drox_types::ToolUseId,
    rail: &mut RunRailState,
) -> Result<(Message, super::segment::SegmentReport), EngineError> {
    for path in &request.scope {
        rail.segment_spawned_paths.insert(path.clone());
    }
    let report = run_act_segment(parent, tx, workspace, run_id, request, plan_id).await?;
    let msg = segment_tool_result_message(tool_id, &report);
    Ok((msg, report))
}

pub fn record_act_tool_step(rail: &mut RunRailState) {
    rail.act_tool_steps = rail.act_tool_steps.saturating_add(1);
}
