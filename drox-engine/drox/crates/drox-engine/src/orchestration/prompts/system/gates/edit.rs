//! Run **edit** — assemblage du noyau G3-core (protocoles outil injectés par station, cf. iteration_start).

use super::super::blocks::edit;

use crate::orchestration::prompts::vars::PromptVars;

/// Setup edit : noyau G3-core seul ; protocoles outil rafraîchis chaque tour par station rail.
#[must_use]
pub fn architect_edit_system_prompt_core_for_run(vars: &PromptVars) -> String {
    edit::core(vars)
}
