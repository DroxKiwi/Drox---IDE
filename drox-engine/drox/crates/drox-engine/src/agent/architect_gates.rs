//! **Tool gates** architecte — garde-fous de forme uniquement (pas de workflow imposé).

use camino::Utf8Path;
use drox_session::DroxIgnoreMatcher;
use serde_json::Value;

use crate::EngineTuning;
use crate::run_spec::{RoleId, RunSpec};

use super::architect_todo_gate::todo_payload_shape_guard;
use super::architect_state::ArchitectRunState;
use super::nudges::{
    ARCHITECT_DELEGATE_AFTER_MUTATIONS_NUDGE, ARCHITECT_DELEGATE_AFTER_READS_NUDGE,
};
use crate::orchestration::is_architect_read_tool_for_delegate_cap;

#[must_use]
pub(crate) fn is_architect_read_tool(tool_name: &str) -> bool {
    is_architect_read_tool_for_delegate_cap(tool_name)
        || matches!(tool_name, "memory_read" | "memory_list")
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

/// Gates pré-exécution architecte : payload `todo_write` malformé seulement.
#[must_use]
pub(crate) fn architect_orchestration_pre_gate(
    spec: &RunSpec,
    call_name: &str,
    call_arguments: &Value,
    _state: &ArchitectRunState,
    _saw_successful_todo_write_in_run: bool,
    _workspace: Option<&Utf8Path>,
    _drox_ignore: Option<&DroxIgnoreMatcher>,
    _tuning: &EngineTuning,
) -> Option<String> {
    if spec.role_id != RoleId::Architect {
        return None;
    }
    if call_name == "todo_write" {
        return todo_payload_shape_guard(call_arguments);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::architect_state::ArchitectRunState;
    use crate::orchestration::DelegateStatus;
    use crate::run_spec::{RoleId, RunSpec};
    use serde_json::json;

    #[test]
    fn delegate_executor_allowed_without_prior_todo_write() {
        let state = ArchitectRunState::new();
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(architect_orchestration_pre_gate(
            &spec,
            "delegate_executor",
            &json!({ "tasks": [{ "task_id": "t1", "description": "x" }] }),
            &state,
            false,
            None,
            None,
            &EngineTuning::default(),
        )
        .is_none());
    }

    #[test]
    fn workspace_map_read_always_allowed() {
        let state = ArchitectRunState::new();
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(architect_orchestration_pre_gate(
            &spec,
            "workspace_map_read",
            &json!({}),
            &state,
            false,
            None,
            None,
            &EngineTuning::default(),
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
        assert!(state.verified_task_ids.contains("t2"));
    }

    #[test]
    fn todo_complete_never_blocked_by_engine() {
        let state = ArchitectRunState::new();
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(architect_orchestration_pre_gate(
            &spec,
            "todo_write",
            &json!({
                "todos": [
                    { "id": "t1", "content": "analyze", "status": "completed" },
                    { "id": "t2", "content": "explore", "status": "pending" }
                ]
            }),
            &state,
            false,
            None,
            None,
            &EngineTuning::default(),
        )
        .is_none());
    }

    #[test]
    fn todo_write_blocks_malformed_payload() {
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        let state = ArchitectRunState::new();
        let msg = architect_orchestration_pre_gate(
            &spec,
            "todo_write",
            &json!({}),
            &state,
            false,
            None,
            None,
            &EngineTuning::default(),
        );
        assert!(msg.is_some());
        assert!(msg.unwrap().contains("todos"));
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
    fn delegate_cap_nudge_skipped_when_delegation_disabled() {
        let tuning = EngineTuning::from_preset(crate::orchestration::StrictnessPreset::Strict);
        let mut state = ArchitectRunState::new();
        state.reads_since_delegate = tuning.max_reads_before_delegate as usize;
        assert!(architect_delegate_cap_nudge(&tuning, &mut state, "file_read").is_none());
    }

    #[test]
    fn delegate_cap_nudge_after_reads_preset() {
        let mut tuning = EngineTuning::from_preset(crate::orchestration::StrictnessPreset::Strict);
        tuning.executor_delegation_enabled = true;
        let mut state = ArchitectRunState::new();
        state.reads_since_delegate = tuning.max_reads_before_delegate as usize;
        let nudge = architect_delegate_cap_nudge(&tuning, &mut state, "file_read");
        assert!(nudge.is_some());
        assert!(state.delegate_reads_nudge_sent);
        assert!(architect_delegate_cap_nudge(&tuning, &mut state, "file_read").is_none());
    }

    #[test]
    fn delegate_cap_nudge_after_mutations_preset() {
        let mut tuning = EngineTuning::from_preset(crate::orchestration::StrictnessPreset::Strict);
        tuning.executor_delegation_enabled = true;
        let mut state = ArchitectRunState::new();
        state.mutations_since_delegate = tuning.max_mutations_before_delegate_nudge as usize;
        let nudge = architect_delegate_cap_nudge(&tuning, &mut state, "file_edit");
        assert!(nudge.is_some());
        assert!(state.delegate_mutations_nudge_sent);
    }

    #[test]
    fn delegate_resets_cap_nudge_counters() {
        let mut state = ArchitectRunState::new();
        state.reads_since_delegate = 10;
        state.mutations_since_delegate = 4;
        state.delegate_reads_nudge_sent = true;
        architect_orchestration_record_successful_tool(
            RoleId::Architect,
            "delegate_executor",
            &json!({ "task_id": "t1", "description": "x", "instructions": "do it" }),
            &mut state,
        );
        assert_eq!(state.reads_since_delegate, 0);
        assert_eq!(state.mutations_since_delegate, 0);
        assert!(!state.delegate_reads_nudge_sent);
        assert!(!state.delegate_mutations_nudge_sent);
    }
}

/// Mise à jour architecte après un outil read-only réussi (`file_read`, `grep`, `lsp`, …).
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
         You may mark those todos `completed` in `todo_write` when ready."
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
        return;
    }
    if call_name == "delegate_executor" {
        state.reads_since_delegate = 0;
        state.mutations_since_delegate = 0;
        state.delegate_reads_nudge_sent = false;
        state.delegate_mutations_nudge_sent = false;
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
    if is_architect_direct_mutation_tool(call_name) {
        state.mutations_since_delegate = state.mutations_since_delegate.saturating_add(1);
    }
}

#[must_use]
pub(crate) fn is_architect_direct_mutation_tool(tool_name: &str) -> bool {
    matches!(tool_name, "file_edit" | "file_write")
}

/// Nudge soft (non bloquant) quand les caps preset de délégation sont atteints.
#[must_use]
pub(crate) fn architect_delegate_cap_nudge(
    tuning: &EngineTuning,
    state: &mut ArchitectRunState,
    tool_name: &str,
) -> Option<&'static str> {
    if !tuning.executor_delegation_enabled {
        return None;
    }
    if is_architect_read_tool(tool_name)
        && state.reads_since_delegate >= tuning.max_reads_before_delegate as usize
        && !state.delegate_reads_nudge_sent
    {
        state.delegate_reads_nudge_sent = true;
        return Some(ARCHITECT_DELEGATE_AFTER_READS_NUDGE);
    }
    if is_architect_direct_mutation_tool(tool_name)
        && state.mutations_since_delegate >= tuning.max_mutations_before_delegate_nudge as usize
        && !state.delegate_mutations_nudge_sent
    {
        state.delegate_mutations_nudge_sent = true;
        return Some(ARCHITECT_DELEGATE_AFTER_MUTATIONS_NUDGE);
    }
    None
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
