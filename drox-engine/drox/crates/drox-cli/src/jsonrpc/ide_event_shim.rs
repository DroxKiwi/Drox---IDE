//! Projection des [`AgentEvent`] TUI vers le contrat wire Drox IDE (phases +
//! stations rail synthétiques).

use drox_engine::{AgentEvent, Phase};
use serde_json::{Value, json};

/// État du shim pour une exécution `agent.run` (stations rail ouvertes).
#[derive(Debug, Default)]
pub struct IdeEventShimState {
    open_rail_station: Option<&'static str>,
}

/// Map phase TUI → id station rail IDE (`railSegmentTypes.ts`).
#[must_use]
pub const fn rail_station_for_phase(phase: Phase) -> Option<&'static str> {
    match phase {
        Phase::InternalReasoning => None,
        Phase::Analyzing | Phase::Reading => Some("read"),
        Phase::Clarifying => Some("propose"),
        Phase::Planning => Some("plan"),
        Phase::Acting => Some("act"),
        Phase::Testing | Phase::Verifying => Some("verify"),
        Phase::Answering | Phase::Done => Some("answer"),
    }
}

#[must_use]
pub fn rail_station_label(station: &str) -> &'static str {
    match station {
        "intent" => "Intention",
        "read" => "Exploration",
        "propose" => "Proposition",
        "plan" => "Plan",
        "act" => "Exécution",
        "verify" => "Vérification",
        "answer" => "Réponse",
        _ => "Station",
    }
}

fn rail_enter(station: &str) -> Value {
    json!({
        "kind": "rail_station_enter",
        "station": station,
        "label": rail_station_label(station),
    })
}

fn rail_done(station: &str) -> Value {
    json!({
        "kind": "rail_station_done",
        "station": station,
    })
}

fn close_open_rail_station(state: &mut IdeEventShimState, out: &mut Vec<Value>) {
    if let Some(prev) = state.open_rail_station.take() {
        out.push(rail_done(prev));
    }
}

/// Étend un événement moteur en une ou plusieurs notifications `agent/event`.
pub fn expand_agent_event_for_ide(ev: &AgentEvent, state: &mut IdeEventShimState) -> Vec<Value> {
    let mut out = Vec::new();

    match ev {
        AgentEvent::PhaseEnter { phase } => {
            close_open_rail_station(state, &mut out);
            if let Some(station) = rail_station_for_phase(*phase) {
                out.push(rail_enter(station));
                state.open_rail_station = Some(station);
            }
            if let Ok(v) = serde_json::to_value(ev) {
                out.push(v);
            }
        }
        AgentEvent::PhaseClose | AgentEvent::Stop { .. } => {
            close_open_rail_station(state, &mut out);
            if let Ok(v) = serde_json::to_value(ev) {
                out.push(v);
            }
        }
        _ => {
            if let Ok(v) = serde_json::to_value(ev) {
                out.push(v);
            }
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phase_reading_emits_rail_enter_and_phase_enter() {
        let mut state = IdeEventShimState::default();
        let ev = AgentEvent::PhaseEnter {
            phase: Phase::Reading,
        };
        let wire = expand_agent_event_for_ide(&ev, &mut state);
        assert_eq!(wire.len(), 2);
        assert_eq!(wire[0]["kind"], "rail_station_enter");
        assert_eq!(wire[0]["station"], "read");
        assert_eq!(wire[1]["kind"], "phase_enter");
    }

    #[test]
    fn phase_transition_closes_previous_station() {
        let mut state = IdeEventShimState::default();
        let _ = expand_agent_event_for_ide(
            &AgentEvent::PhaseEnter {
                phase: Phase::Reading,
            },
            &mut state,
        );
        let wire = expand_agent_event_for_ide(
            &AgentEvent::PhaseEnter {
                phase: Phase::Acting,
            },
            &mut state,
        );
        assert!(wire.iter().any(|v| v["kind"] == "rail_station_done" && v["station"] == "read"));
        assert!(wire.iter().any(|v| v["kind"] == "rail_station_enter" && v["station"] == "act"));
    }

    #[test]
    fn text_delta_passes_through_unchanged() {
        let mut state = IdeEventShimState::default();
        let ev = AgentEvent::TextDelta {
            text: "hi".into(),
        };
        let wire = expand_agent_event_for_ide(&ev, &mut state);
        assert_eq!(wire.len(), 1);
        assert_eq!(wire[0]["kind"], "text_delta");
    }

    #[test]
    fn tool_use_and_todo_events_pass_through() {
        use drox_types::ToolUseId;

        let mut state = IdeEventShimState::default();
        let id = ToolUseId::new();
        let tool = AgentEvent::ToolStart {
            id: id.clone(),
            name: "file_read".into(),
            arguments: json!({ "path": "a.rs" }),
        };
        let wire = expand_agent_event_for_ide(&tool, &mut state);
        assert_eq!(wire.len(), 1);
        assert_eq!(wire[0]["kind"], "tool_start");

        let done = AgentEvent::ToolFinish {
            id,
            output: json!({ "content": "ok" }),
            is_error: false,
        };
        let wire = expand_agent_event_for_ide(&done, &mut state);
        assert_eq!(wire[0]["kind"], "tool_finish");
    }
}
