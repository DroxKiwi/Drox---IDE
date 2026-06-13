//! Apply `hold` / `advance` and depth markers to [`RunRailState`].
//!
//! PROPOSE hold semantics: `propose_hold.rs`. Do not inline station rules here.

use super::markers::{GateTransition, ParsedRailMarkers};
use super::propose_hold;
use super::station::RunStation;
use super::state::RunRailState;
use super::verify::VerifyOutcome;

/// Open architect todo counts (pending + in_progress) for advance / hold gates.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct OpenTodoCounts {
    pub pending: u64,
    pub in_progress: u64,
}

impl OpenTodoCounts {
    #[must_use]
    pub const fn has_open(self) -> bool {
        self.pending > 0 || self.in_progress > 0
    }
}

/// Workspace + todo context for hold / advance (B-RAIL-02).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RailTransitionContext {
    pub open_todos: OpenTodoCounts,
    pub mutation_expected: bool,
    pub mutation_count: u32,
}

/// Run edit : brief mutation sans patch — forcer ACT avant nouvelle tentative de clôture.
pub fn force_act_for_expected_mutation(state: &mut RunRailState) {
    if matches!(
        state.station,
        RunStation::Intent | RunStation::Read | RunStation::Plan | RunStation::Propose | RunStation::Verify | RunStation::Answer
    ) {
        state.station = RunStation::Act;
    }
}

/// When todos remain, VERIFY/ANSWER are premature — return to ACT so mutations work.
pub fn reopen_work_station_if_needed(state: &mut RunRailState, open: OpenTodoCounts) {
    if !open.has_open() {
        return;
    }
    if matches!(state.station, RunStation::Verify | RunStation::Answer) {
        state.station = RunStation::Act;
    }
}

#[must_use]
fn advance_blocked_by_open_todos(next: RunStation, open: OpenTodoCounts) -> bool {
    open.has_open() && matches!(next, RunStation::Verify | RunStation::Answer)
}

#[must_use]
fn advance_blocked_without_workspace_mutation(
    state: &RunRailState,
    next: RunStation,
    ctx: RailTransitionContext,
) -> bool {
    ctx.mutation_expected
        && ctx.mutation_count == 0
        && state.station == RunStation::Act
        && next == RunStation::Verify
}

#[must_use]
fn advance_blocked_until_verify_passed(state: &RunRailState, next: RunStation) -> bool {
    state.station == RunStation::Verify
        && next == RunStation::Answer
        && !state.verify_outcome.passed()
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
        super::infer::align_station_from_tools(state, tool_names, ctx.open_todos);
    }
}

/// `hold` — PROPOSE complex stays at PROPOSE (C4); READ/INTENT + mutation brief → PLAN (B-RAIL-02).
pub fn apply_hold(state: &mut RunRailState, ctx: RailTransitionContext) {
    if propose_hold::try_enter_from_hold_marker(state) {
        return;
    }
    if ctx.open_todos.has_open() {
        return;
    }
    if matches!(state.station, RunStation::Intent | RunStation::Read) && ctx.mutation_expected {
        state.station = RunStation::Plan;
        return;
    }
    state.station = RunStation::Answer;
}

/// `advance` — enter next linear candidate (mode A); blocked during PROPOSE hold or open todos.
pub fn apply_advance(state: &mut RunRailState, ctx: RailTransitionContext) {
    if propose_hold::blocks_advance(state) {
        return;
    }
    let Some(next) = state.next_candidate_mode_a() else {
        return;
    };
    if advance_blocked_by_open_todos(next, ctx.open_todos) {
        return;
    }
    if advance_blocked_without_workspace_mutation(state, next, ctx) {
        return;
    }
    if advance_blocked_until_verify_passed(state, next) {
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

    fn ctx(open: OpenTodoCounts) -> RailTransitionContext {
        RailTransitionContext {
            open_todos: open,
            mutation_expected: false,
            mutation_count: 0,
        }
    }

    #[test]
    fn advance_intent_to_read() {
        let mut state = RunRailState::new();
        apply_advance(&mut state, ctx(OpenTodoCounts::default()));
        assert_eq!(state.station, RunStation::Read);
    }

    #[test]
    fn hold_jumps_to_answer_from_read() {
        let mut state = RunRailState::new();
        state.station = RunStation::Read;
        apply_hold(&mut state, ctx(OpenTodoCounts::default()));
        assert_eq!(state.station, RunStation::Answer);
    }

    #[test]
    fn hold_mutation_brief_from_read_goes_to_plan() {
        let mut state = RunRailState::new();
        state.station = RunStation::Read;
        apply_hold(
            &mut state,
            RailTransitionContext {
                open_todos: OpenTodoCounts::default(),
                mutation_expected: true,
                mutation_count: 0,
            },
        );
        assert_eq!(state.station, RunStation::Plan);
    }

    #[test]
    fn advance_act_blocked_without_mutation_when_expected() {
        let mut state = RunRailState::new();
        state.station = RunStation::Act;
        apply_advance(
            &mut state,
            RailTransitionContext {
                open_todos: OpenTodoCounts::default(),
                mutation_expected: true,
                mutation_count: 0,
            },
        );
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn hold_stays_when_todos_open() {
        let mut state = RunRailState::new();
        state.station = RunStation::Act;
        apply_hold(
            &mut state,
            ctx(OpenTodoCounts {
                pending: 1,
                in_progress: 0,
            }),
        );
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn advance_act_blocked_with_open_todos() {
        let mut state = RunRailState::new();
        state.station = RunStation::Act;
        apply_advance(
            &mut state,
            ctx(OpenTodoCounts {
                pending: 1,
                in_progress: 1,
            }),
        );
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn advance_act_to_verify_when_todos_closed() {
        let mut state = RunRailState::new();
        state.station = RunStation::Act;
        apply_advance(&mut state, ctx(OpenTodoCounts::default()));
        assert_eq!(state.station, RunStation::Verify);
        assert!(state.visited_verify);
    }

    #[test]
    fn reopen_work_from_answer_with_open_todos() {
        let mut state = RunRailState::new();
        state.station = RunStation::Answer;
        reopen_work_station_if_needed(
            &mut state,
            OpenTodoCounts {
                pending: 0,
                in_progress: 1,
            },
        );
        assert_eq!(state.station, RunStation::Act);
    }

    #[test]
    fn complex_read_advances_to_propose() {
        let mut state = RunRailState::new();
        apply_assistant_turn(
            &mut state,
            "[depth: complex]\n[gate: advance]",
            &[],
            ctx(OpenTodoCounts::default()),
        );
        assert_eq!(state.depth, RunDepth::Complex);
        assert_eq!(state.station, RunStation::Read);
        apply_advance(&mut state, ctx(OpenTodoCounts::default()));
        assert_eq!(state.station, RunStation::Propose);
    }

    #[test]
    fn advance_verify_to_answer_blocked_without_pass() {
        let mut state = RunRailState {
            station: RunStation::Verify,
            verify_outcome: VerifyOutcome::Unknown,
            ..RunRailState::new()
        };
        apply_advance(&mut state, ctx(OpenTodoCounts::default()));
        assert_eq!(state.station, RunStation::Verify);
        state.verify_outcome = VerifyOutcome::Pass;
        apply_advance(&mut state, ctx(OpenTodoCounts::default()));
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
        apply_advance(&mut state, ctx(OpenTodoCounts::default()));
        assert_eq!(state.station, RunStation::Propose);
    }
}
