//! Gate `todo_write` architecte — validation payload uniquement.

use serde_json::Value;

use super::architect_state::ArchitectRunState;

#[must_use]
pub(crate) fn todo_payload_shape_guard(arguments: &Value) -> Option<String> {
    let Some(todos) = arguments.get("todos").and_then(|v| v.as_array()) else {
        return Some(
            "Blocked: `todo_write` payload must include `todos`.\n\
             Use exactly: {\"todos\":[{\"id\":\"t1\",\"content\":\"…\",\"status\":\"pending|in_progress|completed|cancelled\"}]}\n\
             Do not send `{}` or legacy payloads."
                .to_string(),
        );
    };
    if todos.is_empty() {
        return Some(
            "Blocked: `todo_write.todos` is empty. Keep existing tasks and update statuses; \
             do not clear the plan."
                .to_string(),
        );
    }
    None
}

/// Plus de gate workflow sur `completed` — le modèle gère son plan librement.
#[must_use]
pub(crate) fn complete_gate_for_task(_state: &ArchitectRunState, _task_id: &str) -> Option<String> {
    None
}
