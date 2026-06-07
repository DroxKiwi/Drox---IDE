//! Couche C — orchestration multi-rôles (1.2.0).

mod config;
mod delegate_report;
mod executor_deliverable;
mod architect_gate;
mod json_response;
mod start_run;
mod architect_mode;
mod user_message_scope;
mod protocol_markers;
mod parallel_batch;
mod prompts;
pub mod tuning;
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
pub use architect_gate::{
    extract_discussion_done_from_text, extract_discussion_user_facing_reply,
    parse_discussion_reply_marker, ArchitectGate,
};
pub use json_response::{extract_first_json_object, looks_like_gate_json_response};
pub use start_run::{GateChainResult, StartRunKind};
pub use architect_mode::{
    extract_mode_from_text, parse_mode_marker, ArchitectWorkMode,
};
pub use user_message_scope::{
    initial_run_objective_for_concrete_edit, sanitize_architect_user_prompt,
    sanitize_transcript_user_messages,
};
pub use protocol_markers::{
    ask_payload_declares_cycle_user_check, delegate_payload_is_sanity_task,
    is_meta_synthesis_task, todo_declares_meta_task, CYCLE_USER_CHECK_LINE,
    DISCUSSION_DONE_LINE, DISCUSSION_REPLY_LINE, SANITY_TASK_ID, TASK_META_LINE,
};
pub use parallel_batch::{
    batch_scopes_disjoint, normalize_scope_path, scope_paths_overlap, validate_parallel_batch,
    MAX_PARALLEL_EXECUTORS_CAP,
};
pub use prompts::{
    architect_discussion_system_prompt, architect_discussion_system_prompt_default,
    architect_discussion_system_prompt_for_start_run,
    architect_discussion_user_message,
    architect_edit_system_prompt_core_for_run, architect_edit_system_prompt_core_for_run_vars,
    architect_parallel_slots_supplement, architect_user_message,
    architect_run_context_block, architect_run_context_block_compaction,
    architect_run_context_block_per_turn, architect_tool_short_description,
    is_architect_read_tool_for_delegate_cap, tool_supplements_all_architect,
    executor_delegated_task_block, executor_user_message_from_delegate, PromptBlockId, PromptVars,
    StrictnessPreset, ARCHITECT_DISCUSSION_CORE_PROMPT, ARCHITECT_DISCUSSION_SYSTEM_PROMPT,
    EXECUTOR_NATIVE_THINKING_SUPPLEMENT, EXECUTOR_ROLE_SUPPLEMENT,
    EXECUTOR_SYSTEM_PROMPT,
};
pub use tuning::{resolve_engine_tuning, EngineTuning, EngineTuningOverrides};

/// Wire identifier for the product orchestration pipeline (`agent.run` / IDE chat).
/// Single variant today; `parse` / `resolve` accept deprecated aliases (`v1_2`, …).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OrchestrationMode {
    /// Architect + ephemeral executors (`delegate_executor`), intent gate, discuss/edit split.
    #[default]
    RoleSplit,
}

impl OrchestrationMode {
    #[must_use]
    pub fn parse(s: &str) -> Option<Self> {
        let normalized = s.trim().to_lowercase();
        if normalized.is_empty() || normalized == "role_split" || normalized == "role-split" {
            return Some(Self::RoleSplit);
        }
        if matches!(
            normalized.as_str(),
            "v1_2" | "v1.2" | "v12" | "1.2" | "1.2.0" | "v1_3" | "v1.3" | "v13" | "1.3" | "1.3.0"
        ) {
            tracing::warn!(
                orchestration_mode = %normalized,
                "deprecated orchestrationMode alias — use role_split"
            );
            return Some(Self::RoleSplit);
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
                "unknown orchestrationMode — forcing role_split pipeline"
            );
            return Self::RoleSplit;
        }
        Self::RoleSplit
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        "role_split"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_orchestration_modes() {
        assert_eq!(OrchestrationMode::parse("legacy"), None);
        assert_eq!(
            OrchestrationMode::parse("role_split"),
            Some(OrchestrationMode::RoleSplit)
        );
        assert_eq!(
            OrchestrationMode::parse("v1_2"),
            Some(OrchestrationMode::RoleSplit)
        );
        assert_eq!(
            OrchestrationMode::parse("v1_3"),
            Some(OrchestrationMode::RoleSplit)
        );
    }

    #[test]
    fn resolve_param_role_split() {
        assert_eq!(
            OrchestrationMode::resolve(Some("role_split")),
            OrchestrationMode::RoleSplit
        );
        assert_eq!(OrchestrationMode::RoleSplit.as_str(), "role_split");
    }
}
