//! Gates Architecte 1.2.0 — plan, carte, brief, vérification, pas de compensation.

use camino::Utf8Path;
use drox_session::DroxIgnoreMatcher;
use drox_tools::{count_files_in_delegate_scope, DELEGATE_SCOPE_MAX_FILES};
use serde_json::Value;

use crate::run_spec::{RunSpec, RoleId};

use super::architect_plan_quality::{
    architect_delegation_quality_gate, architect_todo_plan_quality_gate,
};
use super::architect_todo_gate::todo_payload_shape_guard;
use super::architect_state::{validate_scope_paths, ArchitectRunState};

pub(crate) const ARCHITECT_DELEGATE_REQUIRES_PLAN: &str =
    "Publish your plan with `todo_write` (tasks t1, t2, …) before calling `delegate_executor`.";

pub(crate) const ARCHITECT_MAX_READS_BEFORE_DELEGATE: usize = 4;

pub(crate) const ARCHITECT_MAX_DELEGATIONS_PER_TASK: u32 = 2;

pub(crate) const ARCHITECT_DELEGATE_FOR_ANALYSIS_BLOCKED: &str = "As Architect, stop chaining read-only tools. \
Call `delegate_executor` for repo analysis, scans, or edits (task must be `in_progress` in `todo_write`). \
You may keep one targeted `file_read` to choose `scope` paths only.";

pub(crate) const ARCHITECT_REDELEGATE_CAP_BLOCKED: &str = "This task was already delegated twice. \
Verify the workspace with `file_read` / `grep` / `lsp` on the task `scope`. Re-delegate only if verification fails — \
or ask the user with `ask_user_question`.";

pub(crate) const ARCHITECT_NEEDS_WORKSPACE_MAP: &str =
    "Blocked: call `workspace_map_read` once before `delegate_executor`, then copy `scope` paths from the map.";

pub(crate) const ARCHITECT_INSTRUCTIONS_TOO_SHORT: &str = "Blocked: `instructions` must be an operational brief \
(≥ 80 characters): concrete paths, commands, and done criteria — the Executor uses a smaller model.";

pub(crate) const ARCHITECT_COMPENSATION_BLOCKED: &str = "Blocked: the last delegation was `partial`, `failed`, or `blocked`. \
Use `file_read`, `grep`, or `lsp` on paths from the task `scope` to verify (or re-delegate once). \
If status was `blocked`, split the todo with `todo_write` and use `glob` to pick subfolders — then delegate each shard. \
No other reads, no edits.";

pub(crate) fn architect_delegate_scope_too_large_message(scope_hint: &str, count: usize) -> String {
    format!(
        "Blocked: scope `{scope_hint}` matches {count} files (> {DELEGATE_SCOPE_MAX_FILES}) — too large for one Executor run.\n\n\
         **The user request is NOT cancelled.** Do NOT tell the user the mission is impossible or that context is too large.\n\
         1. Use `glob` to list subfolders under the scope.\n\
         2. Split this todo into smaller tasks in `todo_write` (e.g. `{scope_hint}/ui`, `{scope_hint}/forms` — ≤ {DELEGATE_SCOPE_MAX_FILES} files each).\n\
         3. Delegate each shard with `delegate_executor`, then synthesize in `[phase: answering]`."
    )
}

const ARCHITECT_READ_TOOLS: &[&str] = &[
    "file_read",
    "glob",
    "grep",
    "lsp",
    "workspace_map_read",
    "memory_read",
    "memory_list",
];

const ARCHITECT_VERIFY_TOOLS: &[&str] = &["file_read", "grep", "lsp"];

const MIN_INSTRUCTIONS_LEN: usize = 80;

#[must_use]
pub(crate) fn is_architect_read_tool(tool_name: &str) -> bool {
    ARCHITECT_READ_TOOLS.contains(&tool_name)
}

/// Identifiants de tâches d'un appel `delegate_executor` (`tasks[]` canonique).
#[must_use]
pub(crate) fn delegate_executor_all_task_ids(arguments: &Value) -> Vec<String> {
    let mut ids = Vec::new();
    let mut push_id = |raw: &str| {
        let id = raw.trim();
        if id.is_empty() {
            return;
        }
        if ids.iter().any(|existing| existing == id) {
            return;
        }
        ids.push(id.to_string());
    };
    if let Some(tasks) = arguments.get("tasks").and_then(|v| v.as_array()) {
        for item in tasks {
            if let Some(id) = item.get("task_id").and_then(|v| v.as_str()) {
                push_id(id);
            }
        }
    }
    if let Some(id) = arguments.get("task_id").and_then(|v| v.as_str()) {
        push_id(id);
    }
    ids
}

