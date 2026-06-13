//! Rail station UI events — `railStationEnter` / `Hold` / `Done`.
//!
//! Design: `drox-engine/docs/1.4/archive/1.4.0/06-UI-BLOCKS.md`

use crate::event::AgentEvent;

use super::station::RunStation;
use super::state::RunRailState;

/// Station transition to emit after one assistant turn.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StationEvent {
    Enter {
        station: RunStation,
        label: Option<String>,
        task_id: Option<String>,
    },
    Hold { station: RunStation },
    Done { station: RunStation },
}

/// Diff station + PROPOSE hold flags before/after a turn.
#[derive(Debug, Clone, Copy)]
pub struct StationSnapshot {
    pub station: RunStation,
    pub propose_awaiting_user: bool,
}

#[must_use]
pub fn snapshot(state: &RunRailState) -> StationSnapshot {
    StationSnapshot {
        station: state.station,
        propose_awaiting_user: state.propose_awaiting_user,
    }
}

/// Build ordered station events from before/after snapshots.
#[must_use]
pub fn diff_transitions(
    before: StationSnapshot,
    after: &RunRailState,
    focus: Option<(String, String)>,
) -> Vec<StationEvent> {
    let mut out = Vec::new();
    if !before.propose_awaiting_user && after.propose_awaiting_user {
        out.push(StationEvent::Hold {
            station: RunStation::Propose,
        });
    }
    if before.station != after.station {
        out.push(StationEvent::Done {
            station: before.station,
        });
        let (task_id, label) = focus
            .map(|(id, lbl)| (Some(id), Some(lbl)))
            .unwrap_or((None, None));
        out.push(StationEvent::Enter {
            station: after.station,
            label,
            task_id,
        });
    }
    out
}

/// Map to [`AgentEvent`] for the IDE stream.
#[must_use]
pub fn to_agent_event(ev: &StationEvent) -> AgentEvent {
    match ev {
        StationEvent::Enter {
            station,
            label,
            task_id,
        } => AgentEvent::RailStationEnter {
            station: station.as_str().to_string(),
            label: label.clone(),
            task_id: task_id.clone(),
        },
        StationEvent::Hold { station } => AgentEvent::RailStationHold {
            station: station.as_str().to_string(),
        },
        StationEvent::Done { station } => AgentEvent::RailStationDone {
            station: station.as_str().to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::rail::transition::{apply_advance, RailTransitionContext};

    #[test]
    fn advance_emits_done_and_enter() {
        let before = snapshot(&RunRailState::new());
        let mut after = RunRailState::new();
        apply_advance(&mut after, RailTransitionContext::default());
        let events = diff_transitions(before, &after, None);
        assert_eq!(events.len(), 2);
        assert!(matches!(events[0], StationEvent::Done { .. }));
        assert!(matches!(
            events[1],
            StationEvent::Enter {
                station: RunStation::Read,
                ..
            }
        ));
    }

    #[test]
    fn propose_hold_emits_hold_event() {
        use crate::agent::rail::propose_hold;
        let mut state = RunRailState::new();
        state.station = RunStation::Propose;
        let before = snapshot(&state);
        propose_hold::enter_awaiting_user(&mut state);
        let events = diff_transitions(before, &state, None);
        assert!(events
            .iter()
            .any(|e| matches!(e, StationEvent::Hold { .. })));
    }
}
