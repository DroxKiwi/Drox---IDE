//! Prompts système par défaut injectés en tête de conversation.
//!
//! Sprint A (refonte 2026-05-13). Le `CORE_SYSTEM_PROMPT` ne contient plus
//! de paragraphes défensifs (« ne dis pas X », « interdit de Y ») : tout
//! repose sur **un protocole de phases** explicite, observé par le moteur
//! via les marqueurs `[phase: ...]`. Le moteur impose un `todo_write`
//! réussi **avant tout outil mutateur** (`file_edit`, `file_write`,
//! `notebook_edit`, `delete_path`, `copy_path`, mutating `bash`) ; les outils
//! read-only **et** le bash inspectif (`git status`, `ls|grep|awk`, `dir|findstr`,
//! `cargo check`, redirects vers temp / hors workspace, … — aligné
//! `drox_bash::command_is_inspect_only_with_workspace`) peuvent précéder.
//! `todo_write` n'est PAS exigé pour les réponses purement conversationnelles
//! (salutation, question triviale) — la todo-list trace du travail réel.
//!
//! Voir aussi `crate::event::Phase` et `agent::NUDGE_PROMPT` côté moteur.
//!
//! | Module | Rôle |
//! |--------|------|
//! | [`core`] | `CORE_SYSTEM_PROMPT` |
//! | [`supplements`] | Thinking / hors-WS / Explore / Professeur |
//! | [`compaction`] | `COMPACTION_PROMPT` mémoire |

mod compaction;
mod core;
mod supplements;

#[cfg(test)]
mod tests;

pub use compaction::COMPACTION_PROMPT;
pub use core::CORE_SYSTEM_PROMPT;
pub use supplements::{
    ALLOW_OUTSIDE_WORKSPACE_SUPPLEMENT, NATIVE_THINKING_REASONING_SUPPLEMENT,
    PROFESSOR_MODE_SUPPLEMENT, SUBAGENTS_EXPLORE_SUPPLEMENT,
};

/// Préfixe le prompt user / memdir / langue par le `CORE_SYSTEM_PROMPT`. Si
/// `existing` est non vide (ex. CLI a passé `--system` avec un override
/// complet), on l'append après le core.
#[must_use]
pub fn prepend_core_system_prompt(existing: Option<String>) -> String {
    match existing {
        Some(s) if !s.trim().is_empty() => format!("{CORE_SYSTEM_PROMPT}\n{s}"),
        _ => CORE_SYSTEM_PROMPT.to_string(),
    }
}