fn delegate_executor_each_scope(arguments: &Value) -> Vec<Vec<String>> {
    let mut scopes = Vec::new();
    let extract_scope = |item: &Value| -> Option<Vec<String>> {
        item.get("scope").and_then(|v| v.as_array()).map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
    };

    if let Some(tasks) = arguments.get("tasks").and_then(|v| v.as_array()) {
        for item in tasks {
            if let Some(paths) = extract_scope(item).filter(|s| !s.is_empty()) {
                scopes.push(paths);
            }
        }
        return scopes;
    }

    scopes
}

#[must_use]
pub(crate) fn architect_orchestration_pre_gate(
    spec: &RunSpec,
    call_name: &str,
    call_arguments: &Value,
    state: &ArchitectRunState,
    saw_successful_todo_write_in_run: bool,
    workspace: Option<&Utf8Path>,
    drox_ignore: Option<&DroxIgnoreMatcher>,
) -> Option<String> {
    if spec.role_id != RoleId::Architect {
        return None;
    }

    if call_name == "delegate_executor" {
        if !saw_successful_todo_write_in_run {
            return Some(ARCHITECT_DELEGATE_REQUIRES_PLAN.to_string());
        }
        if !state.workspace_map_loaded {
            return Some(ARCHITECT_NEEDS_WORKSPACE_MAP.to_string());
        }
        for paths in delegate_executor_each_scope(call_arguments) {
            if let Some(msg) = validate_scope_paths(&paths, &state.workspace_paths) {
                return Some(msg);
            }
            if let (Some(ws), true) = (workspace, !paths.is_empty()) {
                let count = count_files_in_delegate_scope(
                    ws,
                    &paths,
                    drox_ignore,
                    DELEGATE_SCOPE_MAX_FILES,
                );
                if count > DELEGATE_SCOPE_MAX_FILES {
                    let hint = paths
                        .first()
                        .map(String::as_str)
                        .unwrap_or("scope");
                    return Some(architect_delegate_scope_too_large_message(hint, count));
                }
            }
        }
        if let Some(tasks) = call_arguments.get("tasks").and_then(|v| v.as_array()) {
            for item in tasks {
                let instr = item
                    .get("instructions")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                if instr.len() < MIN_INSTRUCTIONS_LEN {
                    return Some(ARCHITECT_INSTRUCTIONS_TOO_SHORT.to_string());
                }
            }
        } else {
            let instr = call_arguments
                .get("instructions")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            if instr.len() < MIN_INSTRUCTIONS_LEN {
                return Some(ARCHITECT_INSTRUCTIONS_TOO_SHORT.to_string());
            }
        }
        if let Some(msg) = architect_delegation_quality_gate(call_arguments) {
            return Some(msg);
        }
        for task_id in delegate_executor_all_task_ids(call_arguments) {
            let count = state.delegate_counts.get(&task_id).copied().unwrap_or(0);
            if count >= ARCHITECT_MAX_DELEGATIONS_PER_TASK {
                return Some(format!(
                    "{ARCHITECT_REDELEGATE_CAP_BLOCKED} (task `{task_id}`)"
                ));
            }
        }
        return None;
    }

    if call_name == "todo_write" {
        if let Some(msg) = todo_payload_shape_guard(call_arguments) {
            return Some(msg);
        }
        if let Some(msg) = architect_todo_plan_quality_gate(call_arguments) {
            return Some(msg);
        }
        if let Some(msg) = architect_todo_complete_gate(state, call_arguments) {
            return Some(msg);
        }
    }

    if state.needs_compensation_block() {
        if state.needs_replan_after_blocked()
            && matches!(call_name, "glob" | "todo_write" | "workspace_map_read")
        {
            return None;
        }
        // Après `partial` / `failed` / `blocked` : autoriser verify ciblée (file_read / grep / lsp sur le scope).
        if architect_verify_read_allowed(state, call_name, call_arguments) {
            return None;
        }
        if is_architect_mutation_tool(call_name) || is_architect_read_tool(call_name) {
            return Some(ARCHITECT_COMPENSATION_BLOCKED.to_string());
        }
    }

    if is_architect_read_tool(call_name) {
        if architect_verify_read_allowed(state, call_name, call_arguments) {
            return None;
        }
        if state.reads_since_delegate >= ARCHITECT_MAX_READS_BEFORE_DELEGATE {
            return Some(ARCHITECT_DELEGATE_FOR_ANALYSIS_BLOCKED.to_string());
        }
    }
    None
}

