//! Sous-agents (§2.10) — V1 : type **Explore** (lecture seule), tool `task`.
//!
//! ## Carte des fichiers
//!
//! | Module | Rôle |
//! |--------|------|
//! | [`explore_tool_registry`] | Tools autorisés dans l'Explore enfant |
//! | [`budget`] | Plafond d'itérations phase **exécution** |
//! | [`explore_ui_progress`] | Activity lines + progress live UI (pas le parent) |
//! | [`report`] | Format rapport parent + helpers texte |
//! | [`explore_artifact`] | `.drox/subagents/…/<kind>.md` + manifest (pas de conclusion) |
//! | [`cascade_fill`] | Fallback legacy fill JSON (non nominal Option A) |
//! | [`explore_executor`] | `EngineSubagentExecutor` : tools + commit → assemble |

mod budget;
mod cascade_fill;
mod explore_artifact;
mod explore_executor;
mod explore_ui_progress;
mod explore_tool_registry;
mod report;

#[cfg(test)]
mod tests;

pub use budget::explore_iteration_budget;
pub use explore_executor::EngineSubagentExecutor;
pub use explore_tool_registry::explore_tool_registry;
