//! Gate **discussion** — `G2` noyau + supplément lecture variable.

use crate::orchestration::StartRunKind;
use crate::orchestration::prompts::system::blocks::{join_sections, render_md};
use crate::orchestration::prompts::vars::PromptVars;

const DISCUSS_CORE_RAW: &str = include_str!("../blocks/gates/discuss_core.md");
const LITERAL_USER_RAW: &str = include_str!("../blocks/common/literal_user_message_discuss.md");
const DISCUSS_TOOLS_RAW: &str = include_str!("../blocks/discuss/tools.md");
const DISCUSS_CLOSURE_RAW: &str = include_str!("../blocks/discuss/closure.md");
const READ_BUDGET_RAW: &str = include_str!("../blocks/discuss/read_budget.md");

/// Noyau discussion (sans budget lecture).
pub const ARCHITECT_DISCUSSION_CORE_PROMPT: &str = DISCUSS_CORE_RAW;

/// System prompt discussion avec `{read_budget_percent}` résolu.
#[must_use]
pub fn architect_discussion_system_prompt(vars: &PromptVars) -> String {
    // Pas de `mode_choice` ici : le mode est fixé par RPC ou défaut edit.
    join_sections(&[
        DISCUSS_CORE_RAW.to_string(),
        LITERAL_USER_RAW.to_string(),
        DISCUSS_TOOLS_RAW.to_string(),
        render_md(vars, READ_BUDGET_RAW),
        DISCUSS_CLOSURE_RAW.to_string(),
    ])
}

/// Compat : preset **normal** (40 %).
#[must_use]
pub fn architect_discussion_system_prompt_default() -> String {
    architect_discussion_system_prompt(&PromptVars::default())
}

/// Discussion selon variante de run (`with_reads`, `reply_only`, `analyze`).
#[must_use]
pub fn architect_discussion_system_prompt_for_start_run(
    start_run: StartRunKind,
    vars: &PromptVars,
) -> String {
    let base = architect_discussion_system_prompt(vars);
    let extra = match start_run {
        StartRunKind::DiscussWithReads => "\n\n## Run routing\n\
            Mode **with_reads**. The user needs repository knowledge. \
            Use read-only tools (`workspace_map_read`, `file_read`, `grep`, `glob`, `lsp`) \
            **before** your user-facing answer. This is **not** a greeting-only turn.\n",
        StartRunKind::DiscussReplyOnly => "\n\n## Run routing\n\
            Mode **reply_only**. Reply without reading the repo unless the \
            user named a concrete path, bug, or symbol.\n",
        StartRunKind::Analyze => "\n\n## Run routing\n\
            Mode **analyze**. The user wants **read-only repository \
            understanding** (structure, files, symbols) — not edits yet.\n\
            1. Call `workspace_map_read` once to load the workspace map.\n\
            2. Use `file_read`, `glob`, `grep`, and `lsp` as needed to explore.\n\
            3. Do **not** call `internal_plan_write` or `delegate_executor`.\n\
            4. Emit `[discussion: reply]` with a concise synthesis for the user, then \
            `[discussion: done]`.\n",
        _ => "",
    };
    format!("{base}{extra}")
}

/// Alias historique — équivalent `architect_discussion_system_prompt_default()`.
pub const ARCHITECT_DISCUSSION_SYSTEM_PROMPT: &str = DISCUSS_CORE_RAW;
