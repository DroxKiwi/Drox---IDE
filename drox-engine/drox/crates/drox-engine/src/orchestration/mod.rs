//! Couche C — orchestration multi-rôles (1.2.0).

mod config;
mod delegate_report;
mod executor_deliverable;
mod parallel_batch;
mod prompts;
mod truth_check;

pub use delegate_report::{DelegateStatus, finalize_delegate_result};
pub use truth_check::{
    apply_truth_check_to_status, build_failure_packet, classify_delegate_task,
    post_delegate_truth_check, recovery_checkpoint_block, DelegateTaskKind, TruthCheck,
};
pub use executor_deliverable::{
    canonical_deliverable_path, deliverable_path_from_tool_success,
    executor_deliverable_closure_notice, find_deliverable_on_disk, DeliverableOnDisk,
    MIN_DELIVERABLE_BYTES,
};

pub use config::{OrchestrationConfig, DEFAULT_ARCHITECT_MODEL, DEFAULT_EXECUTOR_MODEL};
pub use parallel_batch::{
    batch_scopes_disjoint, normalize_scope_path, scope_paths_overlap, validate_parallel_batch,
    MAX_PARALLEL_EXECUTORS_CAP,
};
pub use prompts::{
    architect_parallel_slots_supplement, architect_system_prompt_for_run, architect_user_message,
    executor_delegated_task_block, executor_user_message_from_delegate, ARCHITECT_SYSTEM_PROMPT,
    EXECUTOR_NATIVE_THINKING_SUPPLEMENT, EXECUTOR_ROLE_SUPPLEMENT, EXECUTOR_SYSTEM_PROMPT,
};

use crate::run_spec::RunSpec;

/// Mode d'orchestration produit (1.3 final) — chemin unique.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OrchestrationMode {
    #[default]
    V1_2,
}

impl OrchestrationMode {
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        let normalized = s.trim().to_lowercase();
        if normalized.is_empty()
            || matches!(
                normalized.as_str(),
                "v1_2" | "v1.2" | "v12" | "1.2" | "1.2.0" | "v1_3" | "v1.3" | "v13" | "1.3" | "1.3.0"
            )
        {
            return Some(Self::V1_2);
        }
        None
    }

    #[must_use]
    pub fn resolve(param: Option<&str>) -> Self {
        if let Some(raw) = param {
            if let Some(mode) = Self::parse(raw) {
                return mode;
            }
            tracing::warn!(
                orchestration_mode = %raw,
                "unknown orchestrationMode — forcing final orchestration path (v1_2)"
            );
            return Self::V1_2;
        }
        Self::V1_2
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        "v1_2"
    }
}

/// `RunSpec` pour l'orchestration finale (agent standard côté setup runtime).
#[must_use]
pub fn prepare_run_spec(_mode: OrchestrationMode, subagents_enabled: bool) -> RunSpec {
    RunSpec::for_standard_agent(subagents_enabled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_orchestration_modes() {
        assert_eq!(OrchestrationMode::parse("legacy"), None);
        assert_eq!(OrchestrationMode::parse("v1_2"), Some(OrchestrationMode::V1_2));
        assert_eq!(OrchestrationMode::parse("v1_3"), Some(OrchestrationMode::V1_2));
    }

    #[test]
    fn resolve_param_v1_2() {
        assert_eq!(
            OrchestrationMode::resolve(Some("v1_2")),
            OrchestrationMode::V1_2
        );
    }
}
