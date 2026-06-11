//! PROPOSE hold (C4) — block advance until the next user message.
//!
//! Design: `drox-engine/docs/1.4/archive/1.4.0/03-STATIONS.md` (PROPOSE, depth complex).

use super::station::{RunDepth, RunStation};
use super::state::RunRailState;

/// Whether `[gate: advance]` is blocked at PROPOSE.
#[must_use]
pub fn blocks_advance(state: &RunRailState) -> bool {
    state.propose_awaiting_user
}

/// Enter PROPOSE hold from `[gate: hold]` at PROPOSE + complex depth.
///
/// Returns `true` when the hold was consumed (station stays `Propose`).
#[must_use]
pub fn try_enter_from_hold_marker(state: &mut RunRailState) -> bool {
    if state.station != RunStation::Propose || state.depth != RunDepth::Complex {
        return false;
    }
    enter_awaiting_user(state);
    true
}

/// Set hold when assistant text at PROPOSE contains an open user question.
pub fn maybe_enter_from_assistant_text(state: &mut RunRailState, assistant_text: &str) {
    if state.station != RunStation::Propose || state.depth != RunDepth::Complex {
        return;
    }
    if detect_open_user_question(assistant_text) {
        enter_awaiting_user(state);
    }
}

/// Run should end so the user can reply (no `ask_user_question` required).
#[must_use]
pub fn should_pause_run(state: &RunRailState) -> bool {
    state.propose_awaiting_user
}

pub fn enter_awaiting_user(state: &mut RunRailState) {
    state.propose_awaiting_user = true;
}

pub fn clear_awaiting_user(state: &mut RunRailState) {
    state.propose_awaiting_user = false;
}

/// Heuristic: explicit question to the user (English proposal at PROPOSE).
#[must_use]
pub fn detect_open_user_question(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.contains('?') {
        return true;
    }
    let lower = trimmed.to_ascii_lowercase();
    [
        "which option",
        "would you prefer",
        "do you want",
        "please confirm",
        "your preference",
        "let me know",
    ]
    .iter()
    .any(|p| lower.contains(p))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hold_at_propose_complex_stays_at_propose() {
        let mut state = RunRailState {
            station: RunStation::Propose,
            depth: RunDepth::Complex,
            ..RunRailState::new()
        };
        assert!(try_enter_from_hold_marker(&mut state));
        assert_eq!(state.station, RunStation::Propose);
        assert!(state.propose_awaiting_user);
    }

    #[test]
    fn hold_at_read_still_goes_to_answer_via_transition() {
        let mut state = RunRailState {
            station: RunStation::Read,
            depth: RunDepth::Complex,
            ..RunRailState::new()
        };
        assert!(!try_enter_from_hold_marker(&mut state));
    }

    #[test]
    fn question_mark_triggers_awaiting() {
        assert!(detect_open_user_question("Palette A or B — which do you prefer?"));
    }
}
