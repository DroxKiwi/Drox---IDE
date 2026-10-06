//! Sous-agents (§2.10) — **contrat côté tools**.
//!
//! L'implémentation (boucle Explore, phases exécution / compte rendu) vit dans
//! `drox-engine::subagent`. Ici : uniquement ce que le registre / `ToolContext`
//! et le tool `task` ont besoin de connaître.

mod subagent_executor_trait;
mod outcome;
mod settings;

pub use subagent_executor_trait::SubagentExecutor;
pub use outcome::ExploreOutcome;
pub use settings::SubagentSettings;
