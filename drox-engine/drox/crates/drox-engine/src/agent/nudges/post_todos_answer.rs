//! Nudge rail — todos terminal + mutations OK but no `[phase: answering]` yet (B-MOTOR-06).

pub(crate) const POST_TODOS_ANSWER_NUDGE_PROMPT: &str = "\
Run rail: all todos are completed and workspace mutations succeeded, but the user \
has not seen `[phase: answering]` yet.\n\
Emit `[phase: answering]` with your final user-facing summary, then `[phase: done]`. \
Do not call cosmetic `file_edit`/`file_write` — answer now.";
