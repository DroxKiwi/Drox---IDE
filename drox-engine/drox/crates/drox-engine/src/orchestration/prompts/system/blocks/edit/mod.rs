//! Blocs **edit** — noyau G3-core au boot ; protocoles `T-*` injectés via `system/gates/edit.rs`.

use super::{join_sections, render_md};
use crate::orchestration::prompts::vars::PromptVars;

const LITERAL_USER_RAW: &str = include_str!("../common/literal_user_message.md");

/// Noyau edit + règles message utilisateur littéral.
#[must_use]
pub fn core(vars: &PromptVars) -> String {
    let core_md = include_str!("01_core_rail_solo.md");
    join_sections(&[render_md(vars, core_md), LITERAL_USER_RAW.to_string()])
}
