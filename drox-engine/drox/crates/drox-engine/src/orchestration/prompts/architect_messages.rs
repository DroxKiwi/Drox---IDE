//! Messages utilisateur initiaux — discussion, edit.

use super::ARCHITECT_TOOLS;
use crate::orchestration::sanitize_architect_user_prompt;

/// Initial user message for an Architect edit run.
///
/// Scope is tied to the user request per `01_core_rail_solo.md` (run rail owns progression).
/// the engine does not scan the user message for mode.
#[must_use]
pub fn architect_user_message(user_prompt: &str) -> String {
    let _ = ARCHITECT_TOOLS;
    let literal = sanitize_architect_user_prompt(user_prompt);
    format!("## User\n\n{literal}")
}
