//! Helpers de construction de nudges dynamiques.

use drox_tools::CANONICAL_ASK_JSON_EXAMPLE;

use super::thinking_supplement::MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES;

#[must_use]
pub(crate) fn run_objective_system_block(objective: &str) -> String {
    format!(
        "## Objectif verrouillé (demande utilisateur)\n{}\n\n\
         Fidélité objectif :\n\
         - Une incohérence découverte n'est PAS une tâche implicite : utilise `scope_defer` \
         ou `ask_user_question` avant d'élargir le périmètre.\n\
         - Pas d'audit ni refactor global tant que cet objectif n'est pas atteint.\n\
         - Avant `[phase: done]`, indique brièvement dans ta dernière `[phase: answering]` \
         comment l'objectif est satisfait.",
        objective.trim()
    )
}

#[must_use]
pub(crate) fn ask_user_question_loop_nudge() -> String {
    format!(
        "You called `ask_user_question` {MAX} times in a row without success. \
         Either ask the user in plain Markdown under `[phase: clarifying]` (no tool), \
         OR call `ask_user_question` again via native tool_calls with EXACTLY this JSON \
         (do NOT paste JSON in assistant text): {CANONICAL_ASK_JSON_EXAMPLE}",
        MAX = MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
    )
}
