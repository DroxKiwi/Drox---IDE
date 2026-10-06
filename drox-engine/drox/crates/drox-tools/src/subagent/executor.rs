//! Trait d'exécution — implémenté par `drox-engine` (`EngineSubagentExecutor`).

use async_trait::async_trait;

use crate::context::ToolContext;
use crate::error::ToolError;

use super::ExploreOutcome;

/// Exécuteur branché par le moteur quand [`super::SubagentSettings::enabled`].
///
/// V1 : seul `run_explore` (lecture seule). Le moteur enchaîne typiquement :
/// 1. phase exécution (tools),
/// 2. phase compte rendu (synthèse sans tools pour le parent).
#[async_trait]
pub trait SubagentExecutor: Send + Sync {
	/// Lance un sous-agent **Explore** (lecture seule) et renvoie le rapport
	/// parent + télémétrie budget (`truncated` / itérations).
	async fn run_explore(
		&self,
		description: String,
		thoroughness: Option<String>,
		ctx: &ToolContext,
	) -> Result<ExploreOutcome, ToolError>;
}
