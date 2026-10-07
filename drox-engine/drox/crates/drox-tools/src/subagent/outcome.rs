//! Résultat structuré d'un Explore — rapport parent + télémétrie budget.

/// Sortie de [`super::SubagentExecutor::run_explore`].
#[derive(Debug, Clone)]
pub struct ExploreOutcome {
	/// Rapport parent-facing (Markdown structuré) — aussi écrit sur disque.
	pub report: String,
	/// Chemin relatif workspace vers `conclusion.md` (si écriture OK).
	pub report_path: Option<String>,
	/// Résumé court pour le parent (inline) ; le détail est dans `report_path`.
	pub summary: String,
	/// `true` si la phase exécution a touché le plafond d'itérations.
	pub truncated: bool,
	/// Tours LLM consommés en phase 1 (estimation).
	pub iterations_used: usize,
	/// Budget phase 1 (après thoroughness).
	pub max_iterations: usize,
}
