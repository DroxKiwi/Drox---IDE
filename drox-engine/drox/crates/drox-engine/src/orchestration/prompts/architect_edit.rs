//! System prompt **Architect — edit path**.
//!
//! Noyau G3-core + protocoles `T-*` injectés au boot via `system/gates/edit.rs`.

use super::system::gates::edit::{
    architect_edit_system_prompt_core_for_run as architect_edit_core_for_run_with_vars,
    parallel_slots_supplement,
};
use super::vars::PromptVars;

/// Noyau edit pour `agent.run` role_split.
#[must_use]
pub fn architect_edit_system_prompt_core_for_run(max_parallel_executors: usize) -> String {
    architect_edit_core_for_run_with_vars(max_parallel_executors, &PromptVars::default())
}

#[must_use]
pub fn architect_edit_system_prompt_core_for_run_vars(
    max_parallel_executors: usize,
    vars: &PromptVars,
) -> String {
    architect_edit_core_for_run_with_vars(max_parallel_executors, vars)
}

#[must_use]
pub fn architect_parallel_slots_supplement(slots: usize) -> String {
    parallel_slots_supplement(slots, &PromptVars::default())
}
