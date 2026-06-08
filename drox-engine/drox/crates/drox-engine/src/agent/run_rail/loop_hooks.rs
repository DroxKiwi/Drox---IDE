//! Thin facade for `loop.rs` — boot, turns, sanity gate, ACT failures.
//!
//! `loop.rs` should call only this module (≤ 5 entry points).

use drox_types::Message;
use serde_json::Value;

use super::act_failure::{ActFailureOutcome, record_act_tool_failure, severe_nudge_message};
use super::transition::apply_assistant_turn;
use super::boot;
use super::cycle_sanity_gate;
use super::propose_hold;
use super::refresh_run_rail_snapshot;
use super::run_rail_snapshot_block;
use super::state::RunRailState;
use super::user_turn;

/// Action after processing an assistant turn.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AfterAssistantAction {
    Continue,
    /// PROPOSE hold active — end run so the user can reply (C4).
    PauseForUser,
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

pub fn after_assistant_turn(state: &mut RunRailState, assistant_text: &str) -> AfterAssistantAction {
    apply_assistant_turn(state, assistant_text);
    if propose_hold::should_pause_run(state) {
        AfterAssistantAction::PauseForUser
    } else {
        AfterAssistantAction::Continue
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
