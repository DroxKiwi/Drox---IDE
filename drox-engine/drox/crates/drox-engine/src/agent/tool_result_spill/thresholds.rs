//! Seuils et classification outils pour le spill.

/// Seuil par défaut (bash, outils divers) — Vague 4 / T-1.
pub(crate) const TOOL_RESULT_SPILL_THRESHOLD_BYTES: usize = 24 * 1024;

/// Seuil plus bas pour les dumps lecture (C1).
pub(crate) const READ_HEAVY_SPILL_THRESHOLD_BYTES: usize = 8 * 1024;

/// **F1** — livraison Explore : garder inline jusqu’à ce plafond.
///
/// `explore_artifact_read` était en read-heavy (8 KiB) → spillait le kind
/// utile juste après lecture. `task` slim + `artifacts_inline` peut dépasser
/// 24 KiB avec plusieurs kinds.
pub(crate) const EXPLORE_DELIVERY_SPILL_THRESHOLD_BYTES: usize = 64 * 1024;

/// Preview collé dans un stub spill générique.
pub(super) const TOOL_RESULT_PREVIEW_BYTES: usize = 512;

/// Paquet merge / kind Explore — ne pas traiter comme dump `file_read`.
#[must_use]
pub(super) fn is_explore_delivery_tool(tool_name: &str) -> bool {
	matches!(tool_name, "task" | "explore_artifact_read")
}

/// Outils dont la sortie est typiquement un dump texte / liste.
///
/// **F1** : `explore_artifact_read` retiré (seuil Explore delivery).
#[must_use]
fn is_read_heavy_tool(tool_name: &str) -> bool {
	matches!(
		tool_name,
		"file_read" | "grep" | "glob" | "explore_index_list" | "explore_index_search" | "notebook_read"
	)
}

/// Seuil spill selon l’outil.
#[must_use]
pub(crate) fn spill_threshold_for_tool(tool_name: &str) -> usize {
	if is_explore_delivery_tool(tool_name) {
		EXPLORE_DELIVERY_SPILL_THRESHOLD_BYTES
	} else if is_read_heavy_tool(tool_name) {
		READ_HEAVY_SPILL_THRESHOLD_BYTES
	} else {
		TOOL_RESULT_SPILL_THRESHOLD_BYTES
	}
}

/// Déjà un stub spill (émission ou snip précédent) — ne pas réécrire le blob.
#[must_use]
pub(crate) fn looks_like_spill_stub(content: &str) -> bool {
	content.contains("LARGE OUTPUT SPILLED TO DISK")
		|| content.contains(".drox/tool-outputs/")
		|| content.contains("SPILLED FOR CONTEXT")
		|| content.contains("EXPLORE MERGE PRESERVED")
}

/// Extrait le nom d’outil depuis l’en-tête `[drox: tool result for «name» …]`.
#[must_use]
pub(super) fn tool_name_from_llm_wrapper(content: &str) -> Option<&str> {
	let start = content.find('«')? + '«'.len_utf8();
	let end = content[start..].find('»')? + start;
	Some(&content[start..end])
}
