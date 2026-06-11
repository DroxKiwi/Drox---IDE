//! Nudge rail ACT — tour sans mutation alors qu'une tâche est `in_progress`.

pub(crate) const ACT_STALL_NUDGE_PROMPT: &str = "\
Run rail: ACT station — no file mutation this turn while a task is in progress.\n\
Use `file_edit` or `file_write` on the focus path. Do not call read-only or meta tools.\n\
If blocked, explain in `[phase: answering]` then `[phase: done]`.";
