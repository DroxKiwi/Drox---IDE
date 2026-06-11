//! Nudge minimal lorsque `[phase: answering]` est déjà émis mais pas `[phase: done]`.

use crate::run_spec::{RoleId, RunSpec};

pub(crate) const ARCHITECT_DONE_ONLY_NUDGE_PROMPT: &str = "\
If the work is finished, emit **one** user summary in `[phase: answering]`, then `[phase: done]` on the next line.\n\n\
Write for the user only — no meta (« The user asked », « Let me mark done »). Do not repeat the same summary.";

pub(crate) const ARCHITECT_DISCUSSION_DONE_ONLY_PROMPT: &str = "\
Discussion: you already answered. \
Do not repeat, add tools, plan, or explore the workspace for a greeting-only message. \
Publish: line `[discussion: reply]`, your user-facing answer, then line `[discussion: done]`.";

#[must_use]
pub(crate) fn done_only_nudge_prompt(spec: &RunSpec) -> &'static str {
    match spec.role_id {
        RoleId::ArchitectDiscussion => ARCHITECT_DISCUSSION_DONE_ONLY_PROMPT,
        _ => ARCHITECT_DONE_ONLY_NUDGE_PROMPT,
    }
}
