//! Nudge rail READ — exploration prolongée sur un brief mutation.

pub(crate) const READ_STALL_NUDGE_PROMPT: &str = "\
Run rail: READ station — exploration looks sufficient for this edit request.\n\
When you are ready to change files: emit `[gate: advance]` on its own line, or call \
`edit_file` with {\"action\":\"describe\"} once to unlock `file_edit` / `file_write`.\n\
Read-only tools alone (`file_read`, `grep`, …) will not apply a fix. Keep reading only \
if a specific path or root cause is still unknown.";

pub(crate) const READ_STALL_STRONG_NUDGE_PROMPT: &str = "\
Run rail: READ station — you have spent many turns exploring without mutating.\n\
Root cause appears known from your plan — emit `[gate: advance]` **now** (own line), or \
call `edit_file` with {\"action\":\"describe\"} and apply the fix next turn.\n\
Further `file_read` / `grep` alone will not satisfy an edit request.";
