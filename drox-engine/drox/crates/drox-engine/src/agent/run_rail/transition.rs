//! Apply `hold` / `advance` and depth markers to [`RunRailState`].

use super::markers::{GateTransition, ParsedRailMarkers};
use super::station::RunStation;
use super::state::RunRailState;

/// Apply parsed markers from one assistant turn.
pub fn apply_parsed_markers(state: &mut RunRailState, parsed: ParsedRailMarkers) {
    if let Some(depth) = parsed.depth {
        state.depth = depth;
    }
    match parsed.gate {
        Some(GateTransition::Hold) => state.apply_hold(),
        Some(GateTransition::Advance) => state.apply_advance(),
        None => {}
    }
}

/// Parse assistant text and update rail state.
pub fn apply_assistant_turn(state: &mut RunRailState, assistant_text: &str) {
    let parsed = super::markers::parse_rail_markers(assistant_text);
    apply_parsed_markers(state, parsed);
}

impl RunRailState {
    /// `hold` — stop at current depth; move to answering station.
    pub fn apply_hold(&mut self) {
        self.station = RunStation::Answer;
    }

    /// `advance` — enter next linear candidate (mode A).
    pub fn apply_advance(&mut self) {
        if let Some(next) = self.next_candidate_mode_a() {
            self.station = next;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::run_rail::station::RunDepth;

    #[test]
    fn advance_intent_to_read() {
        let mut state = RunRailState::new();
        state.apply_advance();
        assert_eq!(state.station, RunStation::Read);
    }

    #[test]
    fn hold_jumps_to_answer() {
        let mut state = RunRailState::new();
        state.station = RunStation::Read;
        state.apply_hold();
        assert_eq!(state.station, RunStation::Answer);
    }

    #[test]
    fn apply_depth_from_text() {
        let mut state = RunRailState::new();
        apply_assistant_turn(&mut state, "[depth: complex]\n[gate: advance]");
        assert_eq!(state.depth, RunDepth::Complex);
        assert_eq!(state.station, RunStation::Read);
    }
}
