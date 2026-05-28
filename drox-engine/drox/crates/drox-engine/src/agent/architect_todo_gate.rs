//! Gate `todo_write` architecte: validation payload + clôture conditionnelle.

use serde_json::Value;

use crate::orchestration::DelegateStatus;

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

/// Gate `todo_write` -> `completed`: exige d'abord `delegate_executor`, puis verify ciblée.
#[must_use]
pub(crate) fn complete_gate_for_task(state: &ArchitectRunState, task_id: &str) -> Option<String> {
    if state.is_meta_synthesis_task(task_id) {
        if state.all_work_tasks_verified() {
            return None;
        }
        return Some(format!(
            "Task `{task_id}` is a synthesis/meta line — mark it `completed` only after \
             all work tasks are verified (`delegate_executor` + scope check)."
        ));
    }
    let count = state.delegate_counts.get(task_id).copied().unwrap_or(0);
    if count == 0 && !state.verified_task_ids.contains(task_id) {
        return Some(format!(
            "Task `{task_id}` cannot be `completed` yet.\n\
             [completion_block_reasons] missing_delegate\n\
             Next required action: set `{task_id}` to `in_progress` in `todo_write`, then call \
             `delegate_executor` with `task_id: \"{task_id}\"` and concrete `scope` paths from `workspace_map_read`.\n\
             Do not retry `todo_write completed` before that delegation."
        ));
    }
    if state.verified_task_ids.contains(task_id) {
        return None;
    }
    if state.last_delegate_task_id.as_deref() == Some(task_id) {
        if matches!(state.last_delegate_status, Some(DelegateStatus::Blocked)) {
            return Some(format!(
                "Task `{task_id}` returned `blocked` (scope too large or brief unrealistic). \
Do NOT mark it `completed`. Split it into smaller todos in `todo_write` (one subfolder or ≤50 files each), \
delegate each shard, then synthesize for the user. **Never** tell the user the mission is impossible."
            ));
        }
        return Some(verify_before_complete_hint(state));
    }
    Some(format!(
        "Task `{task_id}` is not verified yet.\n\
         [completion_block_reasons] missing_scope_verification\n\
         Next required action: run `file_read` or `grep` or `lsp` on one path from `{task_id}` scope, \
         then retry `todo_write completed`."
    ))
}

/// Message d'aide quand `todo_write` tente de clôturer la dernière tâche déléguée sans verify.
#[must_use]
pub(crate) fn verify_before_complete_hint(state: &ArchitectRunState) -> String {
    let task = state.last_delegate_task_id.as_deref().unwrap_or("?");
    let first_scope = state
        .last_delegate_scope
        .first()
        .map(|p| format!("`{p}`"))
        .unwrap_or_else(|| "`<scope-path>`".to_string());
    let scope_examples: Vec<String> = state
        .last_delegate_scope
        .iter()
        .take(3)
        .map(|p| format!("`{p}`"))
        .collect();
    let scope_hint = if scope_examples.is_empty() {
        "a path from the task `scope`".to_string()
    } else {
        format!("one of: {}", scope_examples.join(", "))
    };
    format!(
        "Task `{task}` is not verified yet.\n\
         [completion_block_reasons] missing_scope_verification\n\
         Next step now (before any `todo_write`): call `file_read`/`grep`/`lsp` on {scope_hint} \
         (for example `{}`), then mark that todo `completed`.",
        first_scope.trim_matches('`')
    )
}
