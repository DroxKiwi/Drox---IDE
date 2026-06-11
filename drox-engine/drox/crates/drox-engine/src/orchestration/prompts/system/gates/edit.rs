//! Run **edit** — assemblage du noyau G3-core + protocoles outil au boot.

use super::super::blocks::{edit, join_sections, tools};

use crate::orchestration::prompts::vars::PromptVars;

/// Setup edit : noyau G3-core + protocoles outil (tous).
#[must_use]
pub fn architect_edit_system_prompt_core_for_run(vars: &PromptVars) -> String {
    let mut parts = vec![edit::core(vars)];
    let tool_protocols = tools::tool_supplements_all_architect(vars);
    if !tool_protocols.is_empty() {
        parts.push(tool_protocols);
    }
    join_sections(&parts)
}
