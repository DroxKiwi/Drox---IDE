//! Couche C — orchestration multi-rôles (1.2.0).

mod config;
pub mod context_frame;
pub mod tool_folders;
mod architect_gate;
mod intent_probe;
mod json_response;
mod start_run;
mod user_message_scope;
mod protocol_markers;
mod prompts;
pub mod tuning;

pub use config::{OrchestrationConfig, DEFAULT_ARCHITECT_MODEL};
pub use architect_gate::{
    extract_discussion_done_from_text, extract_discussion_user_facing_reply,
    parse_discussion_reply_marker, ArchitectGate,
};
pub use intent_probe::{
    gate_chain_for_auto, gate_chain_for_rpc, parse_run_intent_json, resolve_run_intent,
    ProbeSource, ResolvedRunIntent, RunIntentFlags, run_intent_probe,
};
pub use json_response::{extract_first_json_object, looks_like_gate_json_response};
pub use start_run::{GateChainResult, StartRunKind};
pub use user_message_scope::{
    initial_run_objective_for_concrete_edit, sanitize_architect_user_prompt,
    sanitize_transcript_user_messages,
};
pub use protocol_markers::{
    is_meta_synthesis_task, todo_declares_meta_task, DISCUSSION_DONE_LINE,
    DISCUSSION_REPLY_LINE, TASK_META_LINE,
};
pub use prompts::{
    architect_discussion_system_prompt, architect_discussion_system_prompt_default,
    architect_discussion_system_prompt_for_start_run,
    architect_discussion_user_message,
    architect_edit_system_prompt_core_for_run, architect_edit_system_prompt_core_for_run_vars,
    architect_user_message,
    architect_run_context_block, architect_run_context_block_compaction,
    architect_run_context_block_per_turn, architect_tool_short_description,
    tool_supplements_all_architect, tool_supplements_for_station,
    PromptBlockId, PromptVars,
    StrictnessPreset, ARCHITECT_DISCUSSION_CORE_PROMPT, ARCHITECT_DISCUSSION_SYSTEM_PROMPT,
};
pub use tuning::{resolve_engine_tuning, EngineTuning, EngineTuningOverrides};
pub use context_frame::{
    append_gate_nudge, apply_architect_iteration_start, ArchitectIterationInput, NudgeId,
};

/// Wire identifier for the product orchestration pipeline (`agent.run` / IDE chat).
/// Single variant today; `parse` / `resolve` accept deprecated aliases (`v1_2`, …).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OrchestrationMode {
    /// Architect edit path with run rail (`role_split`).
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
