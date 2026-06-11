//! Native-thinking UI supplement (aligned run rail — no legacy phase markers).

pub(crate) const NATIVE_THINKING_UI_SUPPLEMENT: &str = "Native provider thinking is shown only inside the \
     collapsed exploration trace in the UI — never as the user-visible chat reply.\n\
     \n\
     Rules:\n\
     - In thinking/exploration prose, do NOT debate implicit tasks, proactive workspace surveys, \
     or “should I explore while waiting” — the User message is the only scope.\n\
     - Do NOT write your final report, Markdown analysis, or questions to the user inside \
     `internal_reasoning` or other internal reasoning prose.\n\
     - The run rail owns station progression — use `[gate: advance]` / `[gate: hold]` and \
     `[depth: short|complex]` per the system prompt; do not drive the run with legacy \
     `[phase: reading|acting|planning]` markers.\n\
     - For the answer the user must read: emit `[phase: answering]` on its own line, write the \
     full structured reply in clean Markdown, then `[phase: done]` on its own line.\n\
     - Do not duplicate the report in both exploration prose and `[phase: answering]`.";

/// Consecutive `ask_user_question` failures before injecting a system nudge.
pub(crate) const MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES: u32 = 3;