#[must_use]
fn architect_todo_complete_gate(state: &ArchitectRunState, arguments: &Value) -> Option<String> {
    let normalized = drox_tools::normalize_todo_write_payload(arguments.clone());
    let Some(todos) = normalized.get("todos").and_then(|v| v.as_array()) else {
        return None;
    };
    for item in todos {
        if item.get("status").and_then(|v| v.as_str()) != Some("completed") {
            continue;
        }
        let id = item
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())?;
        if let Some(msg) = state.complete_gate_for_task(id) {
            return Some(msg);
        }
    }
    None
}

#[must_use]
fn is_architect_mutation_tool(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "file_write"
            | "file_edit"
            | "delete_path"
            | "copy_path"
            | "bash"
            | "notebook_edit"
            | "git_worktree_enter"
            | "git_worktree_exit"
    )
}

#[must_use]
fn architect_verify_read_allowed(
    state: &ArchitectRunState,
    tool_name: &str,
    arguments: &Value,
) -> bool {
    if tool_name == "file_read" {
        if let Some(path) = arguments.get("path").and_then(|v| v.as_str()) {
            if let Some(task_id) = state.last_delegate_task_id.as_ref() {
                if super::architect_state::is_agent_output_task_path(
                    path,
                    state.orchestration_plan_id.as_deref(),
                    task_id,
                ) {
                    return true;
                }
            }
        }
    }
    if !ARCHITECT_VERIFY_TOOLS.contains(&tool_name) {
        return false;
    }
    let path = match tool_name {
        "file_read" => arguments.get("path").and_then(|v| v.as_str()),
        "grep" => arguments
            .get("path")
            .or_else(|| arguments.get("glob"))
            .and_then(|v| v.as_str()),
        "lsp" => arguments.get("path").and_then(|v| v.as_str()),
        _ => None,
    };
    path.is_some_and(|p| state.path_matches_any_unverified_delegate_scope(p))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::architect_state::ArchitectRunState;
    use crate::orchestration::DelegateStatus;
    use crate::run_spec::{RoleId, RunSpec};
    use serde_json::json;

    #[test]
    fn compensation_allows_agent_output_read() {
        let mut state = ArchitectRunState::new();
        state.last_delegate_task_id = Some("t4".into());
        state.orchestration_plan_id = Some("plan_test".into());
        state.last_delegate_status = Some(DelegateStatus::Partial);
        state.set_pending_delegate_scope(Some(vec!["app-kdds-main/src/components".into()]));
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(architect_orchestration_pre_gate(
            &spec,
            "file_read",
            &json!({ "path": ".drox/agent-output/plan_test/t4/report.md" }),
            &state,
            true,
            None,
            None,
        )
        .is_none());
    }

    #[test]
    fn read_only_tool_success_records_verify_ack_partial_t2() {
        let mut state = ArchitectRunState::new();
        state.delegate_counts.insert("t2".into(), 1);
        state.set_task_delegate_scope(
            "t2",
            vec!["app-kdds-main/src/components/home-content.tsx".into()],
        );
        state
            .task_delegate_status
            .insert("t2".into(), DelegateStatus::Partial);
        state.last_delegate_task_id = Some("t2".into());
        state.last_delegate_status = Some(DelegateStatus::Partial);
        let ack = architect_record_read_only_tool_success(
            RoleId::Architect,
            "file_read",
            &json!({ "path": "app-kdds-main/src/components/home-content.tsx" }),
            &json!({ "path": "app-kdds-main/src/components/home-content.tsx", "content": "x" }),
            &mut state,
        );
        let ack = ack.expect("verify ack");
        assert!(ack.contains("Verification recorded"));
        assert!(ack.contains("t2"));
        assert!(state.verified_task_ids.contains("t2"));
        assert!(state.complete_gate_for_task("t2").is_none());
    }

    #[test]
    fn compensation_allows_verify_read_on_scope() {
        let mut state = ArchitectRunState::new();
        state.last_delegate_task_id = Some("t2".into());
        state.last_delegate_status = Some(DelegateStatus::Partial);
        state.set_task_delegate_scope("t2", vec!["app-kdds-main/README.md".into()]);
        state.task_delegate_status
            .insert("t2".into(), DelegateStatus::Partial);
        state.set_pending_delegate_scope(Some(vec!["app-kdds-main/README.md".into()]));
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(architect_orchestration_pre_gate(
            &spec,
            "file_read",
            &json!({ "path": "app-kdds-main/README.md" }),
            &state,
            true,
            None,
            None,
        )
        .is_none());
        assert!(architect_orchestration_pre_gate(
            &spec,
            "grep",
            &json!({ "path": "app-kdds-main", "pattern": "x" }),
            &state,
            true,
            None,
            None,
        )
        .is_none());
        assert!(architect_orchestration_pre_gate(
            &spec,
            "file_read",
            &json!({ "path": "other/package.json" }),
            &state,
            true,
            None,
            None,
        )
        .is_some());
    }

    #[test]
    fn verify_reads_bypass_max_reads_cap() {
        let mut state = ArchitectRunState::new();
        state.reads_since_delegate = ARCHITECT_MAX_READS_BEFORE_DELEGATE;
        state.set_task_delegate_scope("t2", vec!["app-kdds-main/src".into()]);
        state.task_delegate_status
            .insert("t2".into(), DelegateStatus::Partial);
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(architect_orchestration_pre_gate(
            &spec,
            "grep",
            &json!({ "path": "app-kdds-main/src", "pattern": "unused" }),
            &state,
            true,
            None,
            None,
        )
        .is_none());
    }

    #[test]
    fn todo_complete_blocked_without_delegate() {
        let state = ArchitectRunState::new();
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        let msg = architect_orchestration_pre_gate(
            &spec,
            "todo_write",
            &json!({
                "todos": [
                    { "id": "t1", "content": "analyze", "status": "completed" },
                    { "id": "t2", "content": "explore", "status": "pending" }
                ]
            }),
            &state,
            true,
            None,
            None,
        )
        .unwrap();
        assert!(msg.contains("t1"));
        assert!(msg.contains("delegate_executor"));
    }

    #[test]
    fn todo_complete_allowed_when_delegated_and_verified() {
        let mut state = ArchitectRunState::new();
        state.delegate_counts.insert("t2".into(), 1);
        state.verified_task_ids.insert("t2".into());
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(architect_orchestration_pre_gate(
            &spec,
            "todo_write",
            &json!({
                "todos": [{ "id": "t2", "content": "x", "status": "completed" }]
            }),
            &state,
            true,
            None,
            None,
        )
        .is_none());
    }

    #[test]
    fn todo_complete_gate_uses_scope_hint() {
        let mut state = ArchitectRunState::new();
        state.delegate_counts.insert("t2".into(), 1);
        state.last_delegate_task_id = Some("t2".into());
        state.last_delegate_status = Some(DelegateStatus::Completed);
        state.set_pending_delegate_scope(Some(vec!["app-kdds-main/package.json".into()]));
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        let msg = architect_orchestration_pre_gate(
            &spec,
            "todo_write",
            &json!({
                "todos": [{ "id": "t2", "content": "x", "status": "completed" }]
            }),
            &state,
            true,
            None,
            None,
        );
        let m = msg.unwrap();
        assert!(m.contains("t2"));
        assert!(m.contains("app-kdds-main/package.json"));
    }

    #[test]
    fn blocked_allows_glob_for_replan() {
        let mut state = ArchitectRunState::new();
        state.last_delegate_task_id = Some("t4".into());
        state.last_delegate_status = Some(DelegateStatus::Blocked);
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(architect_orchestration_pre_gate(
            &spec,
            "glob",
            &json!({ "pattern": "*", "path": "src/components" }),
            &state,
            true,
            None,
            None,
        )
        .is_none());
    }

    #[test]
    fn delegate_executor_all_task_ids_includes_tasks_array() {
        let ids = delegate_executor_all_task_ids(&json!({
            "tasks": [
                { "task_id": "t1", "description": "a" },
                { "task_id": "t2", "description": "b" },
                { "task_id": "t1", "description": "dup" }
            ]
        }));
        assert_eq!(ids, vec!["t1".to_string(), "t2".to_string()]);
    }

    #[test]
    fn delegate_scope_file_count_blocks_large_scope() {
        use camino::Utf8Path;
        use std::fs;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let root = Utf8Path::from_path(dir.path()).unwrap();
        let comp = root.join("src/components");
        fs::create_dir_all(&comp).unwrap();
        for i in 0..55 {
            fs::write(comp.join(format!("C{i}.tsx")).as_std_path(), "x").unwrap();
        }
        let mut state = ArchitectRunState::new();
        state.workspace_map_loaded = true;
        state.workspace_paths.insert("src/components".into());
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        let long_instr = "x".repeat(80);
        let msg = architect_orchestration_pre_gate(
            &spec,
            "delegate_executor",
            &json!({
                "tasks": [{
                    "task_id": "t4",
                    "description": "list components",
                    "instructions": long_instr,
                    "scope": ["src/components"]
                }]
            }),
            &state,
            true,
            Some(root),
            None,
        )
        .unwrap();
        assert!(msg.contains("NOT cancelled"));
        assert!(msg.contains("> 50") || msg.contains("51"));
    }
}

