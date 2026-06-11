//! `ArchitectRunState`, snapshot, promotion texte user-facing.

use crate::agent::state::{
    inject_architect_run_snapshot_after_checkpoint, is_architect_run_snapshot_message,
    ArchitectRunState,
};
use drox_types::Content;
use crate::agent::stream::{run_has_promotable_user_facing_text, TurnOutcome};
use crate::run_spec::RoleId;
use drox_types::{Message, StopReason, Usage};
use serde_json::json;

use crate::event::Phase;

#[test]
fn ingest_map_paths() {
    let mut st = ArchitectRunState::new();
    st.ingest_workspace_map_output(&json!({
        "nodes": [
            {"path": "app-kdds-main/package.json"},
            {"path": "README.md"}
        ]
    }));
    assert!(st.workspace_map_loaded);
    assert!(st.workspace_paths.contains("app-kdds-main/package.json"));
}

#[test]
fn inject_architect_run_snapshot_after_checkpoint_replaces_previous() {
    use crate::orchestration::architect_run_context_block_compaction;
    let mut st = ArchitectRunState::new();
    st.anchor_user_request("Demande A");
    let mut msgs = vec![
        Message::system("main system"),
        Message::system("[context checkpoint — earlier messages compressed by the engine]\n\n## Objective\nold"),
        Message::user("tail"),
    ];
    inject_architect_run_snapshot_after_checkpoint(
        &mut msgs,
        &architect_run_context_block_compaction(&st, None),
    );
    assert_eq!(
        msgs.iter()
            .filter(|m| is_architect_run_snapshot_message(m))
            .count(),
        1
    );
    assert!(msgs[2..]
        .iter()
        .any(|m| is_architect_run_snapshot_message(m)));
    st.anchor_user_request("Demande B");
    inject_architect_run_snapshot_after_checkpoint(
        &mut msgs,
        &architect_run_context_block_compaction(&st, None),
    );
    assert_eq!(
        msgs.iter()
            .filter(|m| is_architect_run_snapshot_message(m))
            .count(),
        1
    );
    let anchor = msgs
        .iter()
        .find(|m| is_architect_run_snapshot_message(m))
        .unwrap();
    assert!(Content::collapse_text(&anchor.content).contains("Demande A"));
}

#[test]
fn run_has_promotable_user_facing_text_detects_long_reading_answer() {
    let outcome = TurnOutcome {
        text: "[phase: reading]\n# Analyse\n\nContenu détaillé suffisamment long \
            pour dépasser le seuil minimal de promotion automatique sans phase answering.\n\
            [phase: done]"
            .to_string(),
        tool_calls: vec![],
        reason: StopReason::EndTurn,
        usage: Usage::default(),
        final_phase: Some(Phase::Done),
        saw_answering: false,
        run_objective: None,
    };
    assert!(run_has_promotable_user_facing_text(
        &outcome,
        &[],
        RoleId::Architect,
        &crate::EngineTuning::default(),
    ));
}

#[test]
fn run_has_promotable_user_facing_text_accepts_short_discussion_greeting() {
    let outcome = TurnOutcome {
        text: "Salut ! Comment puis-je vous aider ?".to_string(),
        tool_calls: vec![],
        reason: StopReason::EndTurn,
        usage: Usage::default(),
        final_phase: None,
        saw_answering: false,
        run_objective: None,
    };
    assert!(run_has_promotable_user_facing_text(
        &outcome,
        &[],
        RoleId::ArchitectDiscussion,
        &crate::EngineTuning::default(),
    ));
}

#[test]
fn run_has_promotable_user_facing_text_rejects_short_done_only() {
    let outcome = TurnOutcome {
        text: "[phase: done]".to_string(),
        tool_calls: vec![],
        reason: StopReason::EndTurn,
        usage: Usage::default(),
        final_phase: Some(Phase::Done),
        saw_answering: false,
        run_objective: None,
    };
    assert!(!run_has_promotable_user_facing_text(
        &outcome,
        &[],
        RoleId::Architect,
        &crate::EngineTuning::default(),
    ));
}
