//! Gates Exécuteur — désactivées (1.3.2) : le modèle choisit ses outils ; rappels via prompts seulement.

use serde_json::Value;

use crate::orchestration::EngineTuning;
use crate::run_spec::{RoleId, RunSpec};

#[must_use]
pub(crate) fn executor_orchestration_pre_gate(
    _spec: &RunSpec,
    _call_name: &str,
    _call_arguments: &Value,
    _deliverable_met: bool,
    _tuning: &EngineTuning,
) -> Option<String> {
    let _ = RoleId::Executor;
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    use crate::run_spec::RunSpec;

    #[test]
    fn executor_tools_never_pre_blocked() {
        let spec = RunSpec::for_orchestration_role(RoleId::Executor);
        let tuning = crate::EngineTuning::default();
        assert!(executor_orchestration_pre_gate(
            &spec,
            "todo_write",
            &json!({ "todos": [] }),
            true,
            &tuning,
        )
        .is_none());
        assert!(executor_orchestration_pre_gate(
            &spec,
            "ask_user_question",
            &json!({}),
            true,
            &tuning,
        )
        .is_none());
        assert!(executor_orchestration_pre_gate(&spec, "file_read", &json!({}), true, &tuning).is_none());
    }
}
