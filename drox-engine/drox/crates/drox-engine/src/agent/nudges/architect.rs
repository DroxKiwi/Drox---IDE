//! Nudges rôle **Architecte** (voie édition).

pub(crate) const ARCHITECT_NUDGE_PROMPT: &str = "\
Continue as **Architect**: re-read the **user request** and your last tool results.\n\n\
You have **full workspace tools** (`file_edit`, `bash`, `grep`, …) — work directly for trivial fixes, or spawn **Executor sub-agents** via `delegate_executor` when parallel shards or a leaner context help (see parallel slots / `architect_help`).\n\n\
- Sub-agents are **workers only**: no plan, no nested delegation — pack a strict `instructions` + `scope` brief.\n\
- Optional `todo_write` to track shards.\n\n\
When the user-facing answer is ready: `[phase: answering]` then `[phase: done]`. Do not repeat the same verification checklist.";

pub(crate) const ARCHITECT_NUDGE_SOLO_PROMPT: &str = "\
Continue as **Architect**: re-read the **user request** and your last tool results.\n\n\
You have **full workspace tools** (`file_edit`, `bash`, `grep`, `file_read`, `lsp`, …) — work directly; optional `todo_write` for multi-step work.\n\n\
When the user-facing answer is ready: `[phase: answering]` then `[phase: done]`. Do not repeat the same verification checklist.";

pub(crate) const ARCHITECT_CYCLE_SANITY_NUDGE_PROMPT: &str = "\
[NUDGE] Plan tasks look **done** — consider a quick **sanity check** before the user summary.\n\n\
1. **Smoke:** `bash` yourself or one `delegate_executor` with `task_id` `sanity`.\n\n\
2. **Or** `ask_user_question` with `[cycle: user_check]` if only the user can verify.\n\n\
3. If something fails, say so in `[phase: answering]` with fix hints — do not claim success.\n\n\
4. Then `[phase: answering]` → `[phase: done]`.";

pub(crate) const ARCHITECT_CYCLE_SANITY_NUDGE_SOLO_PROMPT: &str = "\
[NUDGE] Plan tasks look **done** — consider a quick **sanity check** before the user summary.\n\n\
1. **Smoke:** run one matching command with **`bash`** (`npm test`, `cargo test`, `pytest`, build, lint — pick what fits the repo).\n\n\
2. **Or** `ask_user_question` with `[cycle: user_check]` if only the user can verify.\n\n\
3. If something fails, say so in `[phase: answering]` with fix hints — do not claim success.\n\n\
4. Then `[phase: answering]` → `[phase: done]`.";

pub(crate) const ARCHITECT_CYCLE_SANITY_BLOCK_DONE_PROMPT: &str = "\
[NUDGE] `[phase: done]` early — **cycle sanity** is still open in the engine snapshot.\n\n\
Run a smoke `delegate_executor` or ask the user (`[cycle: user_check]`), or call `architect_help { \"topic\": \"sanity\" }`.";

pub(crate) const ARCHITECT_CYCLE_SANITY_BLOCK_DONE_SOLO_PROMPT: &str = "\
[NUDGE] `[phase: done]` early — **cycle sanity** is still open in the engine snapshot.\n\n\
Run a smoke **`bash`** command or ask the user (`[cycle: user_check]`), or call `architect_help { \"topic\": \"sanity\" }`.";

pub(crate) const ARCHITECT_RUN_CLOSABLE_NUDGE_PROMPT: &str = "\
[NUDGE] The run looks **ready to close**.\n\n\
1. One `[phase: answering]` with the user-facing summary only.\n\n\
2. Then one line `[phase: done]` — no more tools.\n\n\
Optional: `architect_help { \"topic\": \"closure\" }` if unsure.";

pub(crate) const ARCHITECT_DONE_ONLY_NUDGE_PROMPT: &str = "\
If the work is finished, emit **one** user summary in `[phase: answering]`, then `[phase: done]` on the next line.\n\n\
Write for the user only — no meta (« The user asked », « Let me mark done »). Do not repeat the same summary.";

pub(crate) const ARCHITECT_DISCUSSION_NUDGE_PROMPT: &str = "\
Discussion: you already answered. \
Do not repeat, add tools, plan, or explore the workspace for a greeting-only message. \
Publish: line `[discussion: reply]`, your user-facing answer, then line `[discussion: done]`.";

/// Run edit sans travail repo — salut / small talk.
pub(crate) const ARCHITECT_NO_WORK_NUDGE_PROMPT: &str = "\
[NUDGE] This looks like a **light message**, not a repo task.\n\n\
Reply in **`[phase: answering]`**, then **`[phase: done]`** — no `todo_write`, no `delegate_executor`, no exploration tools.";

pub(crate) const ARCHITECT_NO_WORK_NUDGE_SOLO_PROMPT: &str = "\
[NUDGE] This looks like a **light message**, not a repo task.\n\n\
Reply in **`[phase: answering]`**, then **`[phase: done]`** — no `todo_write`, no exploration tools.";

#[must_use]
pub(crate) fn architect_cycle_sanity_nudge_prompt(delegation: bool) -> &'static str {
    if delegation {
        ARCHITECT_CYCLE_SANITY_NUDGE_PROMPT
    } else {
        ARCHITECT_CYCLE_SANITY_NUDGE_SOLO_PROMPT
    }
}

#[must_use]
pub(crate) fn architect_cycle_sanity_block_done_prompt(delegation: bool) -> &'static str {
    if delegation {
        ARCHITECT_CYCLE_SANITY_BLOCK_DONE_PROMPT
    } else {
        ARCHITECT_CYCLE_SANITY_BLOCK_DONE_SOLO_PROMPT
    }
}

#[must_use]
pub(crate) fn architect_no_work_nudge_prompt(delegation: bool) -> &'static str {
    if delegation {
        ARCHITECT_NO_WORK_NUDGE_PROMPT
    } else {
        ARCHITECT_NO_WORK_NUDGE_SOLO_PROMPT
    }
}

/// Après N lectures sans délégation (`max_reads_before_delegate` — preset).
pub(crate) const ARCHITECT_DELEGATE_AFTER_READS_NUDGE: &str = "\
[NUDGE] You have done many **read-only** tools since the last `delegate_executor`.\n\n\
- **Single-file / trivial fix** — keep working directly.\n\
- **Multi-file or parallel shards** — prefer `delegate_executor` (see parallel slots) so executors run in parallel while you coordinate.\n\
- `architect_help { \"topic\": \"delegate\" }` if unsure.";

/// Après N mutations directes sans délégation (`max_mutations_before_delegate_nudge` — preset).
pub(crate) const ARCHITECT_DELEGATE_AFTER_MUTATIONS_NUDGE: &str = "\
[NUDGE] You have applied several **direct edits** without delegating.\n\n\
Delegation is **optional** — fine for one-shot fixes. For remaining work across multiple files, consider `delegate_executor` to offload independent shards and keep your context lean.";
