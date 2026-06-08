//! Apply `hold` / `advance` and depth markers to [`RunRailState`].
//!
//! PROPOSE hold semantics: `propose_hold.rs`. Do not inline station rules here.

use super::markers::{GateTransition, ParsedRailMarkers};
use super::propose_hold;
use super::station::RunStation;
use super::state::RunRailState;

/// Apply parsed markers from one assistant turn.
pub fn apply_parsed_markers(state: &mut RunRailState, parsed: ParsedRailMarkers) {
    if let Some(depth) = parsed.depth {
        state.depth = depth;
    }
    match parsed.gate {
        Some(GateTransition::Hold) => apply_hold(state),
        Some(GateTransition::Advance) => apply_advance(state),
        None => {}
    }
}

/// Parse assistant text and update rail state.
pub fn apply_assistant_turn(state: &mut RunRailState, assistant_text: &str) {
    propose_hold::maybe_enter_from_assistant_text(state, assistant_text);
    let parsed = super::markers::parse_rail_markers(assistant_text);
    apply_parsed_markers(state, parsed);
}

/// `hold` — PROPOSE complex stays at PROPOSE (C4); otherwise → ANSWER.
pub fn apply_hold(state: &mut RunRailState) {
    if propose_hold::try_enter_from_hold_marker(state) {
        return;
    }
    state.station = RunStation::Answer;
}

/// `advance` — enter next linear candidate (mode A); blocked during PROPOSE hold.
pub fn apply_advance(state: &mut RunRailState) {
    if propose_hold::blocks_advance(state) {
        return;
    }
    if let Some(next) = state.next_candidate_mode_a() {
        state.station = next;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::run_rail::station::RunDepth;

    #[test]
    fn advance_intent_to_read() {
        let mut state = RunRailState::new();
        apply_advance(&mut state);
        assert_eq!(state.station, RunStation::Read);
    }

    #[test]
    fn hold_jumps_to_answer_from_read() {
        let mut state = RunRailState::new();
        state.station = RunStation::Read;
        apply_hold(&mut state);
        assert_eq!(state.station, RunStation::Answer);
    }

    #[test]
    fn complex_read_advances_to_propose() {
        let mut state = RunRailState::new();
        apply_assistant_turn(&mut state, "[depth: complex]\n[gate: advance]");
        assert_eq!(state.depth, RunDepth::Complex);
        assert_eq!(state.station, RunStation::Read);
        apply_advance(&mut state);
        assert_eq!(state.station, RunStation::Propose);
    }

    #[test]
    fn propose_hold_blocks_advance_to_plan() {
        let mut state = RunRailState {
            station: RunStation::Propose,
            depth: RunDepth::Complex,
            propose_awaiting_user: true,
            ..RunRailState::new()
        };
        apply_advance(&mut state);
        assert_eq!(state.station, RunStation::Propose);
    }
}
