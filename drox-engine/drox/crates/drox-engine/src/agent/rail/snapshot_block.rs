//! Injected system block — current station + next candidate (mode A).
//!
//! Line-oriented format — parsed by `boot.rs` for cross-turn restore.

use drox_types::{Content, Message, Role};

use super::policy;
use super::propose_hold;
use super::state::RunRailState;
use super::station::RunStation;
use crate::agent::state::internal_plan::OpenWorkCounts;
use crate::agent::gates::VERIFY_WINDOWS_SHELL_REMINDER;

/// Marker for rail snapshot messages (distinct from architect run snapshot).
pub const RUN_RAIL_SNAPSHOT_MARKER: &str = "## Run rail (engine)";

/// Optional todo focus `(task_id, label)` for the « Current action » line.
pub type RailFocus<'a> = Option<(&'a str, &'a str)>;

#[must_use]
fn current_action_line(state: &RunRailState, focus: RailFocus<'_>) -> String {
    let hint = policy::station_action_hint(state.station);
    match focus {
        Some((id, label)) => format!("Current action: {hint} (focus task `{id}`: {label})"),
        None => format!("Current action: {hint}"),
    }
}

/// English snapshot for the model (engine contract).
#[must_use]
pub fn run_rail_snapshot_block(
    state: &RunRailState,
    focus: RailFocus<'_>,
    open_work: OpenWorkCounts,
) -> String {
    if should_use_compact_rail_snapshot(state, focus, open_work) {
        return run_rail_snapshot_block_compact(state);
    }
    run_rail_snapshot_block_full(state, focus, open_work)
}

#[must_use]
fn should_use_compact_rail_snapshot(
    state: &RunRailState,
    focus: RailFocus<'_>,
    open_work: OpenWorkCounts,
) -> bool {
    if focus.is_some() {
        return false;
    }
    if state.propose_awaiting_user {
        return false;
    }
    if open_work.has_open() {
        return false;
    }
    if state.station == RunStation::Verify && !state.verify_outcome.satisfied() {
        return false;
    }
    if !state.verify_outcome.satisfied()
        && matches!(
            state.station,
            RunStation::Act | RunStation::Verify | RunStation::Answer
        )
    {
        return false;
    }
    if matches!(state.verify_outcome, super::verify::VerifyOutcome::Fail(_)) {
        return false;
    }
    true
}

#[must_use]
fn run_rail_snapshot_block_compact(state: &RunRailState) -> String {
    let station = state.station.as_str();
    let depth = match state.depth {
        super::station::RunDepth::Short => "short",
        super::station::RunDepth::Complex => "complex",
    };
    let hint = policy::station_action_hint(state.station);
    format!(
        "{RUN_RAIL_SNAPSHOT_MARKER}\n\
         Station: {station} · {depth} · {hint}"
    )
}

#[must_use]
fn run_rail_snapshot_block_full(
    state: &RunRailState,
    focus: RailFocus<'_>,
    open_work: OpenWorkCounts,
) -> String {
    let station = state.station.as_str();
    let depth = match state.depth {
        super::station::RunDepth::Short => "short",
        super::station::RunDepth::Complex => "complex",
    };
    let current_action = current_action_line(state, focus);
    let propose_hold_line = if state.propose_awaiting_user {
        "Propose hold: active — advance blocked until the user replies."
    } else {
        "Propose hold: inactive"
    };
    let verify_line = match &state.verify_outcome {
        super::verify::VerifyOutcome::Fail(msg) => {
            format!("Verify failed: {msg} — station regressed to ACT; fix with file_edit/file_write, then verify again.")
        }
        super::verify::VerifyOutcome::Waived(reason) => {
            format!("Verify waived: {reason} — you may answer and close with `[phase: answering]` + `[phase: done]`.")
        }
        super::verify::VerifyOutcome::Unknown if state.station == super::station::RunStation::Verify => {
            "Verify: discover how this repo validates changes, then run `bash` or `lsp`; advance to ANSWER only after pass or `[verify: waived]`.".into()
        }
        super::verify::VerifyOutcome::Unknown
            if matches!(
                state.station,
                super::station::RunStation::Act
                    | super::station::RunStation::Verify
                    | super::station::RunStation::Answer
            ) =>
        {
            "Verify pending: after mutations, run a check that would catch regressions, or document `[verify: waived]` in answering.".into()
        }
        super::verify::VerifyOutcome::Pass if state.station == super::station::RunStation::Verify => {
            "Verify passed — you may answer and close with `[phase: answering]` + `[phase: done]`.".into()
        }
        _ => String::new(),
    };
    let advance_hint = if propose_hold::blocks_advance(state) {
        "Propose hold: waiting for the user — reply in `[phase: answering]` when ready."
    } else if open_work.has_open() {
        "Open plan steps remain — finish work, update `internal_plan_write`, then answer when ready."
    } else if state.station == super::station::RunStation::Verify
        && !state.verify_outcome.satisfied()
    {
        "Verify is pending — discover a project check, run `bash` or `lsp`, or document `[verify: waived]`."
    } else {
        "Optional: `[gate: hold]` to answer now, or `[gate: advance]` when this station feels complete."
    };
    let windows_verify_line = if state.station == RunStation::Verify {
        #[cfg(windows)]
        {
            format!("\n{VERIFY_WINDOWS_SHELL_REMINDER}")
        }
        #[cfg(not(windows))]
        {
            String::new()
        }
    } else {
        String::new()
    };
    let verify_block = if verify_line.is_empty() && windows_verify_line.is_empty() {
        String::new()
    } else {
        format!("{windows_verify_line}{}", if verify_line.is_empty() {
            String::new()
        } else {
            format!("\n{verify_line}")
        })
    };
    format!(
        "{RUN_RAIL_SNAPSHOT_MARKER}\n\
         Station: {station}\n\
         Depth: {depth}\n\
         {current_action}\n\
         {propose_hold_line}\n\
         {advance_hint}{verify_block}"
    )
}

