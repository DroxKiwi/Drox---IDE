//! Prompt **discussion** — réponse directe, exploration lecture seule.

pub use super::system::gates::discuss::{
    architect_discussion_system_prompt, architect_discussion_system_prompt_default,
    architect_discussion_system_prompt_for_start_run, ARCHITECT_DISCUSSION_CORE_PROMPT,
    ARCHITECT_DISCUSSION_SYSTEM_PROMPT,
};
#[must_use]
pub fn architect_discussion_user_message(user_prompt: &str) -> String {
    let literal = crate::orchestration::sanitize_architect_user_prompt(user_prompt);
    format!("## User\n\n{literal}")
}
