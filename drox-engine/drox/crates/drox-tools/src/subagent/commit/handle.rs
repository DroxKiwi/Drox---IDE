//! Handle partagé enfant Explore ↔ moteur (commits kinds + évidence L0).

use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex};

use super::evidence::EvidencePath;
use crate::subagent::return_kinds::ExploreReturnKind;

/// Borne dure du corps d’un commit (anti-flood).
pub const MAX_COMMIT_BODY_CHARS: usize = 12_000;

/// Refuse un `body` multi-kind / CoT / essay opener (dogfood : même jet collé sur chaque kind).
#[must_use]
pub fn validate_mono_kind_body(kind: ExploreReturnKind, body: &str) -> Result<(), String> {
	let key = kind.as_str();
	let lower = body.to_ascii_lowercase();
	for marker in [
		"</think>",
		"<think>",
		"<|redacted_thinking|>",
		"</redacted_thinking>",
	] {
		if lower.contains(&marker.to_ascii_lowercase()) {
			return Err(format!(
				"body for `{key}` must be mono-kind facts only — found chain-of-thought / think tag. \
				 Strip reasoning; commit only the bullets/paths for this kind."
			));
		}
	}
	let trimmed_start = body.trim_start();
	let start_l = trimmed_start.to_ascii_lowercase();
	for opener in ["let me ", "i'll ", "i will ", "okay, ", "ok, let "] {
		if start_l.starts_with(opener) {
			let shown = opener.trim();
			return Err(format!(
				"body for `{key}` must be mono-kind facts only — essay/CoT opener `{shown}…`. \
				 Start with paths, bullets, or short facts for this kind."
			));
		}
	}
	for other in ExploreReturnKind::all() {
		if *other == kind {
			continue;
		}
		if body_has_kind_heading(body, other.as_str()) {
			return Err(format!(
				"body for `{key}` must be mono-kind — found heading for `{}`. \
				 Call explore_commit once per kind with only that kind’s facts \
				 (no `## <other_kind>` sections inside body).",
				other.as_str()
			));
		}
	}
	Ok(())
}

/// `#{1,6} <kind>` en début de ligne (case-insensitive).
fn body_has_kind_heading(body: &str, kind_name: &str) -> bool {
	let needle = kind_name.to_ascii_lowercase();
	for line in body.lines() {
		let t = line.trim_start();
		if !t.starts_with('#') {
			continue;
		}
		let after_hash = t.trim_start_matches('#').trim_start();
		let after_l = after_hash.to_ascii_lowercase();
		if after_l == needle
			|| after_l.starts_with(&format!("{needle} "))
			|| after_l.starts_with(&format!("{needle}\t"))
		{
			return true;
		}
	}
	false
}

#[derive(Debug, Clone, Default)]
struct Inner {
	/// Kinds demandés par le parent (ordre conservé).
	requested: Vec<ExploreReturnKind>,
	/// Corps commités via `explore_commit` (dernier replace / appends).
	bodies: BTreeMap<String, String>,
	/// Paths vus via tools lecture (ordre d’apparition).
	evidence_paths: Vec<EvidencePath>,
	/// Dedup paths (normalized).
	seen_paths: BTreeSet<String>,
}

/// Snapshot pour assemble (phase post-exec).
#[derive(Debug, Clone)]
pub struct ExploreCommitSnapshot {
	pub requested: Vec<ExploreReturnKind>,
	pub bodies: BTreeMap<String, String>,
	pub evidence_paths: Vec<EvidencePath>,
}

/// Stock thread-safe des commits + évidence d’un run Explore.
#[derive(Clone, Default)]
pub struct ExploreCommitHandle {
	inner: Arc<Mutex<Inner>>,
}

impl ExploreCommitHandle {
	#[must_use]
	pub fn new(requested: Vec<ExploreReturnKind>) -> Self {
		Self {
			inner: Arc::new(Mutex::new(Inner {
				requested,
				..Inner::default()
			})),
		}
	}

