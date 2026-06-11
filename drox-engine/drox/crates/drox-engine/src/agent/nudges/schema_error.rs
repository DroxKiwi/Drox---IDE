//! Payloads outil malformés et relance quand le modèle termine sans outil ni `[phase: done]`.

use crate::run_spec::{RoleId, RunSpec};

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

const DISCUSSION_CONTINUE_PROMPT: &str = "\
Discussion: you already answered. \
Do not repeat, add tools, plan, or explore the workspace for a greeting-only message. \
Publish: line `[discussion: reply]`, your user-facing answer, then line `[discussion: done]`.";

/// Relance unique quand le tour assistant n'a ni outil ni `[phase: done]`.
#[must_use]
pub(crate) fn schema_error_continue_nudge(spec: &RunSpec, no_work_edit: bool) -> &'static str {
    if no_work_edit {
        return NO_WORK_PROMPT;
    }
    if spec.role_id == RoleId::ArchitectDiscussion {
        return DISCUSSION_CONTINUE_PROMPT;
    }
    CONTINUE_PROMPT
}