/// Replace prior rail snapshot at end of transcript (each architect edit turn).
pub fn refresh_run_rail_snapshot(messages: &mut Vec<Message>, snapshot: &str) {
    if messages.iter().any(|m| {
        is_run_rail_snapshot_message(m)
            && m.content.iter().any(|block| {
                matches!(block, Content::Text { text, .. } if text.as_str() == snapshot)
            })
    }) {
        tracing::debug!(
            target: "drox.context",
            bytes = snapshot.len(),
            "run_rail_snapshot_skip=unchanged"
        );
        return;
    }
    messages.retain(|m| !is_run_rail_snapshot_message(m));
    messages.push(Message::system(snapshot.to_string()));
    tracing::debug!(
        target: "drox.context",
        bytes = snapshot.len(),
        "run_rail_snapshot_refresh"
    );
}

#[must_use]
pub fn is_run_rail_snapshot_message(m: &Message) -> bool {
    if !matches!(m.role, Role::System) {
        return false;
    }
    m.content.iter().any(|block| {
        matches!(block, Content::Text { text, .. } if text.contains(RUN_RAIL_SNAPSHOT_MARKER))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::state::RunRailState;

    #[test]
    fn snapshot_lists_station_and_candidate() {
        let block = run_rail_snapshot_block(&RunRailState::new(), None, OpenWorkCounts::default());
        assert!(block.contains(RUN_RAIL_SNAPSHOT_MARKER));
        assert!(block.contains("Station: intent"));
        assert!(block.lines().count() <= 2);
        let focused = run_rail_snapshot_block(
            &RunRailState::new(),
            Some(("t1", "Fix scroll snap")),
            OpenWorkCounts::default(),
        );
        assert!(focused.contains("Current action:"));
        assert!(focused.contains("focus task `t1`"));
    }

    #[test]
    fn refresh_run_rail_snapshot_skips_unchanged() {
        let block = run_rail_snapshot_block(&RunRailState::new(), None, OpenWorkCounts::default());
        let mut messages = vec![Message::system(block.clone())];
        refresh_run_rail_snapshot(&mut messages, &block);
        assert_eq!(messages.len(), 1);
        let changed = format!("{block}\nextra");
        refresh_run_rail_snapshot(&mut messages, &changed);
        assert_eq!(messages.len(), 1);
        assert!(is_run_rail_snapshot_message(&messages[0]));
        assert!(messages[0]
            .content
            .iter()
            .any(|b| matches!(b, Content::Text { text, .. } if text.contains("extra"))));
    }

    #[test]
    fn compact_rail_snapshot_shorter_when_stable() {
        let state = RunRailState::new();
        let full = run_rail_snapshot_block_full(&state, None, OpenWorkCounts::default());
        let compact = run_rail_snapshot_block_compact(&state);
        assert!(compact.contains("Station: intent"));
        assert!(compact.lines().count() <= 2);
        assert!(compact.len() < full.len());
    }

    #[test]
    fn compact_rail_disabled_when_propose_hold() {
        let state = RunRailState {
            propose_awaiting_user: true,
            ..RunRailState::new()
        };
        assert!(!should_use_compact_rail_snapshot(
            &state,
            None,
            OpenWorkCounts::default()
        ));
    }
}
