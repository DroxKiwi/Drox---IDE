//! Messages utilisateur initiaux — discussion, edit.

use super::ARCHITECT_TOOLS;
use crate::orchestration::sanitize_architect_user_prompt;

/// Initial user message for an Architect edit run.
///
/// Discovery vs task mode is chosen by the model (`[mode: discovery]` / `[mode: task]`) per `01_core.md`;
/// the engine does not scan the user message for mode.
#[must_use]
pub fn architect_user_message(user_prompt: &str) -> String {
    let _ = ARCHITECT_TOOLS;
    let literal = sanitize_architect_user_prompt(user_prompt);
    format!("## User\n\n{literal}")
}
