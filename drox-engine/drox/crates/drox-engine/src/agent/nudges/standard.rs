//! Nudges agent **Standard** (legacy) et suppléments transverses.

pub(crate) const NATIVE_THINKING_UI_SUPPLEMENT: &str = "Native provider thinking is shown only inside the \
     collapsed exploration trace in the UI — never as the user-visible chat reply.\n\
     \n\
     Rules:\n\
     - In thinking/exploration prose, do NOT debate implicit tasks, proactive workspace surveys, \
     or “should I explore while waiting” — the User message is the only scope.\n\
     - Do NOT write your final report, Markdown analysis, or questions to the user inside \
     `internal_reasoning`, `[phase: reading]`, `[phase: analyzing]`, or `[phase: acting]` prose.\n\
     - Keep exploration notes telegraphic in those phases; call tools there.\n\
     - For the answer the user must read: emit `[phase: answering]` on its own line, write the \
     full structured reply in clean Markdown, then `[phase: done]` on its own line.\n\
     - Do not duplicate the report in both exploration prose and `[phase: answering]`.";

pub(crate) const NUDGE_PROMPT: &str = "Have you fully completed the user's objective?\n\
    \n\
    **IMPORTANT — read this before acting:** This is an engine reminder, NOT \
    a user reply. If your previous `[phase: answering]` ended with a question \
    to the user (\"Do you want me to…?\", \"Shall I…?\", \"Would you like…?\"), \
    treat the answer as NO — the user has NOT responded yet. In that case, \
    you MUST close with `[phase: done]` and wait. Do NOT interpret this \
    engine message as user approval or as permission to proceed autonomously.\n\
    \n\
    - If your last answering block contained a question to the user and you \
      are waiting for their answer → emit ONLY `[phase: done]`. Stop here.\n\
    - If YES (objective fully met, no pending question): emit `[phase: answering]` \
      on its own line, write your final user-facing response in clean Markdown, \
      then end the message with a line containing EXACTLY `[phase: done]`. \
      That is the ONLY way to end the conversation.\n\
    - If NO: emit `[phase: reading]` or `[phase: acting]` (pick what matches \
      your next tool), optionally one short line of intent, then call the \
      next tool **in the same reply** (`glob`, `file_read`, `grep`, `lsp`, \
      `file_edit`, `file_write`, `delete_path`, `bash`, etc.). Stopping with mere intent \
      prose (\"I should verify…\", \"I will read…\") does NOT end your turn — \
      the engine will keep nudging you until you either deliver `[phase: done]` \
      or actually act.";

pub(crate) const DONE_ONLY_NUDGE_PROMPT: &str = "Your previous reply ended inside \
    `[phase: answering]` but did NOT include the final `[phase: done]` marker. \
    The engine only closes the turn on `[phase: done]`.\n\
    \n\
    **Do NOT rewrite, paraphrase, or repeat your answer** — the user already \
    received it. Just send a tiny assistant message containing ONLY:\n\
    \n\
    [phase: done]\n\
    \n\
    Nothing else. No `[phase: answering]`, no Markdown, no recap.";

pub(crate) const MUTATING_TOOL_BEFORE_TODO_WRITE_NUDGE: &str = "Heads-up: you called a **mutating** \
    tool (`file_edit` / `file_write` / `notebook_edit` / `delete_path` / `bash`) before any \
    successful `todo_write` in this run.\n\
    \n\
    **Strongly recommended** (not required by the engine): call `todo_write` with at least \
    one item describing what you are about to do so the user sees your plan in the \
    to-do widget before you change files or run commands. You may continue working, but \
    updating the plan soon improves transparency.\n\
    \n\
    Read-only exploration (`glob`, `file_read`, `grep`, `lsp`, `web_*`, and read-only \
    `bash` such as `ls`) does not need a plan first.";

pub(crate) const MUTATING_TOOLS_FOR_STEP_TRACKING: &[&str] =
    &["file_edit", "file_write", "notebook_edit", "delete_path", "bash"];

/// Échecs `ask_user_question` consécutifs avant nudge système (§2.21).
pub(crate) const MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES: u32 = 3;