	#[must_use]
	pub fn requested(&self) -> Vec<ExploreReturnKind> {
		self.inner
			.lock()
			.map(|g| g.requested.clone())
			.unwrap_or_default()
	}

	/// Enregistre un path d’évidence (L0). Ignore vide / doublon.
	pub fn push_evidence_path(&self, path: impl Into<String>, source: &str) {
		let path = path.into();
		let trimmed = path.trim();
		if trimmed.is_empty() {
			return;
		}
		let key = trimmed.replace('\\', "/").to_ascii_lowercase();
		let Ok(mut g) = self.inner.lock() else {
			return;
		};
		if g.seen_paths.insert(key) {
			g.evidence_paths.push(EvidencePath {
				path: trimmed.to_string(),
				source: source.to_string(),
			});
		}
	}

	/// Commit / append un kind. `append` = true → concatène.
	pub fn commit(
		&self,
		kind: ExploreReturnKind,
		body: String,
		append: bool,
	) -> Result<(usize, usize), String> {
		let body = body.trim().to_string();
		if body.is_empty() {
			return Err("body is empty after trim".into());
		}
		if body.chars().count() > MAX_COMMIT_BODY_CHARS {
			return Err(format!(
				"body too long ({} chars, max {MAX_COMMIT_BODY_CHARS})",
				body.chars().count()
			));
		}
		validate_mono_kind_body(kind, &body)?;
		let key = kind.as_str().to_string();
		let mut g = self
			.inner
			.lock()
			.map_err(|_| "explore commit mutex poisoned".to_string())?;
		if !g.requested.is_empty() && !g.requested.contains(&kind) {
			return Err(format!(
				"kind `{key}` was not requested by the parent (requested: {})",
				g.requested
					.iter()
					.map(|k| k.as_str())
					.collect::<Vec<_>>()
					.join(", ")
			));
		}
		if append {
			if let Some(existing) = g.bodies.get_mut(&key) {
				if !existing.is_empty() {
					existing.push_str("\n\n");
				}
				existing.push_str(&body);
				if existing.chars().count() > MAX_COMMIT_BODY_CHARS {
					// Truncate to max.
					let clipped: String = existing.chars().take(MAX_COMMIT_BODY_CHARS).collect();
					*existing = clipped;
				}
			} else {
				g.bodies.insert(key.clone(), body);
			}
		} else {
			g.bodies.insert(key.clone(), body);
		}
		let body_len = g.bodies.get(&key).map(|s| s.chars().count()).unwrap_or(0);
		let kinds_committed = g.bodies.len();
		Ok((body_len, kinds_committed))
	}

	#[must_use]
	pub fn snapshot(&self) -> ExploreCommitSnapshot {
		let g = self.inner.lock().ok();
		ExploreCommitSnapshot {
			requested: g.as_ref().map(|x| x.requested.clone()).unwrap_or_default(),
			bodies: g.as_ref().map(|x| x.bodies.clone()).unwrap_or_default(),
			evidence_paths: g
				.as_ref()
				.map(|x| x.evidence_paths.clone())
				.unwrap_or_default(),
		}
	}

	/// Corps markdown `paths_read` dérivé du journal L0 (0 LLM).
	#[must_use]
	pub fn auto_paths_read_body(&self) -> Option<String> {
		let snap = self.snapshot();
		if snap.evidence_paths.is_empty() {
			return None;
		}
		let mut lines = Vec::with_capacity(snap.evidence_paths.len() + 1);
		lines.push(format!(
			"Paths observed via tools (engine L0, {} unique):",
			snap.evidence_paths.len()
		));
		for ep in &snap.evidence_paths {
			lines.push(format!("- {} ({})", ep.path, ep.source));
		}
		Some(lines.join("\n"))
	}

