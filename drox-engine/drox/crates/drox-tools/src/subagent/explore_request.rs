//! Brief structuré passé à [`super::SubagentExecutor::run_explore`].

use super::return_kinds::{ExploreReturnKind, ExploreReturnOptions};

/// Entrée d'un Explore (contrat parent → enfant).
#[derive(Debug, Clone)]
pub struct ExploreRequest {
	pub description: String,
	pub thoroughness: Option<String>,
	pub title: Option<String>,
	pub plan_step_id: Option<String>,
	pub must_return: Vec<String>,
	pub return_kinds: Vec<ExploreReturnKind>,
	pub return_options: ExploreReturnOptions,
}
