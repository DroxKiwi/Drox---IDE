//! Nudges rôle **Exécutant**.

pub(crate) const EXECUTOR_NUDGE_PROMPT: &str = "Continue the **Architect-assigned** task only — **minimal tool use**.\n\
In thinking, refer to **the Architect** as your requester — never « the user wants… ».\n\
Prefer: one `glob` or one `file_read` → `file_write` the `.md` deliverable → stop. Do not re-read files. Do not narrate.";

pub(crate) const EXECUTOR_DONE_ONLY_NUDGE_PROMPT: &str = "Deliverable `.md` written under `.drox/agent-output/<task_id>/`?\n\
The engine auto-closes when the file exists — stop calling tools.\n\
If already done, emit only `[phase: done]` (no rewrite, no re-read).";
