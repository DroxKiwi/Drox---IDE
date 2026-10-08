//! Chemins fichiers (touchés / re-reads `file_read` / rotation multi-path).

use std::collections::{HashMap, VecDeque};

use drox_prompts::{
	ROTATING_FILE_READ_MIN_DISTINCT_REPEATED, ROTATING_FILE_READ_MIN_READS,
	ROTATING_FILE_READ_REPEAT_AT, ROTATING_FILE_READ_WINDOW,
};

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
