//! C2 / V2-c — chemins déjà couverts par un Explore (artefacts `paths_read`).
//!
//! Après un `task`, on mémorise les paths disponibles (même si `truncated` — **D3**).
//! Si le parent refait un `file_read` sur l’un d’eux → Prefer soft (pas de hard gate).

use std::collections::HashSet;
use std::path::Path;

use serde_json::Value;
use tracing::debug;

use super::paths::{file_read_path_key, normalize_path_key};

/// Ensemble des paths Explore à ne pas re-lire en parent (sources).
#[derive(Debug, Default, Clone)]
pub(crate) struct ExploreCoveredPaths {
	keys: HashSet<String>,
}

impl ExploreCoveredPaths {
	#[must_use]
	pub(crate) fn len(&self) -> usize {
		self.keys.len()
	}

	/// Remplace l’ensemble à partir d’un outcome `task` (Explore complet).
	///
	/// Sources (dans l’ordre) : artefact `artifacts.paths_read` sur disque,
	/// `artifacts_inline.paths_read`, sinon section `## paths_read` du `report` wire.
	pub(crate) fn ingest_from_task_outcome(
		&mut self,
		value: &Value,
		workspace_root: &Path,
	) -> usize {
		self.keys.clear();
		for path in extract_paths_from_task_outcome(value, workspace_root) {
			self.keys.insert(normalize_path_key(&path));
		}
		debug!(
			marker = "c2.explore_paths_tracked",
			n = self.keys.len(),
			"dogfood: Explore covered paths loaded for prefer"
		);
		self.keys.len()
	}

	/// **D3** — Explore tronqué : ajoute les paths trouvés **sans** vider l’ensemble
	/// (conserve la couverture d’un Explore précédent si l’outcome est vide).
	///
	/// Retourne le nombre de clés **nouvelles** insérées.
	pub(crate) fn merge_from_task_outcome(
		&mut self,
		value: &Value,
		workspace_root: &Path,
	) -> usize {
		let mut added = 0usize;
		for path in extract_paths_from_task_outcome(value, workspace_root) {
			if self.keys.insert(normalize_path_key(&path)) {
				added = added.saturating_add(1);
			}
		}
		if added > 0 {
			debug!(
				marker = "c2.explore_paths_tracked",
				n = self.keys.len(),
				added,
				"dogfood: Explore covered paths merged (truncated task)"
			);
		}
		added
	}

	/// `Some(path_key)` si ce `file_read` retombe sur un path déjà couvert.
	#[must_use]
	pub(crate) fn hit_by_file_read(&self, tool_name: &str, arguments: &Value) -> Option<String> {
		if tool_name != "file_read" || self.keys.is_empty() {
			return None;
		}
		let key = file_read_path_key(arguments)?;
		if self.keys.contains(&key) {
			Some(key)
		} else {
			None
		}
	}
}

/// Corps `paths_read` depuis artefacts / inline / report.
fn extract_paths_from_task_outcome(value: &Value, workspace_root: &Path) -> Vec<String> {
	let mut raw = String::new();
	if let Some(rel) = value
		.get("artifacts")
		.and_then(|a| a.get("paths_read"))
		.and_then(|v| v.as_str())
	{
		let abs = workspace_root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
		if let Ok(text) = std::fs::read_to_string(&abs) {
			raw = text;
		}
	}
	if raw.trim().is_empty() {
		if let Some(inline) = value
			.get("artifacts_inline")
			.and_then(|a| a.get("paths_read"))
			.and_then(|v| v.as_str())
		{
			raw = inline.to_string();
		}
	}
	if raw.trim().is_empty() {
		if let Some(report) = value.get("report").and_then(|v| v.as_str()) {
			raw = extract_paths_read_section(report).unwrap_or_default();
		}
	}
	parse_path_lines(&raw)
}

/// Extrait le corps sous `## paths_read` (jusqu’au prochain `## `).
#[must_use]
pub(crate) fn extract_paths_read_section(markdown: &str) -> Option<String> {
	let lower = markdown.to_ascii_lowercase();
	let marker = "## paths_read";
	let start = lower.find(marker)?;
	let after = &markdown[start + marker.len()..];
	let end = after.find("\n## ").unwrap_or(after.len());
	Some(after[..end].to_string())
}

/// Lignes path depuis un artefact / section (bullets `- path`, backticks, lignes nues).
#[must_use]
pub(crate) fn parse_path_lines(body: &str) -> Vec<String> {
	let mut out = Vec::new();
	for line in body.lines() {
		let t = line.trim();
		if t.is_empty() || t.starts_with('#') {
			continue;
		}
		let mut s = t.trim_start_matches(['-', '*', '+']).trim();
		if s.is_empty() {
			continue;
		}
		// Ignore placeholders / stubs.
		let lower = s.to_ascii_lowercase();
		if lower == "none"
			|| lower == "tbd"
			|| lower == "n/a"
			|| lower.starts_with("(incomplete")
			|| lower.starts_with("list of paths")
		{
			continue;
		}
		if s.starts_with('`') && s.ends_with('`') && s.len() >= 2 {
			s = s[1..s.len() - 1].trim();
		}
		// Prend le premier token path-like.
		let candidate = s.split_whitespace().next().unwrap_or(s).trim_matches(',');
		if candidate.len() < 2 {
			continue;
		}
		if !looks_like_path(candidate) {
			continue;
		}
		out.push(candidate.to_string());
	}
	out
}

