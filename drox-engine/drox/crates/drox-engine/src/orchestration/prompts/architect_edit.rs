//! System prompt **Architect — edit path**.
//!
//! Noyau G3-core + protocoles `T-*` injectés au boot via `system/gates/edit.rs`.

use super::system::gates::edit::architect_edit_system_prompt_core_for_run as architect_edit_core_for_run_with_vars;
use super::vars::PromptVars;

/// Noyau edit pour `agent.run` role_split.
#[must_use]
pub fn architect_edit_system_prompt_core_for_run() -> String {
    architect_edit_core_for_run_with_vars(&PromptVars::default())
}

#[must_use]
pub fn architect_edit_system_prompt_core_for_run_vars(vars: &PromptVars) -> String {
    architect_edit_core_for_run_with_vars(vars)
}
