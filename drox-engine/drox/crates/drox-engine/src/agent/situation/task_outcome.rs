//! Résultat `task` / Explore + détection lectures parent lourdes (S-5).

use serde_json::Value;

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
pub(crate) fn task_outcome_telemetry(value: &Value) -> (bool, u64, u64) {
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

/// **D2** — livrable Explore inutilisable (pas de merge / pas de step-complete).
///
/// `status == "partial"`, ou truncated + `artifacts_inline` vide + `kinds_incomplete` non vide.
#[must_use]
pub(crate) fn explore_deliverable_empty(value: &Value) -> bool {
	if value.get("status").and_then(|v| v.as_str()) == Some("partial") {
		return true;
	}
	let truncated = value
		.get("truncated")
		.and_then(|v| v.as_bool())
		.unwrap_or(false);
	if !truncated {
		return false;
	}
	let inline_empty = match value.get("artifacts_inline") {
		None => true,
		Some(Value::Object(map)) => map.is_empty(),
		Some(_) => true,
	};
	let incomplete = value
		.get("kinds_incomplete")
		.and_then(|v| v.as_array())
		.map(|a| !a.is_empty())
		.unwrap_or(false);
	inline_empty && incomplete
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

#[cfg(test)]
mod tests {
	use super::*;
	use serde_json::json;

	#[test]
	fn empty_via_status_partial() {
		assert!(explore_deliverable_empty(&json!({
			"status": "partial",
			"truncated": true,
			"artifacts_inline": {},
			"kinds_incomplete": ["paths_read"]
		})));
	}

	#[test]
	fn empty_via_truncated_inline_incomplete() {
		assert!(explore_deliverable_empty(&json!({
			"truncated": true,
			"artifacts_inline": {},
			"kinds_incomplete": ["gaps"]
		})));
		assert!(!explore_deliverable_empty(&json!({
			"truncated": true,
			"status": "kinds_incomplete",
			"artifacts_inline": { "paths_read": "- a.ts" },
			"kinds_incomplete": ["gaps"]
		})));
		assert!(!explore_deliverable_empty(&json!({
			"truncated": false,
			"artifacts_inline": { "gaps": "x" },
			"kinds_incomplete": []
		})));
	}
}