	/// Map kind → body pour assemble : commits + L0 `paths_read` si manquant.
	#[must_use]
	pub fn kind_map_for_assemble(&self) -> BTreeMap<String, String> {
		let snap = self.snapshot();
		let mut map = snap.bodies;
		let wants_paths = snap.requested.is_empty()
			|| snap
				.requested
				.iter()
				.any(|k| *k == ExploreReturnKind::PathsRead);
		if wants_paths {
			let key = ExploreReturnKind::PathsRead.as_str();
			let usable = map
				.get(key)
				.map(|b| !b.trim().is_empty())
				.unwrap_or(false);
			if !usable {
				if let Some(auto) = self.auto_paths_read_body() {
					map.insert(key.to_string(), auto);
				}
			}
		}
		map
	}
}

impl std::fmt::Debug for ExploreCommitHandle {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		let snap = self.snapshot();
		f.debug_struct("ExploreCommitHandle")
			.field("requested", &snap.requested.len())
			.field("committed", &snap.bodies.len())
			.field("evidence", &snap.evidence_paths.len())
			.finish()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn commit_replace_and_append() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::Gaps]);
		h.commit(ExploreReturnKind::Gaps, "a".into(), false).unwrap();
		h.commit(ExploreReturnKind::Gaps, "b".into(), true).unwrap();
		let snap = h.snapshot();
		assert!(snap.bodies["gaps"].contains("a"));
		assert!(snap.bodies["gaps"].contains("b"));
	}

	#[test]
	fn rejects_unrequested_kind() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::Gaps]);
		let err = h
			.commit(ExploreReturnKind::PathsRead, "x".into(), false)
			.unwrap_err();
		assert!(err.contains("not requested"));
	}

	#[test]
	fn auto_paths_from_evidence() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::PathsRead]);
		h.push_evidence_path("src/a.ts", "file_read");
		h.push_evidence_path("src/a.ts", "file_read"); // dedup
		h.push_evidence_path("src/b.ts", "glob");
		let map = h.kind_map_for_assemble();
		let body = map.get("paths_read").unwrap();
		assert!(body.contains("src/a.ts"));
		assert!(body.contains("src/b.ts"));
		assert_eq!(body.matches("src/a.ts").count(), 1);
	}

	#[test]
	fn commit_overrides_auto_paths() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::PathsRead]);
		h.push_evidence_path("auto/only.ts", "file_read");
		h.commit(
			ExploreReturnKind::PathsRead,
			"- committed/path.ts — primary".into(),
			false,
		)
		.unwrap();
		let map = h.kind_map_for_assemble();
		assert!(map["paths_read"].contains("committed/path.ts"));
		assert!(!map["paths_read"].contains("auto/only.ts"));
	}

	#[test]
	fn rejects_foreign_kind_heading() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::KeySymbols]);
		let err = h
			.commit(
				ExploreReturnKind::KeySymbols,
				"## file_summaries\n- layout.tsx — shell\n## key_symbols\n- DocsLayout".into(),
				false,
			)
			.unwrap_err();
		assert!(err.contains("mono-kind"), "{err}");
		assert!(err.contains("file_summaries"), "{err}");
	}

	#[test]
	fn rejects_think_tag_in_body() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::Gaps]);
		let err = h
			.commit(
				ExploreReturnKind::Gaps,
				"</think>\n- missing MD pipeline".into(),
				false,
			)
			.unwrap_err();
		assert!(err.contains("think"), "{err}");
	}

	#[test]
	fn rejects_essay_opener() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::FileSummaries]);
		let err = h
			.commit(
				ExploreReturnKind::FileSummaries,
				"Let me write concise summaries…\n- a.tsx".into(),
				false,
			)
			.unwrap_err();
		assert!(err.contains("opener") || err.contains("mono-kind"), "{err}");
	}

	#[test]
	fn accepts_plain_mono_body() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::Gaps]);
		h.commit(
			ExploreReturnKind::Gaps,
			"- no MD→HTML pipeline\n- footer anchors may 404".into(),
			false,
		)
		.unwrap();
	}
}