/// Mise à jour architecte après un outil read-only réussi (`file_read`, `grep`, `lsp`, …).
///
/// Utilisé par le lot **parallèle** (§2.29) et le lot série — enregistre `verified_task_ids`
/// et retourne l'ack « Verification recorded » pour le modèle.
#[must_use]
pub(crate) fn architect_record_read_only_tool_success(
    role_id: RoleId,
    tool_name: &str,
    arguments: &Value,
    output: &Value,
    state: &mut ArchitectRunState,
) -> Option<String> {
    if role_id != RoleId::Architect {
        return None;
    }
    state.observe_cycle_sanity_tool(tool_name, arguments, output);
    if tool_name == "workspace_map_read" {
        state.ingest_workspace_map_output(output);
    }
    let mut newly_verified = Vec::new();
    if tool_name == "grep" {
        newly_verified.extend(state.try_mark_verified_from_grep_output(output));
    }
    newly_verified.extend(state.try_mark_verified(tool_name, arguments));
    if is_architect_read_tool(tool_name) {
        architect_orchestration_record_successful_tool(role_id, tool_name, arguments, state);
    }
    if newly_verified.is_empty() {
        return None;
    }
    let ids = newly_verified.join("`, `");
    Some(format!(
        "Verification recorded for task(s) `{ids}`. \
         You may mark those todos `completed` in `todo_write` \
         when delegate status and scope proof are satisfied."
    ))
}

