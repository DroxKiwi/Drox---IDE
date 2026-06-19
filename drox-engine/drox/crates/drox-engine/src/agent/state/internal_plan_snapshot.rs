//! Replace-marked internal plan snapshot block.

use drox_types::{Content, Message, Role};

use super::internal_plan::{
    format_internal_plan_snapshot_block, INTERNAL_WORK_PLAN_MARKER,
};
use crate::agent::ArchitectRunState;
use crate::RunStation;

#[must_use]
pub fn internal_plan_snapshot_for_station(
    state: &ArchitectRunState,
    _station: Option<RunStation>,
) -> Option<String> {
    if let Some(plan) = state.internal_plan.as_ref() {
        return Some(format_internal_plan_snapshot_block(plan));
    }
    None
}

pub fn refresh_internal_plan_snapshot(messages: &mut Vec<Message>, snapshot: Option<&str>) {
    messages.retain(|m| !is_internal_plan_snapshot_message(m));
    let Some(body) = snapshot.filter(|s| !s.is_empty()) else {
        return;
    };
    if internal_plan_snapshot_unchanged(messages, body) {
        return;
    }
    messages.push(Message::system(body.to_string()));
    tracing::debug!(
        target: "drox.context",
        bytes = body.len(),
        "internal_plan_snapshot_refresh"
    );
}

fn system_message_text(m: &Message) -> String {
    if matches!(m.role, Role::System) {
        Content::collapse_text(&m.content)
    } else {
        String::new()
    }
}

fn internal_plan_snapshot_unchanged(messages: &[Message], snapshot: &str) -> bool {
    messages.iter().any(|m| {
        is_internal_plan_snapshot_message(m) && system_message_text(m) == snapshot
    })
}

#[must_use]
pub fn is_internal_plan_snapshot_message(m: &Message) -> bool {
    if !matches!(m.role, Role::System) {
        return false;
    }
    system_message_text(m).contains(INTERNAL_WORK_PLAN_MARKER)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::state::internal_plan::ingest_internal_plan;
    use crate::agent::ArchitectRunState;
    use serde_json::json;

    #[test]
    fn missing_plan_emits_nothing() {
        let st = ArchitectRunState::new();
        let snap = internal_plan_snapshot_for_station(&st, Some(RunStation::Intent));
        assert!(snap.is_none());
    }

    #[test]
    fn refresh_inserts_and_replaces_internal_plan_block() {
        let mut st = ArchitectRunState::new();
        let _ = ingest_internal_plan(
            &mut st.internal_plan,
            json!({"steps":[{"id":"s1","action":"fix","status":"pending"}]}),
        );
        let snap = internal_plan_snapshot_for_station(&st, Some(RunStation::Act)).unwrap();
        let mut messages = Vec::new();
        refresh_internal_plan_snapshot(&mut messages, Some(&snap));
        assert_eq!(messages.len(), 1);
        refresh_internal_plan_snapshot(&mut messages, Some(&snap));
        assert_eq!(messages.len(), 1);
    }
}
