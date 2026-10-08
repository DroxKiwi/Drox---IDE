//! Index Explore **scopé discussion** — blurbs JSONL sous `.drox/subagents/<sessionId>/`.

use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};

use camino::{Utf8Path, Utf8PathBuf};
use serde::{Deserialize, Serialize};

use super::return_kinds::ExploreReturnKind;

pub const EXPLORE_BLURB_MAX_CHARS: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreIndexEntry {
	pub explore_id: String,
	pub session_id: String,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub title: Option<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub plan_step_id: Option<String>,
	pub return_kinds: Vec<String>,
	pub status: String,
	pub blurb: String,
	pub artifacts: BTreeMap<String, String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub report_path: Option<String>,
	pub truncated: bool,
	pub created_at: String,
}

#[must_use]
pub fn session_subagents_dir(workspace_root: &Utf8Path, session_id: &str) -> Utf8PathBuf {
	workspace_root
		.join(".drox")
		.join("subagents")
		.join(sanitize_path_segment(session_id))
}

#[must_use]
pub fn index_path(workspace_root: &Utf8Path, session_id: &str) -> Utf8PathBuf {
	session_subagents_dir(workspace_root, session_id).join("index.jsonl")
}

pub fn append_index_entry(
	workspace_root: &Utf8Path,
	entry: &ExploreIndexEntry,
) -> io::Result<()> {
	let dir = session_subagents_dir(workspace_root, &entry.session_id);
	fs::create_dir_all(dir.as_std_path())?;
	let path = index_path(workspace_root, &entry.session_id);
	let mut file = OpenOptions::new()
		.create(true)
		.append(true)
		.open(path.as_std_path())?;
	serde_json::to_writer(&mut file, entry).map_err(io::Error::other)?;
	file.write_all(b"\n")?;
	Ok(())
}

/// Lit l'index **de cette session uniquement**.
pub fn list_index_entries(
	workspace_root: &Utf8Path,
	session_id: &str,
) -> io::Result<Vec<ExploreIndexEntry>> {
	let path = index_path(workspace_root, session_id);
	if !path.exists() {
		return Ok(Vec::new());
	}
	let text = fs::read_to_string(path.as_std_path())?;
	let mut out = Vec::new();
	for line in text.lines() {
		let t = line.trim();
		if t.is_empty() {
			continue;
		}
		if let Ok(mut entry) = serde_json::from_str::<ExploreIndexEntry>(t) {
			// Défense en profondeur — ignorer toute ligne d'une autre session.
			if entry.session_id == session_id {
				out.push(entry);
			} else {
				let _ = &mut entry;
			}
		}
	}
	Ok(out)
}

pub fn find_index_entry(
	workspace_root: &Utf8Path,
	session_id: &str,
	explore_id: &str,
) -> io::Result<Option<ExploreIndexEntry>> {
	Ok(list_index_entries(workspace_root, session_id)?
		.into_iter()
		.rev()
		.find(|e| e.explore_id == explore_id))
}

#[must_use]
pub fn build_blurb(summary: &str, max_chars: usize) -> String {
	let trimmed = summary.trim();
	if trimmed.is_empty() {
		return String::new();
	}
	if trimmed.chars().count() <= max_chars {
		return trimmed.to_string();
	}
	let mut out = String::new();
	for (i, ch) in trimmed.chars().enumerate() {
		if i >= max_chars {
			break;
		}
		out.push(ch);
	}
	out.push('…');
	out
}

#[must_use]
pub fn sanitize_path_segment(raw: &str) -> String {
	let s: String = raw
		.chars()
		.map(|c| {
			if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
				c
			} else {
				'_'
			}
		})
		.collect();
	if s.is_empty() {
		"adhoc".into()
	} else {
		s
	}
}

#[must_use]
pub fn kinds_as_strings(kinds: &[ExploreReturnKind]) -> Vec<String> {
	kinds.iter().map(|k| k.as_str().to_string()).collect()
}

#[cfg(test)]
mod tests {
	use super::*;
	use camino::Utf8PathBuf;

	#[test]
	fn append_and_list_scoped_to_session() {
		let dir = tempfile::tempdir().unwrap();
		let root = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
		let entry = ExploreIndexEntry {
			explore_id: "exp_1".into(),
			session_id: "ses_a".into(),
			title: Some("Map docs".into()),
			plan_step_id: None,
			return_kinds: vec!["paths_read".into()],
			status: "ok".into(),
			blurb: "Found sidebar".into(),
			artifacts: BTreeMap::new(),
			report_path: None,
			truncated: false,
			created_at: "2026-10-07T00:00:00Z".into(),
		};
		append_index_entry(&root, &entry).unwrap();
		let listed = list_index_entries(&root, "ses_a").unwrap();
		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].explore_id, "exp_1");
		assert!(list_index_entries(&root, "ses_b").unwrap().is_empty());
	}
}
