//! Payloads outil malformés et relance quand le modèle termine sans outil ni `[phase: done]`.

use crate::run_spec::{RoleId, RunSpec};

use super::text_tool_marker::CONTINUE_NO_RESULTS_YET;

const CONTINUE_PROMPT: &str = "\
Continue as **Architect**: re-read the **user request** and your last tool results.\n\n\
You have **full workspace tools** (`file_edit`, `bash`, `grep`, `file_read`, `lsp`, …) — work directly; optional `internal_plan_write` for multi-step work.\n\n\
When the user-facing answer is ready: `[phase: answering]` then `[phase: done]`. Do not repeat the same verification checklist.";

const NO_WORK_PROMPT: &str = "\
[NUDGE] This looks like a **light message**, not a repo task.\n\n\
Reply in **`[phase: answering]`**, then **`[phase: done]`** — no `internal_plan_write`, no exploration tools.";

const DISCUSSION_GREETING_PROMPT: &str = "\
[NUDGE] This looks like a **light message**, not a repo task.\n\n\
Publish: line `[discussion: reply]`, your user-facing answer, then line `[discussion: done]` — no exploration tools.";

const DISCUSSION_CONTINUE_PROMPT: &str = "\
Discussion: you already answered. \
Do not repeat, add tools, plan, or explore the workspace for a greeting-only message. \
Publish: line `[discussion: reply]`, your user-facing answer, then line `[discussion: done]`.";

/// Max idle turns (no tool, no `[phase: done]`) before forced closure escalation (1.4.2).
pub(crate) const SCHEMA_ERROR_CONTINUE_MAX: u32 = 3;

const FORCED_ANSWERING_PROMPT: &str = "\
[NUDGE — forced closure] You have spent several turns without tools or `[phase: done]`.\n\n\
Publish your **user-facing answer now**: line `[phase: answering]`, then your Markdown reply, \
then line `[phase: done]`. Do not call more tools unless a blocking error remains.";

/// Relance escaladée après `SCHEMA_ERROR_CONTINUE_MAX` tours stériles.
#[must_use]
pub(crate) fn schema_error_forced_answering_nudge() -> &'static str {
    FORCED_ANSWERING_PROMPT
}
/// Contexte pour choisir le nudge `schema_error` vs variante sans tool results.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct SchemaErrorNudgeContext {
    pub has_tool_results_since_user: bool,
}

impl Default for SchemaErrorNudgeContext {
    fn default() -> Self {
        Self {
            has_tool_results_since_user: true,
        }
    }
}

/// Whether an idle assistant turn should get the « light message » nudge (no repo tools).
#[must_use]
pub(crate) fn should_use_no_work_nudge(spec: &RunSpec) -> bool {
    spec.role_id == RoleId::ArchitectDiscussion && !spec.discussion_allow_reads
}

/// Relance quand le tour assistant n'a ni outil ni `[phase: done]`.
#[must_use]
pub(crate) fn schema_error_continue_nudge(
    spec: &RunSpec,
    ctx: SchemaErrorNudgeContext,
) -> &'static str {
    if should_use_no_work_nudge(spec) {
        if spec.role_id == RoleId::ArchitectDiscussion {
            return DISCUSSION_GREETING_PROMPT;
        }
        return NO_WORK_PROMPT;
    }
    if spec.role_id == RoleId::ArchitectDiscussion {
        return DISCUSSION_CONTINUE_PROMPT;
    }
    if !ctx.has_tool_results_since_user {
        return CONTINUE_NO_RESULTS_YET;
    }
    CONTINUE_PROMPT
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::run_spec::{RoleId, RunSpec};

    fn architect_edit_spec() -> RunSpec {
        RunSpec::for_orchestration_role(RoleId::Architect)
    }

    fn discuss_reply_only_spec() -> RunSpec {
        RunSpec::for_architect_discussion_with_reads(false)
    }

    fn discuss_with_reads_spec() -> RunSpec {
        RunSpec::for_architect_discussion_with_reads(true)
    }

    #[test]
    fn schema_error_continue_max_is_three() {
        assert_eq!(super::SCHEMA_ERROR_CONTINUE_MAX, 3);
    }

    #[test]
    fn forced_answering_nudge_mentions_phase_markers() {
        let n = super::schema_error_forced_answering_nudge();
        assert!(n.contains("[phase: answering]"));
        assert!(n.contains("[phase: done]"));
    }

    #[test]
    fn architect_edit_idle_uses_continue_not_light_message() {
        assert!(!should_use_no_work_nudge(&architect_edit_spec()));
        assert_eq!(
            schema_error_continue_nudge(
                &architect_edit_spec(),
                SchemaErrorNudgeContext::default(),
            ),
            CONTINUE_PROMPT
        );
    }

    #[test]
    fn architect_edit_without_tool_results_uses_no_results_variant() {
        assert_eq!(
            schema_error_continue_nudge(
                &architect_edit_spec(),
                SchemaErrorNudgeContext {
                    has_tool_results_since_user: false,
                },
            ),
            CONTINUE_NO_RESULTS_YET,
        );
    }

    #[test]
    fn discuss_reply_only_uses_greeting_nudge() {
        let spec = discuss_reply_only_spec();
        assert!(should_use_no_work_nudge(&spec));
        assert_eq!(
            schema_error_continue_nudge(&spec, SchemaErrorNudgeContext::default()),
            DISCUSSION_GREETING_PROMPT
        );
    }

    #[test]
    fn discuss_with_reads_idle_uses_discussion_continue() {
        let spec = discuss_with_reads_spec();
        assert!(!should_use_no_work_nudge(&spec));
        assert_eq!(
            schema_error_continue_nudge(&spec, SchemaErrorNudgeContext::default()),
            DISCUSSION_CONTINUE_PROMPT
        );
    }
}
