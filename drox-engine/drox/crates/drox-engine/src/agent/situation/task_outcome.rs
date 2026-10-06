//! Résultat `task` / Explore + détection lectures parent lourdes (S-5).

/// Applique le résultat d'un `task` réussi : reset streak si OK, sinon filet truncated.
pub(crate) fn note_task_tool_success(
	truncated: bool,
	iterations_used: u64,
	max_iterations: u64,
	parent_heavy_read_streak: &mut u32,
	pending_explore_incomplete: &mut Option<(u64, u64)>,
	explore_rescue_active: &mut bool,
	explore_rescue_nudge_sent: &mut bool,
) {
	if truncated {
		*pending_explore_incomplete = Some((iterations_used, max_iterations));
		*explore_rescue_active = true;
		*explore_rescue_nudge_sent = false;
		// Ne pas reset le streak — le parent ne doit pas « sauver » en lisant.
	} else {
		*parent_heavy_read_streak = 0;
		*pending_explore_incomplete = None;
		*explore_rescue_active = false;
		*explore_rescue_nudge_sent = false;
	}
}

/// Lit les champs télémétrie Explore depuis la sortie `task` (avant move du Value).
#[must_use]
pub(crate) fn task_outcome_telemetry(value: &serde_json::Value) -> (bool, u64, u64) {
	let truncated = value
		.get("truncated")
		.and_then(|v| v.as_bool())
		.unwrap_or(false);
	let used = value
		.get("iterations_used")
		.and_then(|v| v.as_u64())
		.unwrap_or(0);
	let max_it = value
		.get("max_iterations")
		.and_then(|v| v.as_u64())
		.unwrap_or(0);
	(truncated, used, max_it)
}

/// `true` si l'appel parent risque de saturer le contexte (S-5).
///
/// Compte aussi les `file_read` **bornés** : une série de lectures ciblées
/// pour comprendre / synthétiser un sujet doit déclencher Explore, pas seulement
/// les dumps unbounded / `Get-Content`.
#[must_use]
pub(crate) fn counts_as_parent_heavy_read(tool_name: &str, arguments: &serde_json::Value) -> bool {
	match tool_name {
		"task" => false,
		// Cartographier / balayer un arbre docs en parent compte comme lecture lourde :
		// S-5 pousse Explore dès le 1er tour d'exploration multi-fichier.
		"file_read" | "glob" | "grep" => true,
		"bash" => {
			let cmd = arguments
				.get("command")
				.and_then(|v| v.as_str())
				.unwrap_or("")
				.to_ascii_lowercase();
			cmd.contains("get-content")
				|| cmd.contains("get_content")
				|| cmd.split_whitespace().any(|t| t == "cat" || t == "type")
		}
		_ => false,
	}
}
