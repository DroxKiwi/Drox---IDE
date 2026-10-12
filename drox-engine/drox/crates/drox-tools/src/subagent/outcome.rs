//! Résultat structuré d'un Explore — rapport parent + télémétrie + artefacts.

use std::collections::BTreeMap;

/// Sortie de [`super::SubagentExecutor::run_explore`].
#[derive(Debug, Clone)]
pub struct ExploreOutcome {
	/// Id stable de cet Explore (index session).
	pub explore_id: String,
	/// Markdown kinds assemblé (mémoire / UI optionnelle) — **pas** écrit en `conclusion.md`.
	pub report: String,
	/// Legacy : toujours `None` (plus de `conclusion.md`). Détail = `artifacts` / `artifacts_inline`.
	pub report_path: Option<String>,
	/// Résumé court pour le parent (inline).
	pub summary: String,
	/// Blurb index (~200 chars) pour navigation.
	pub blurb: String,
	/// `kind` → chemin relatif workspace de l'artefact.
	pub artifacts: BTreeMap<String, String>,
	/// Corps kinds bornés injectés au parent (merge one-shot, anti re-read).
	pub artifacts_inline: BTreeMap<String, String>,
	/// Kinds demandés absents ou vides.
	pub kinds_incomplete: Vec<String>,
	/// `true` si la phase exécution a touché le plafond d'itérations **ou** kinds incomplets.
	pub truncated: bool,
	/// Manifest / wire : `ok` | `partial` (livrable vide — D2) | `truncated_exec` | `kinds_incomplete`.
	pub status: String,
	/// Tours LLM consommés en phase 1 (estimation).
	pub iterations_used: usize,
	/// Budget phase 1 (après thoroughness).
	pub max_iterations: usize,
}
