//! Injected system block — current station + next candidate (mode A).
//!
//! Line-oriented format — parsed by `boot.rs` for cross-turn restore.

use drox_types::{Content, Message, Role};

use super::policy;
use super::propose_hold;
use super::state::RunRailState;
use super::transition::OpenTodoCounts;

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
    open_todos: OpenTodoCounts,
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
        super::verify::VerifyOutcome::Unknown if state.station == super::station::RunStation::Verify => {
            "Verify: run bash or lsp diagnostics; advance to ANSWER only after a passing check.".into()
        }
        super::verify::VerifyOutcome::Pass if state.station == super::station::RunStation::Verify => {
            "Verify passed — you may `[gate: advance]` to ANSWER.".into()
        }
        _ => String::new(),
    };
    let advance_hint = if propose_hold::blocks_advance(state) {
        "Advance is blocked — wait for the user message, then declare `[gate: advance]`."
    } else if open_todos.has_open() {
        "Open todos: do not `[gate: advance]` to verify/answer until every item is \
         `completed` or `cancelled`. Finish work on ACT, update `todo_write`, then advance."
    } else if state.station == super::station::RunStation::Verify
        && !state.verify_outcome.passed()
    {
        "Advance to ANSWER is blocked until verify passes (bash exit 0 or lsp diagnostics clean)."
    } else {
        "Declare `[gate: hold]` to answer now, or `[gate: advance]` when this station is done."
    };
    let verify_block = if verify_line.is_empty() {
        String::new()
    } else {
        format!("\n{verify_line}")
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
    messages.retain(|m| !is_run_rail_snapshot_message(m));
    messages.push(Message::system(snapshot.to_string()));
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
        let block = run_rail_snapshot_block(&RunRailState::new(), None, OpenTodoCounts::default());
        assert!(block.contains(RUN_RAIL_SNAPSHOT_MARKER));
        assert!(block.contains("Station: intent"));
        assert!(block.contains("Current action:"));
        let focused = run_rail_snapshot_block(
            &RunRailState::new(),
            Some(("t1", "Fix scroll snap")),
            OpenTodoCounts::default(),
        );
        assert!(focused.contains("focus task `t1`"));
    }
}
