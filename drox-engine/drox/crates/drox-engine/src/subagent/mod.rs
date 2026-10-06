//! Sous-agents (§2.10) — V1 : type **Explore** (lecture seule), tool `task`.
//!
//! ## Carte des fichiers
//!
//! | Module | Rôle |
//! |--------|------|
//! | [`registry`] | Tools autorisés dans l'Explore enfant |
//! | [`prompts`] | System prompt + thoroughness |
//! | [`budget`] | Plafond d'itérations phase **exécution** |
//! | [`progress`] | Activity lines + progress live UI (pas le parent) |
//! | [`report`] | Format rapport parent + helpers texte |
//! | [`executor`] | `EngineSubagentExecutor` : phase 1 tools → phase 2 compte rendu |

mod budget;
mod executor;
mod progress;
mod prompts;
mod registry;
mod report;

#[cfg(test)]
mod tests;

pub use budget::explore_iteration_budget;
pub use executor::EngineSubagentExecutor;
pub use registry::explore_tool_registry;
