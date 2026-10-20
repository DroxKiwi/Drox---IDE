//! C2 / V2-c — chemins déjà couverts par un Explore.
//!
//! Après un `task`, on mémorise :
//! - sources listées dans `paths_read` (fichier / inline / report) — **D3** si truncated ;
//! - chemins des **fichiers kind** (`artifacts.*`) — **E1** (anti relecture blobs Explore).
//! Si le parent `file_read` l’un d’eux → Prefer soft (pas de hard gate).
//! Hit **kind** → Prefer act immédiat (**E2b**, 2026-10-12).

use std::collections::HashSet;
use std::path::Path;

use serde_json::Value;
use tracing::debug;

use super::paths::{file_read_path_key, normalize_path_key};

/// Nature du path couvert touché par un `file_read` parent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum CoveredHit {
	/// Source listée dans `paths_read`.
	Source(String),
	/// Fichier kind sous `.drox/subagents/…` (`artifacts.*`).
	Kind(String),
}

impl CoveredHit {
	#[must_use]
	pub(crate) fn path(&self) -> &str {
		match self {
			Self::Source(p) | Self::Kind(p) => p.as_str(),
		}
	}

	#[must_use]
	pub(crate) fn is_kind(&self) -> bool {
		matches!(self, Self::Kind(_))
	}
}

/// Ensemble des paths Explore à ne pas re-lire en parent.
#[derive(Debug, Default, Clone)]
pub(crate) struct ExploreCoveredPaths {
	keys: HashSet<String>,
	/// Sous-ensemble : fichiers kind (`artifacts` map) — Prefer act dès 1er hit.
	kind_keys: HashSet<String>,
}

impl ExploreCoveredPaths {
	#[must_use]
	pub(crate) fn len(&self) -> usize {
		self.keys.len()
	}

	/// Remplace l’ensemble à partir d’un outcome `task` (Explore complet).
	///
	/// Inclut sources `paths_read` **et** chemins des fichiers kind (`artifacts`).
	pub(crate) fn ingest_from_task_outcome(
		&mut self,
		value: &Value,
		workspace_root: &Path,
	) -> usize {
		self.keys.clear();
		self.kind_keys.clear();
		for path in extract_artifact_file_paths(value) {
			let key = normalize_path_key(&path);
			self.kind_keys.insert(key.clone());
			self.keys.insert(key);
		}
		for path in extract_source_paths_from_task_outcome(value, workspace_root) {
			self.keys.insert(normalize_path_key(&path));
		}
		debug!(
			marker = "c2.explore_paths_tracked",
			n = self.keys.len(),
			kind_n = self.kind_keys.len(),
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
		for path in extract_artifact_file_paths(value) {
			let key = normalize_path_key(&path);
			self.kind_keys.insert(key.clone());
			if self.keys.insert(key) {
				added = added.saturating_add(1);
			}
		}
		for path in extract_source_paths_from_task_outcome(value, workspace_root) {
			if self.keys.insert(normalize_path_key(&path)) {
				added = added.saturating_add(1);
			}
		}
		if added > 0 {
			debug!(
				marker = "c2.explore_paths_tracked",
				n = self.keys.len(),
				kind_n = self.kind_keys.len(),
				added,
				"dogfood: Explore covered paths merged (truncated task)"
			);
		}
		added
	}

	/// Hit source ou kind si ce `file_read` retombe sur un path couvert.
	///
	/// Heuristique : tout path sous `.drox/subagents/` compte comme **kind**
	/// (même hors set — ex. after orphan `explore_artifact_read`).
	#[must_use]
	pub(crate) fn hit_by_file_read(
		&self,
		tool_name: &str,
		arguments: &Value,
	) -> Option<CoveredHit> {
		if tool_name != "file_read" {
			return None;
		}
		let key = file_read_path_key(arguments)?;
		if self.kind_keys.contains(&key) || looks_like_explore_kind_path(&key) {
			return Some(CoveredHit::Kind(key));
		}
		if self.keys.contains(&key) {
			return Some(CoveredHit::Source(key));
		}
		None
	}
}

#[must_use]
fn looks_like_explore_kind_path(key: &str) -> bool {
	let lower = key.to_ascii_lowercase().replace('\\', "/");
	lower.contains(".drox/subagents/")
}

/// Sources listées dans `paths_read` (fichier / inline / report) — hors kinds.
fn extract_source_paths_from_task_outcome(value: &Value, workspace_root: &Path) -> Vec<String> {
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

/// Chemins relatifs workspace des artefacts kind (`artifacts` object values).
fn extract_artifact_file_paths(value: &Value) -> Vec<String> {
	let Some(obj) = value.get("artifacts").and_then(|a| a.as_object()) else {
		return Vec::new();
	};
	let mut out = Vec::new();
	for (_kind, v) in obj {
		if let Some(p) = v.as_str().map(str::trim).filter(|s| !s.is_empty()) {
			out.push(p.to_string());
		}
	}
	out
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
		// E1 : fichier kind `paths_read.md` + 2 sources listées.
		assert_eq!(covered.ingest_from_task_outcome(&value, dir.path()), 3);
		assert_eq!(
			covered.hit_by_file_read("file_read", &json!({ "path": "src/Layout.tsx" })),
			Some(CoveredHit::Source("src/layout.tsx".into()))
		);
		assert!(matches!(
			covered.hit_by_file_read("file_read", &json!({ "path": "paths_read.md" })),
			Some(CoveredHit::Kind(_))
		));
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
		assert!(matches!(
			covered.hit_by_file_read(
				"file_read",
				&json!({ "path": "only/from/report.ts" })
			),
			Some(CoveredHit::Source(_))
		));
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
		assert!(matches!(
			covered.hit_by_file_read("file_read", &json!({ "path": "inline/a.ts" })),
			Some(CoveredHit::Source(_))
		));
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
		assert!(matches!(
			covered.hit_by_file_read("file_read", &json!({ "path": "keep/me.ts" })),
			Some(CoveredHit::Source(_))
		));
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

	#[test]
	fn ingest_tracks_artifact_kind_files_e1() {
		let dir = tempfile::tempdir().unwrap();
		let value = json!({
			"truncated": false,
			"artifacts": {
				"file_summaries": ".drox/subagents/ses_x/exp_y/file_summaries.md",
				"structure_map": ".drox/subagents/ses_x/exp_y/structure_map.md"
			},
			"artifacts_inline": {}
		});
		let mut covered = ExploreCoveredPaths::default();
		assert_eq!(covered.ingest_from_task_outcome(&value, dir.path()), 2);
		assert!(matches!(
			covered.hit_by_file_read(
				"file_read",
				&json!({ "path": ".drox/subagents/ses_x/exp_y/file_summaries.md" })
			),
			Some(CoveredHit::Kind(_))
		));
		assert!(matches!(
			covered.hit_by_file_read(
				"file_read",
				&json!({ "path": ".drox/subagents/ses_x/exp_y/structure_map.md" })
			),
			Some(CoveredHit::Kind(_))
		));
	}

	#[test]
	fn heuristic_subagents_path_is_kind_even_without_ingest() {
		let covered = ExploreCoveredPaths::default();
		assert!(matches!(
			covered.hit_by_file_read(
				"file_read",
				&json!({ "path": ".drox/subagents/ses_z/exp_z/gaps.md" })
			),
			Some(CoveredHit::Kind(_))
		));
	}
}
