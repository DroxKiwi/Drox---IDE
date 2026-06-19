//! Restore rail state from the last injected snapshot (cross-turn continuity).

use drox_types::{Content, Message, Role};

use super::snapshot_block::RUN_RAIL_SNAPSHOT_MARKER;
use super::station::{RunDepth, RunStation};
use super::state::RunRailState;
use super::user_turn;

/// Parse and apply the last `## Run rail (engine)` block from transcript.
pub fn restore_from_transcript(state: &mut RunRailState, messages: &[Message]) {
    let Some(text) = last_rail_snapshot_text(messages) else {
        return;
    };
    if let Some(station) = parse_station(&text) {
        state.station = station;
    }
    if let Some(depth) = parse_depth(&text) {
        state.depth = depth;
    }
    state.propose_awaiting_user = parse_propose_hold(&text);
    user_turn::release_propose_hold_if_user_replied(state, messages);
}

fn last_rail_snapshot_text(messages: &[Message]) -> Option<String> {
    messages.iter().rev().find_map(|m| {
        if m.role != Role::System {
            return None;
        }
        m.content.iter().find_map(|block| {
            match block {
                Content::Text { text, .. } if text.contains(RUN_RAIL_SNAPSHOT_MARKER) => {
                    Some(text.clone())
                }
                _ => None,
            }
        })
    })
}

fn parse_station(text: &str) -> Option<RunStation> {
    let line = text.lines().find(|l| l.starts_with("Station: "))?;
    let value = line.trim_start_matches("Station: ").trim();
    let station_token = value.split('·').next().unwrap_or(value).trim();
    match station_token {
        "intent" => Some(RunStation::Intent),
        "read" => Some(RunStation::Read),
        "propose" => Some(RunStation::Propose),
        "plan" => Some(RunStation::Plan),
        "act" => Some(RunStation::Act),
        "verify" => Some(RunStation::Verify),
        "answer" => Some(RunStation::Answer),
        _ => None,
    }
}

fn parse_depth(text: &str) -> Option<RunDepth> {
    if let Some(line) = text.lines().find(|l| l.starts_with("Depth: ")) {
        return match line.trim_start_matches("Depth: ").trim() {
            "complex" => Some(RunDepth::Complex),
            "short" => Some(RunDepth::Short),
            _ => None,
        };
    }
    let line = text.lines().find(|l| l.starts_with("Station: "))?;
    let parts: Vec<&str> = line.split('·').map(str::trim).collect();
    if parts.len() >= 2 {
        return match parts[1] {
            "complex" => Some(RunDepth::Complex),
            "short" => Some(RunDepth::Short),
            _ => None,
        };
    }
    None
}

fn parse_propose_hold(text: &str) -> bool {
    text.lines().any(|l| {
        l.starts_with("Propose hold:")
            && l.contains("active")
            && !l.contains("inactive")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::snapshot_block::run_rail_snapshot_block;
    use crate::agent::rail::OpenWorkCounts;

    #[test]
    fn restores_station_from_snapshot() {
        let mut state = RunRailState::new();
        state.station = RunStation::Read;
        state.depth = RunDepth::Complex;
        let snap = run_rail_snapshot_block(&state, None, OpenWorkCounts::default());
        let messages = vec![Message::system(snap)];
        state.station = RunStation::Intent;
        restore_from_transcript(&mut state, &messages);
        assert_eq!(state.station, RunStation::Read);
        assert_eq!(state.depth, RunDepth::Complex);
    }

    #[test]
    fn restores_station_from_compact_snapshot() {
        let snap = "## Run rail (engine)\nStation: act · short · apply edits";
        let mut state = RunRailState::new();
        let messages = vec![Message::system(snap.to_string())];
        restore_from_transcript(&mut state, &messages);
        assert_eq!(state.station, RunStation::Act);
        assert_eq!(state.depth, RunDepth::Short);
    }
}
