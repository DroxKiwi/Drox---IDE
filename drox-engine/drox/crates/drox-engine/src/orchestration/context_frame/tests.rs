//! Golden-style tests for iteration_start frame parity.

use drox_types::{Content, Message, Role};

use crate::agent::{
    is_architect_run_snapshot_message, is_run_rail_snapshot_message,
    is_tool_protocol_snapshot_message, ARCHITECT_RUN_SNAPSHOT_MARKER, ArchitectRunState,
};
use crate::orchestration::context_frame::{
    apply_architect_iteration_start, append_gate_nudge, architect_iteration_start_layers,
    ArchitectIterationInput, LayerId, NudgeId,
};

#[test]
fn iteration_start_manifest_has_five_layers() {
    let layers = architect_iteration_start_layers();
    assert_eq!(layers.len(), 5);
    assert_eq!(layers[0].id, LayerId::CtxRunSnapshot);
    assert_eq!(layers[1].id, LayerId::InternalPlanSnapshot);
    assert_eq!(layers[4].id, LayerId::RailSnapshot);
}

#[test]
fn apply_iteration_start_injects_three_marked_blocks_when_rail_active() {
    let mut messages = vec![
        Message::system("boot core"),
        Message::user("fix the svg animation"),
    ];
    let mut architect_state = ArchitectRunState::new();
    architect_state.anchor_user_request("fix the svg animation");
    architect_state.rail.station = crate::RunStation::Read;

    let tuning = crate::EngineTuning::default();
    let mut input = ArchitectIterationInput {
        messages: &mut messages,
        architect_state: &mut architect_state,
        effective_run_objective: None,
        engine_tuning: &tuning,
        rail_active: tuning.run_rail_enabled,
    };
    apply_architect_iteration_start(&mut input);

    let system: Vec<_> = messages
        .iter()
        .filter(|m| matches!(m.role, Role::System))
        .collect();
    assert!(system.iter().any(|m| is_architect_run_snapshot_message(m)));
    assert!(system.iter().any(|m| is_tool_protocol_snapshot_message(m)));
    if tuning.run_rail_enabled {
        assert!(system.iter().any(|m| is_run_rail_snapshot_message(m)));
    }
}

#[test]
fn append_gate_nudge_appends_system_message() {
    use drox_types::Role;

    let mut messages = Vec::new();
    append_gate_nudge(&mut messages, NudgeId::ActStall, "stall hint");
    assert_eq!(messages.len(), 1);
    assert!(matches!(messages[0].role, Role::System));
    assert_eq!(
        drox_types::Content::collapse_text(&messages[0].content),
        "stall hint"
    );
}

#[test]
fn apply_iteration_start_skips_unchanged_snapshot() {
    let snapshot = format!("{ARCHITECT_RUN_SNAPSHOT_MARKER}\n\nuser: hello");
    let mut messages = vec![Message::system(snapshot.clone())];
    let mut architect_state = ArchitectRunState::new();
    architect_state.set_user_request_anchor("hello");

    let tuning = crate::EngineTuning::default();
    let mut input = ArchitectIterationInput {
        messages: &mut messages,
        architect_state: &mut architect_state,
        effective_run_objective: None,
        engine_tuning: &tuning,
        rail_active: false,
    };
    apply_architect_iteration_start(&mut input);

    let architect_blocks: Vec<_> = messages
        .iter()
        .filter(|m| is_architect_run_snapshot_message(m))
        .map(|m| Content::collapse_text(&m.content))
        .collect();
    assert_eq!(architect_blocks.len(), 1);
}
