//! Résultat structuré d'un Explore — rapport parent + télémétrie + artefacts.

use std::collections::BTreeMap;

/// Sortie de [`super::SubagentExecutor::run_explore`].
#[derive(Debug, Clone)]
pub struct ExploreOutcome {
	/// Id stable de cet Explore (index session).
	pub explore_id: String,
	/// Rapport parent-facing (Markdown structuré) — aussi écrit sur disque.
	pub report: String,
	/// Chemin relatif workspace vers `conclusion.md` (si écriture OK).
	pub report_path: Option<String>,
	/// Résumé court pour le parent (inline) ; le détail est dans `report_path` / artefacts.
	pub summary: String,
	/// Blurb index (~200 chars) pour navigation.
	pub blurb: String,
	/// `kind` → chemin relatif workspace de l'artefact.
	pub artifacts: BTreeMap<String, String>,
	/// Kinds demandés absents ou vides.
	pub kinds_incomplete: Vec<String>,
	/// `true` si la phase exécution a touché le plafond d'itérations **ou** kinds incomplets.
	pub truncated: bool,
	/// Tours LLM consommés en phase 1 (estimation).
	pub iterations_used: usize,
	/// Budget phase 1 (après thoroughness).
	pub max_iterations: usize,
}
