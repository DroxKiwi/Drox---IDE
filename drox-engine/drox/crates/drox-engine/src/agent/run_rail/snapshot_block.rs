//! Injected system block — current station + next candidate (mode A).

use drox_types::{Content, Message, Role};

use super::state::RunRailState;

/// Marker for rail snapshot messages (distinct from architect run snapshot).
pub const RUN_RAIL_SNAPSHOT_MARKER: &str = "## Run rail (engine)";

/// English snapshot for the model (engine contract).
#[must_use]
pub fn run_rail_snapshot_block(state: &RunRailState) -> String {
    let station = state.station.as_str();
    let depth = match state.depth {
        super::station::RunDepth::Short => "short",
        super::station::RunDepth::Complex => "complex",
    };
    let next = state
        .next_candidate_mode_a()
        .map(|s| s.as_str())
        .unwrap_or("none");
    format!(
        "{RUN_RAIL_SNAPSHOT_MARKER}\n\
         Station: {station}\n\
         Depth: {depth}\n\
         Next candidate (mode A): {next}\n\
         Declare `[gate: hold]` to answer now, or `[gate: advance]` to enter the next station."
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
        let block = run_rail_snapshot_block(&RunRailState::new());
        assert!(block.contains(RUN_RAIL_SNAPSHOT_MARKER));
        assert!(block.contains("Station: intent"));
        assert!(block.contains("Next candidate"));
    }
}
