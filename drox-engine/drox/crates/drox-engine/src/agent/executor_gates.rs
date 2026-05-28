//! Gates Exécuteur 1.2.0 — pas de scans inutiles, pas d'escalade utilisateur.

use serde_json::Value;

use crate::run_spec::{RunSpec, RoleId};

pub(crate) const EXECUTOR_GLOB_HEAVY_BLOCKED: &str = "Blocked: do not glob `node_modules`, `.next`, \
`dist`, or `target` — narrow `scope` paths from the Architect brief instead.";

pub(crate) const EXECUTOR_ASK_USER_BLOCKED: &str =
    "Blocked: the Executor must not call `ask_user_question`. Report blockers in the **Executor report**.";

pub(crate) const EXECUTOR_TODO_WRITE_BLOCKED: &str =
    "Blocked: the Executor must not call `todo_write`. The Architect owns the plan; report progress in the **Executor report** only.";

pub(crate) const EXECUTOR_DELIVERABLE_MET_BLOCKED: &str =
    "Blocked: the deliverable `.md` is already on disk under `.drox/agent-output/<task_id>/`. \
     The engine is closing this Executor run — do not call more tools.";

const HEAVY_GLOB_FRAGMENTS: &[&str] = &[
    "node_modules",
    "/.next/",
    ".next/**",
    "**/dist/**",
    "**/target/**",
];

#[must_use]
pub(crate) fn executor_orchestration_pre_gate(
    spec: &RunSpec,
    call_name: &str,
    call_arguments: &Value,
    deliverable_met: bool,
) -> Option<String> {
    if spec.role_id != RoleId::Executor {
        return None;
    }
    if deliverable_met {
        return Some(EXECUTOR_DELIVERABLE_MET_BLOCKED.to_string());
    }
    if call_name == "ask_user_question" {
        return Some(EXECUTOR_ASK_USER_BLOCKED.to_string());
    }
    if call_name == "todo_write" {
        return Some(EXECUTOR_TODO_WRITE_BLOCKED.to_string());
    }
    if call_name == "glob" {
        if let Some(pattern) = call_arguments.get("pattern").and_then(|v| v.as_str()) {
            let lower = pattern.to_ascii_lowercase();
            if HEAVY_GLOB_FRAGMENTS
                .iter()
                .any(|frag| lower.contains(frag))
            {
                return Some(EXECUTOR_GLOB_HEAVY_BLOCKED.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    use crate::run_spec::RunSpec;

    #[test]
    fn blocks_todo_write_on_executor() {
        let spec = RunSpec::for_orchestration_role(RoleId::Executor);
        let msg = executor_orchestration_pre_gate(&spec, "todo_write", &json!({ "todos": [] }), false);
        assert!(msg.is_some());
        assert!(msg.unwrap().contains("todo_write"));
    }

    #[test]
    fn blocks_ask_user_on_executor() {
        let spec = RunSpec::for_orchestration_role(RoleId::Executor);
        assert!(executor_orchestration_pre_gate(&spec, "ask_user_question", &json!({}), false)
            .is_some());
    }

    #[test]
    fn blocks_tools_after_deliverable_met() {
        let spec = RunSpec::for_orchestration_role(RoleId::Executor);
        assert!(executor_orchestration_pre_gate(&spec, "file_read", &json!({}), true)
            .is_some());
    }
}
