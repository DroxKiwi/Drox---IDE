//! Apply `hold` / `advance` and depth markers to [`RunRailState`].
//!
//! PROPOSE hold semantics: `propose_hold.rs`. Do not inline station rules here.
//!
//! Observational rail: stations follow model markers and tool inference only —
//! no mutation or verify blocking on advance.

use crate::agent::state::internal_plan::OpenWorkCounts;

use super::markers::{GateTransition, ParsedRailMarkers};
use super::propose_hold;
use super::station::RunStation;
use super::state::RunRailState;
use super::verify::VerifyOutcome;

/// Open-work context for hold / advance.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RailTransitionContext {
    pub open_work: OpenWorkCounts,
}

/// When open plan steps remain, VERIFY/ANSWER are premature — return to ACT so mutations work.
pub fn reopen_work_station_if_needed(_state: &mut RunRailState, _open: OpenWorkCounts) {
    // Observational rail — station is not overridden from open-work counts.
}

#[must_use]
fn advance_blocked_by_open_work(next: RunStation, open: OpenWorkCounts) -> bool {
    open.has_open() && matches!(next, RunStation::Verify | RunStation::Answer)
}

/// Apply parsed markers from one assistant turn.
pub fn apply_parsed_markers(
    state: &mut RunRailState,
    parsed: ParsedRailMarkers,
    ctx: RailTransitionContext,
) {
    if let Some(depth) = parsed.depth {
        state.depth = depth;
    }
    match parsed.gate {
        Some(GateTransition::Hold) => apply_hold(state, ctx),
        Some(GateTransition::Advance) => apply_advance(state, ctx),
        None => {}
    }
}

/// Parse assistant text and update rail state.
pub fn apply_assistant_turn(
    state: &mut RunRailState,
    assistant_text: &str,
    tool_names: &[&str],
    ctx: RailTransitionContext,
) {
    propose_hold::maybe_enter_from_assistant_text(state, assistant_text);
    let parsed = super::markers::parse_rail_markers(assistant_text);
    let had_gate = parsed.gate.is_some();
    apply_parsed_markers(state, parsed, ctx);
    if !had_gate {
        super::infer::align_station_from_tools(state, tool_names, ctx.open_work);
    }
}

/// `hold` — PROPOSE complex stays at PROPOSE (C4); otherwise jump to Answer when work is closed.
pub fn apply_hold(state: &mut RunRailState, ctx: RailTransitionContext) {
    if propose_hold::try_enter_from_hold_marker(state) {
        return;
    }
    if ctx.open_work.has_open() {
        return;
    }
    state.station = RunStation::Answer;
}

/// `advance` — enter next linear candidate (mode A); blocked during PROPOSE hold or open work.
pub fn apply_advance(state: &mut RunRailState, ctx: RailTransitionContext) {
    if propose_hold::blocks_advance(state) {
        return;
    }
    let Some(next) = state.next_candidate_mode_a() else {
        return;
    };
    if advance_blocked_by_open_work(next, ctx.open_work) {
        return;
    }
    state.station = next;
    if next == RunStation::Verify {
        state.visited_verify = true;
        state.verify_outcome = VerifyOutcome::Unknown;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::rail::station::RunDepth;
    use crate::agent::rail::verify::VerifyOutcome;

    fn ctx(open: OpenWorkCounts) -> RailTransitionContext {
        RailTransitionContext { open_work: open }
    }

    #[test]
    fn advance_intent_to_read() {
        let mut state = RunRailState::new();
        apply_advance(&mut state, ctx(OpenWorkCounts::default()));
        assert_eq!(state.station, RunStation::Read);
    }

    #[test]
    fn hold_jumps_to_answer_from_read() {
        let mut state = RunRailState::new();
        state.station = RunStation::Read;
        apply_hold(&mut state, ctx(OpenWorkCounts::default()));
        assert_eq!(state.station, RunStation::Answer);
    }

    #[test]
    fn hold_stays_when_work_open() {
        let mut state = RunRailState::new();
        state.station = RunStation::Act;
        apply_hold(
            &mut state,
            ctx(OpenWorkCounts {
                pending: 1,
                in_progress: 0,
            }),
        );
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn advance_act_blocked_with_open_work() {
        let mut state = RunRailState::new();
        state.station = RunStation::Act;
        apply_advance(
            &mut state,
            ctx(OpenWorkCounts {
                pending: 1,
                in_progress: 1,
            }),
        );
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn advance_act_to_verify_when_work_closed() {
        let mut state = RunRailState::new();
        state.station = RunStation::Act;
        apply_advance(&mut state, ctx(OpenWorkCounts::default()));
        assert_eq!(state.station, RunStation::Verify);
        assert!(state.visited_verify);
    }

    #[test]
    fn reopen_work_is_observational_noop() {
        let mut state = RunRailState::new();
        state.station = RunStation::Answer;
        reopen_work_station_if_needed(
            &mut state,
            OpenWorkCounts {
                pending: 0,
                in_progress: 1,
            },
        );
        assert_eq!(state.station, RunStation::Answer);
    }

    #[test]
    fn complex_read_advances_to_propose() {
        let mut state = RunRailState::new();
        apply_assistant_turn(
            &mut state,
            "[depth: complex]\n[gate: advance]",
            &[],
            ctx(OpenWorkCounts::default()),
        );
        assert_eq!(state.depth, RunDepth::Complex);
        assert_eq!(state.station, RunStation::Read);
        apply_advance(&mut state, ctx(OpenWorkCounts::default()));
        assert_eq!(state.station, RunStation::Propose);
    }

    #[test]
    fn advance_verify_to_answer_without_verify_gate() {
        let mut state = RunRailState {
            station: RunStation::Verify,
            verify_outcome: VerifyOutcome::Unknown,
            ..RunRailState::new()
        };
        apply_advance(&mut state, ctx(OpenWorkCounts::default()));
        assert_eq!(state.station, RunStation::Answer);
    }

    #[test]
    fn propose_hold_blocks_advance_to_plan() {
        let mut state = RunRailState {
            station: RunStation::Propose,
            depth: RunDepth::Complex,
            propose_awaiting_user: true,
            ..RunRailState::new()
        };
        apply_advance(&mut state, ctx(OpenWorkCounts::default()));
        assert_eq!(state.station, RunStation::Propose);
    }
}
