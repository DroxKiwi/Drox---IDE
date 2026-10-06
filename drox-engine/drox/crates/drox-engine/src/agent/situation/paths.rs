//! Chemins fichiers (touchés / re-reads `file_read`).

use std::collections::HashMap;

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
