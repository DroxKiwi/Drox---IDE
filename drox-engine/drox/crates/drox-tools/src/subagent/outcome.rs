//! Résultat structuré d'un Explore — rapport parent + télémétrie budget.

/// Sortie de [`super::SubagentExecutor::run_explore`].
#[derive(Debug, Clone)]
pub struct ExploreOutcome {
	/// Rapport parent-facing (Markdown structuré).
	pub report: String,
	/// `true` si la phase exécution a touché le plafond d'itérations.
	pub truncated: bool,
	/// Tours LLM consommés en phase 1 (estimation).
	pub iterations_used: usize,
	/// Budget phase 1 (après thoroughness).
	pub max_iterations: usize,
}
