//! Payloads outil malformés et relance quand le modèle termine sans outil ni `[phase: done]`.

use crate::orchestration::RunIntentFlags;
use crate::run_spec::{RoleId, RunSpec};

use super::text_tool_marker::CONTINUE_NO_RESULTS_YET;

pub(crate) const TODO_WRITE_MISSING_TODOS: &str = "\
Blocked: `todo_write` payload must include `todos`.\n\
Use exactly: {\"todos\":[{\"id\":\"t1\",\"content\":\"…\",\"status\":\"pending|in_progress|completed|cancelled\"}]}\n\
Do not send `{}` or legacy payloads.";

pub(crate) const TODO_WRITE_EMPTY_TODOS: &str = "\
Blocked: `todo_write.todos` is empty. Keep existing tasks and update statuses; \
do not clear the plan.";

const CONTINUE_PROMPT: &str = "\
Continue as **Architect**: re-read the **user request** and your last tool results.\n\n\
You have **full workspace tools** (`file_edit`, `bash`, `grep`, `file_read`, `lsp`, …) — work directly; optional `todo_write` for multi-step work.\n\n\
When the user-facing answer is ready: `[phase: answering]` then `[phase: done]`. Do not repeat the same verification checklist.";

const NO_WORK_PROMPT: &str = "\
[NUDGE] This looks like a **light message**, not a repo task.\n\n\
Reply in **`[phase: answering]`**, then **`[phase: done]`** — no `todo_write`, no exploration tools.";

const DISCUSSION_GREETING_PROMPT: &str = "\
[NUDGE] This looks like a **light message**, not a repo task.\n\n\
Publish: line `[discussion: reply]`, your user-facing answer, then line `[discussion: done]` — no exploration tools.";

const DISCUSSION_CONTINUE_PROMPT: &str = "\
Discussion: you already answered. \
Do not repeat, add tools, plan, or explore the workspace for a greeting-only message. \
Publish: line `[discussion: reply]`, your user-facing answer, then line `[discussion: done]`.";

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
pub(crate) fn should_use_no_work_nudge(
    spec: &RunSpec,
    run_intent: Option<&RunIntentFlags>,
) -> bool {
    if run_intent.is_some_and(|f| f.greeting_only) {
        return true;
    }
    spec.role_id == RoleId::ArchitectDiscussion && !spec.discussion_allow_reads
}

/// Relance quand le tour assistant n'a ni outil ni `[phase: done]`.
#[must_use]
pub(crate) fn schema_error_continue_nudge(
    spec: &RunSpec,
    run_intent: Option<&RunIntentFlags>,
    ctx: SchemaErrorNudgeContext,
) -> &'static str {
    if should_use_no_work_nudge(spec, run_intent) {
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
    use crate::orchestration::RunIntentFlags;
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

    fn compound_plan_flags() -> RunIntentFlags {
        RunIntentFlags::from_llm(false, true)
    }

    #[test]
    fn architect_edit_idle_uses_continue_not_light_message() {
        assert!(!should_use_no_work_nudge(
            &architect_edit_spec(),
            Some(&compound_plan_flags()),
        ));
        assert_eq!(
            schema_error_continue_nudge(
                &architect_edit_spec(),
                Some(&compound_plan_flags()),
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
                None,
                SchemaErrorNudgeContext {
                    has_tool_results_since_user: false,
                },
            ),
            CONTINUE_NO_RESULTS_YET,
        );
    }

    #[test]
    fn architect_edit_without_todos_still_uses_continue() {
        assert!(!should_use_no_work_nudge(&architect_edit_spec(), None));
        assert_eq!(
            schema_error_continue_nudge(
                &architect_edit_spec(),
                None,
                SchemaErrorNudgeContext::default(),
            ),
            CONTINUE_PROMPT
        );
    }

    #[test]
    fn discuss_reply_only_uses_greeting_nudge() {
        let spec = discuss_reply_only_spec();
        let flags = RunIntentFlags::from_llm(true, false);
        assert!(should_use_no_work_nudge(&spec, Some(&flags)));
        assert_eq!(
            schema_error_continue_nudge(&spec, Some(&flags), SchemaErrorNudgeContext::default()),
            DISCUSSION_GREETING_PROMPT
        );
    }

    #[test]
    fn discuss_with_reads_idle_uses_discussion_continue() {
        let spec = discuss_with_reads_spec();
        let flags = RunIntentFlags::from_llm(false, false);
        assert!(!should_use_no_work_nudge(&spec, Some(&flags)));
        assert_eq!(
            schema_error_continue_nudge(&spec, Some(&flags), SchemaErrorNudgeContext::default()),
            DISCUSSION_CONTINUE_PROMPT
        );
    }

    #[test]
    fn greeting_only_flag_triggers_no_work_even_with_reads() {
        let spec = discuss_with_reads_spec();
        let flags = RunIntentFlags::from_llm(true, false);
        assert!(should_use_no_work_nudge(&spec, Some(&flags)));
    }
}