/// Met à jour l'état architecte après un outil réussi.
pub(crate) fn architect_orchestration_record_successful_tool(
    role_id: RoleId,
    call_name: &str,
    call_arguments: &Value,
    state: &mut ArchitectRunState,
) {
    if role_id != RoleId::Architect {
        return;
    }
    if call_name == "workspace_map_read" {
        // Output ingested separately when tool finishes.
        return;
    }
    if call_name == "delegate_executor" {
        state.reads_since_delegate = 0;
        let aggregated =
            ArchitectRunState::aggregate_delegate_scopes_from_arguments(call_arguments);
        if !aggregated.is_empty() {
            state.set_pending_delegate_scope(Some(aggregated));
        } else {
            state.set_pending_delegate_scope(
                call_arguments
                    .get("scope")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(str::to_string))
                            .collect()
                    }),
            );
        }
        for task_id in delegate_executor_all_task_ids(call_arguments) {
            if let Some(scope) = delegate_scope_for_task(call_arguments, &task_id) {
                state.set_task_delegate_scope(&task_id, scope);
            }
            *state.delegate_counts.entry(task_id).or_insert(0) += 1;
        }
        return;
    }
    let _ = state.try_mark_verified(call_name, call_arguments);
    if is_architect_read_tool(call_name) {
        state.reads_since_delegate = state.reads_since_delegate.saturating_add(1);
    }
}

#[must_use]
fn delegate_scope_for_task(arguments: &Value, task_id: &str) -> Option<Vec<String>> {
    let scope_from_value = |scope: &Value| -> Option<Vec<String>> {
        scope.as_array().map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
    };
    if let Some(tasks) = arguments.get("tasks").and_then(|v| v.as_array()) {
        return tasks
            .iter()
            .find(|item| {
                item.get("task_id")
                    .and_then(|v| v.as_str())
                    .is_some_and(|id| id.trim() == task_id)
            })
            .and_then(|item| item.get("scope"))
            .and_then(scope_from_value)
            .filter(|paths| !paths.is_empty());
    }

    None
}
