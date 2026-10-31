//! Chemins fichiers (touchés / re-reads `file_read` / rotation multi-path).

use std::collections::{HashMap, VecDeque};

use drox_prompts::{
	REPEATED_FILE_READ_NUDGE_THRESHOLD, ROTATING_FILE_READ_MIN_DISTINCT_REPEATED,
	ROTATING_FILE_READ_MIN_READS, ROTATING_FILE_READ_REPEAT_AT, ROTATING_FILE_READ_WINDOW,
};
use serde_json::{json, Value};

/// Extrait un path utile depuis les args d'un outil mutateur fichier.
#[must_use]
pub(crate) fn path_from_file_tool(tool_name: &str, arguments: &serde_json::Value) -> Option<String> {
	let key = match tool_name {
		"file_write" | "file_edit" | "notebook_edit" | "delete_path" => "path",
		"copy_path" => "destination",
		_ => return None,
	};
	arguments
		.get(key)
		.and_then(|v| v.as_str())
		.map(|s| s.trim().to_string())
		.filter(|s| !s.is_empty())
}

/// Clé normalisée pour détecter les re-reads du même `file_read` path (P1).
#[must_use]
pub(crate) fn file_read_path_key(arguments: &serde_json::Value) -> Option<String> {
	let raw = arguments
		.get("path")
		.and_then(|v| v.as_str())
		.map(str::trim)
		.filter(|s| !s.is_empty())?;
	Some(normalize_path_key(raw))
}

#[must_use]
pub(crate) fn normalize_path_key(path: &str) -> String {
	path.replace('\\', "/").to_ascii_lowercase()
}

/// Incrémente le compteur de `file_read` réussis pour ce path. Retourne le total.
pub(crate) fn note_successful_file_read(
	counts: &mut HashMap<String, u32>,
	tool_name: &str,
	arguments: &serde_json::Value,
) -> u32 {
	if tool_name != "file_read" {
		return 0;
	}
	let Some(key) = file_read_path_key(arguments) else {
		return 0;
	};
	let entry = counts.entry(key).or_insert(0);
	*entry = entry.saturating_add(1);
	*entry
}

/// Un `file_write` / `file_edit` appliqué change le fichier : le prochain
/// `file_read` doit relire, pas renvoyer le stub « déjà lu ».
pub(crate) fn forget_file_read_after_mutation(
	counts: &mut HashMap<String, u32>,
	tool_name: &str,
	arguments: &serde_json::Value,
) {
	let Some(path) = path_from_file_tool(tool_name, arguments) else {
		return;
	};
	counts.remove(&normalize_path_key(&path));
}

/// Empile un `file_read` réussi dans la fenêtre glissante. Retourne `true` si
/// la fenêtre montre une **rotation** multi-path (angle mort anti-loop S1).
pub(crate) fn note_rotating_file_read(
	recent: &mut VecDeque<String>,
	tool_name: &str,
	arguments: &serde_json::Value,
) -> bool {
	if tool_name != "file_read" {
		return false;
	}
	let Some(key) = file_read_path_key(arguments) else {
		return false;
	};
	recent.push_back(key);
	while recent.len() > ROTATING_FILE_READ_WINDOW {
		recent.pop_front();
	}
	rotating_file_read_should_nudge(recent)
}

/// `true` si ≥ MIN_READS dans la fenêtre et ≥ MIN_DISTINCT paths chacun ≥ REPEAT_AT fois.
#[must_use]
pub(crate) fn rotating_file_read_should_nudge(recent: &VecDeque<String>) -> bool {
	if recent.len() < ROTATING_FILE_READ_MIN_READS {
		return false;
	}
	let mut counts: HashMap<&str, u32> = HashMap::new();
	for path in recent {
		*counts.entry(path.as_str()).or_insert(0) += 1;
	}
	let repeated_distinct = counts
		.values()
		.filter(|&&c| c >= ROTATING_FILE_READ_REPEAT_AT)
		.count();
	repeated_distinct >= ROTATING_FILE_READ_MIN_DISTINCT_REPEATED
}

/// Reset fenêtre après progrès (mutation / todo / Explore).
pub(crate) fn clear_rotating_file_read_window(recent: &mut VecDeque<String>) {
	recent.clear();
}

/// **R4** — déjà ≥ seuil de `file_read` réussis sur ce path → stub (pas de re-IO).
#[must_use]
pub(crate) fn should_stub_repeated_file_read(
	counts: &HashMap<String, u32>,
	tool_name: &str,
	arguments: &Value,
) -> Option<(String, u32)> {
	if tool_name != "file_read" {
		return None;
	}
	let key = file_read_path_key(arguments)?;
	let n = *counts.get(&key).unwrap_or(&0);
	if n >= REPEATED_FILE_READ_NUDGE_THRESHOLD {
		Some((key, n))
	} else {
		None
	}
}

/// Corps outil court : le path a déjà été livré N fois cette run.
#[must_use]
pub(crate) fn repeated_file_read_stub_value(path: &str, prior_reads: u32) -> Value {
	json!({
		"path": path,
		"truncated": false,
		"already_read": true,
		"prior_reads": prior_reads,
		"content": format!(
			"[already_read ×{prior_reads}] `{path}` was already `file_read` this run. \
			 This result is not the file and does not mean it is empty. \
			 Do not rewrite it because of this stub. Use the earlier file_read in the thread, \
			 or `grep` for a needle, then `file_edit`."
		),
	})
}
