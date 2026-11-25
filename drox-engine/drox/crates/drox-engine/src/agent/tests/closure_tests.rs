//! Matrice clôture mécanique (doc cline_compareer 03 §F).

use super::*;

use crate::agent::config::AgentConfig;
use crate::agent::Agent;
use crate::event::AgentEvent;
use drox_types::{StopReason, StreamEvent, Usage};

#[tokio::test]
async fn acting_without_tools_closes_in_one_turn() {
    let llm = Arc::new(ScriptedLlm::new(vec![vec![
        StreamEvent::Start,
        StreamEvent::TextDelta {
            text: "[phase: acting]\nVoici la réponse complète sans outil.\n".into(),
        },
        StreamEvent::Stop {
            reason: StopReason::EndTurn,
            usage: Usage::default(),
        },
    ]]));

    let registry = Arc::new(ToolRegistry::with_simple_tools());
    let ctx = ToolContext::new(camino::Utf8PathBuf::from("."), false);
    let agent = Agent::new(llm, registry, ctx, AgentConfig::default());

    let events: Vec<_> = agent
        .run("test acting close")
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .collect::<Result<_, _>>()
        .unwrap();

    let stop_count = events
        .iter()
        .filter(|e| matches!(e, AgentEvent::Stop { .. }))
        .count();
    assert_eq!(stop_count, 1, "exactly one Stop");
    assert!(
        events.iter().any(|e| {
            matches!(
                e,
                AgentEvent::StatusNotice { notice_kind, .. } if notice_kind == "closure_mechanical"
            )
        }),
        "closure notice expected"
    );
    let nudge_intent = events.iter().any(|e| {
        if let AgentEvent::TextDelta { text } = e {
            text.contains("INTENT_ONLY_WRITE")
        } else {
            false
        }
    });
    assert!(!nudge_intent, "FX-B nudges must not fire");
}