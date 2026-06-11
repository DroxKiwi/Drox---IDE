//! Gate `todo_write` architecte — validation payload uniquement.

use serde_json::Value;

use crate::agent::nudges::{TODO_WRITE_EMPTY_TODOS, TODO_WRITE_MISSING_TODOS};

#[must_use]
pub(crate) fn todo_payload_shape_guard(arguments: &Value) -> Option<String> {
    let Some(todos) = arguments.get("todos").and_then(|v| v.as_array()) else {
        return Some(TODO_WRITE_MISSING_TODOS.to_string());
    };
    if todos.is_empty() {
        return Some(TODO_WRITE_EMPTY_TODOS.to_string());
    }
    None
}