fn looks_like_path(s: &str) -> bool {
	s.contains('/')
		|| s.contains('\\')
		|| s.contains('.')
		|| s.ends_with(".ts")
		|| s.ends_with(".md")
		|| s.ends_with(".rs")
}

#[cfg(test)]
mod tests {
	use super::*;
	use serde_json::json;
	use std::fs;

	#[test]
	fn parse_bullets_and_skip_stubs() {
		let body = "\
- `src/a.ts`\n\
- docs/b.md\n\
- TBD\n\
- none\n\
plain/c.rs\n";
		let paths = parse_path_lines(body);
		assert_eq!(paths, vec!["src/a.ts", "docs/b.md", "plain/c.rs"]);
	}

	#[test]
	fn extract_section_stops_at_next_header() {
		let md = "## paths_read\n- a.ts\n\n## gaps\nnone\n";
		let sec = extract_paths_read_section(md).unwrap();
		assert!(sec.contains("a.ts"));
		assert!(!sec.contains("gaps"));
	}

	#[test]
	fn ingest_from_artifact_file() {
		let dir = tempfile::tempdir().unwrap();
		let art = dir.path().join("paths_read.md");
		fs::write(&art, "- src/layout.tsx\n- src/sidebar.tsx\n").unwrap();
		let value = json!({
			"truncated": false,
			"kinds_incomplete": [],
			"artifacts": { "paths_read": "paths_read.md" }
		});
		let mut covered = ExploreCoveredPaths::default();
		assert_eq!(covered.ingest_from_task_outcome(&value, dir.path()), 2);
		assert_eq!(
			covered.hit_by_file_read("file_read", &json!({ "path": "src/Layout.tsx" })),
			Some("src/layout.tsx".into())
		);
		assert!(covered
			.hit_by_file_read("file_read", &json!({ "path": "other.ts" }))
			.is_none());
	}

	#[test]
	fn ingest_from_report_fallback() {
		let dir = tempfile::tempdir().unwrap();
		let value = json!({
			"report": "## paths_read\n- only/from/report.ts\n\n## gaps\nok\n"
		});
		let mut covered = ExploreCoveredPaths::default();
		assert_eq!(covered.ingest_from_task_outcome(&value, dir.path()), 1);
		assert!(covered
			.hit_by_file_read(
				"file_read",
				&json!({ "path": "only/from/report.ts" })
			)
			.is_some());
	}

	#[test]
	fn ingest_from_artifacts_inline() {
		let dir = tempfile::tempdir().unwrap();
		let value = json!({
			"truncated": true,
			"artifacts_inline": { "paths_read": "- inline/a.ts\n- inline/b.md\n" }
		});
		let mut covered = ExploreCoveredPaths::default();
		assert_eq!(covered.ingest_from_task_outcome(&value, dir.path()), 2);
		assert!(covered
			.hit_by_file_read("file_read", &json!({ "path": "inline/a.ts" }))
			.is_some());
	}

	#[test]
	fn merge_truncated_keeps_prior_when_empty() {
		let dir = tempfile::tempdir().unwrap();
		let mut covered = ExploreCoveredPaths::default();
		let first = json!({
			"artifacts_inline": { "paths_read": "- keep/me.ts\n" }
		});
		assert_eq!(covered.ingest_from_task_outcome(&first, dir.path()), 1);
		let empty_truncated = json!({
			"truncated": true,
			"artifacts_inline": {},
			"kinds_incomplete": ["paths_read"]
		});
		assert_eq!(covered.merge_from_task_outcome(&empty_truncated, dir.path()), 0);
		assert_eq!(covered.len(), 1);
		assert!(covered
			.hit_by_file_read("file_read", &json!({ "path": "keep/me.ts" }))
			.is_some());
	}

	#[test]
	fn merge_truncated_adds_without_clearing() {
		let dir = tempfile::tempdir().unwrap();
		let mut covered = ExploreCoveredPaths::default();
		let first = json!({
			"artifacts_inline": { "paths_read": "- old/a.ts\n" }
		});
		assert_eq!(covered.ingest_from_task_outcome(&first, dir.path()), 1);
		let more = json!({
			"truncated": true,
			"artifacts_inline": { "paths_read": "- old/a.ts\n- new/b.ts\n" }
		});
		assert_eq!(covered.merge_from_task_outcome(&more, dir.path()), 1);
		assert_eq!(covered.len(), 2);
	}
}
