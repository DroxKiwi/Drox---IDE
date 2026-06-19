//! Thin facade for `loop.rs` — boot, turns, ACT failures.
//!
//! `loop.rs` should call only this module.

use drox_types::Message;

use super::act_failure::{
    record_act_mutation_attempt, record_act_tool_failure, severe_nudge_message,
    spiral_nudge_message, ActMutationAttemptOutcome,
};
use super::policy;
use super::station::RunStation;
use super::station_events::{self, StationEvent};
use crate::agent::state::internal_plan::OpenWorkCounts;

use super::transition::{apply_assistant_turn, reopen_work_station_if_needed};
use super::boot;
use super::propose_hold;
use super::refresh_run_rail_snapshot;
use super::snapshot_block::{run_rail_snapshot_block, RailFocus};
use super::state::RunRailState;
use super::user_turn;
use serde_json::Value;

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
pub fn on_turn_start(
    state: &mut RunRailState,
    messages: &[Message],
    is_boot: bool,
    open_work: OpenWorkCounts,
) {
    if is_boot {
        boot::restore_from_transcript(state, messages);
    }
    user_turn::release_propose_hold_if_user_replied(state, messages);
    reopen_work_station_if_needed(state, open_work);
}

pub fn refresh_snapshot(
    messages: &mut Vec<Message>,
    state: &RunRailState,
    focus: RailFocus<'_>,
    open_work: OpenWorkCounts,
) {
    refresh_run_rail_snapshot(messages, &run_rail_snapshot_block(state, focus, open_work));
}

pub fn after_assistant_turn(
    state: &mut RunRailState,
    assistant_text: &str,
    tool_names: &[&str],
    focus: Option<(String, String)>,
    ctx: super::transition::RailTransitionContext,
) -> RailAssistantTurn {
    let before = station_events::snapshot(state);
    apply_assistant_turn(state, assistant_text, tool_names, ctx);
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

/// Nudge after repeated mutation attempts on the same path at ACT.
pub enum ActRailNudge {
    /// Inject system nudge and continue the run (B-TOOL-01 spiral).
    InjectContinue(&'static str),
    /// Inject system nudge and stop the run (C6 circuit breaker).
    InjectStop(&'static str),
}

/// Failed mutation at ACT — returns nudge when spiral or circuit breaker triggers.
#[must_use]
pub fn on_act_tool_failure(
    state: &mut RunRailState,
    tool_name: &str,
    arguments: &Value,
) -> Option<ActRailNudge> {
    let outcome = record_act_tool_failure(state, tool_name, arguments)?;
    Some(match outcome {
        ActMutationAttemptOutcome::SevereNudgeAndStop => {
            ActRailNudge::InjectStop(severe_nudge_message())
        }
        ActMutationAttemptOutcome::SpiralNudge => {
            ActRailNudge::InjectContinue(spiral_nudge_message())
        }
    })
}

/// Successful mutation at ACT — count rewrites on the same path (B-TOOL-01).
#[must_use]
pub fn on_act_mutation_success(
    state: &mut RunRailState,
    tool_name: &str,
    arguments: &Value,
) -> Option<&'static str> {
    match record_act_mutation_attempt(state, tool_name, arguments, false)? {
        ActMutationAttemptOutcome::SpiralNudge => Some(spiral_nudge_message()),
        ActMutationAttemptOutcome::SevereNudgeAndStop => Some(severe_nudge_message()),
    }
}

/// Refine rail station after a successful parent tool call (C12).
pub fn on_tool_success(state: &mut RunRailState, tool_name: &str) {
    super::infer::on_tool_success(state, tool_name);
    if state.station == RunStation::Act && policy::is_mutation_tool(tool_name) {
        state.act_idle_turns = 0;
    }
    super::verify::reset_on_mutation_success(state, tool_name);
    super::post_work_idle::reset_post_work_idle(state);
    super::cycle_reopen::reopen_work_on_late_mutation(state, tool_name);
}

/// Record verify tool output; may regress VERIFY → ACT on failure.
#[must_use]
pub fn on_verify_tool_result(
    state: &mut RunRailState,
    tool_name: &str,
    output: &serde_json::Value,
    is_error: bool,
) -> bool {
    super::verify::on_verify_tool_result(state, tool_name, output, is_error)
}
