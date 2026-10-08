//! Trait d'exécution — implémenté par `drox-engine` (`EngineSubagentExecutor`).

use async_trait::async_trait;

use crate::error::ToolError;
use crate::tool_context::ToolContext;

use super::{ExploreOutcome, ExploreRequest};

/// Exécuteur branché par le moteur quand [`super::SubagentSettings::enabled`].
///
/// V1 : seul `run_explore` (lecture seule). Le moteur enchaîne typiquement :
/// 1. phase exécution (tools),
/// 2. phase compte rendu (synthèse sans tools pour le parent).
#[async_trait]
pub trait SubagentExecutor: Send + Sync {
	/// Lance un sous-agent **Explore** (lecture seule) et renvoie le rapport
	/// parent + artefacts + télémétrie budget (`truncated` / itérations).
	async fn run_explore(
		&self,
		request: ExploreRequest,
		ctx: &ToolContext,
	) -> Result<ExploreOutcome, ToolError>;
}
