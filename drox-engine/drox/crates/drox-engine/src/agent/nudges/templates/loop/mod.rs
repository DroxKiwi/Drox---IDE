//! Templates anti-boucle — un fichier `.md` par fragment LLM.
//!
//! Assemblage et paliers : [`crate::agent::nudges::loop_intervention`].

pub(crate) const SYSTEM_NUDGE: &str = include_str!("system_nudge.md");
pub(crate) const ROLE_ARCHITECT: &str = include_str!("role_architect.md");
pub(crate) const ROLE_EXECUTOR: &str = include_str!("role_executor.md");
pub(crate) const ROLE_STANDARD: &str = include_str!("role_standard.md");
pub(crate) const REPEAT_TEXT: &str = include_str!("repeat_text.md");
pub(crate) const REPEAT_TOOL_CALLS: &str = include_str!("repeat_tool_calls.md");
pub(crate) const REPEAT_BOTH: &str = include_str!("repeat_both.md");
pub(crate) const ESCALATION_FIRST: &str = include_str!("escalation_first.md");
pub(crate) const ESCALATION_SECOND: &str = include_str!("escalation_second.md");
pub(crate) const ESCALATION_FINAL: &str = include_str!("escalation_final.md");
pub(crate) const FOOTER: &str = include_str!("footer.md");
