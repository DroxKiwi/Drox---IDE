//! Artefacts Explore sous `.drox/subagents/` — conclusion.md mise à disposition du parent.

use std::io;

use camino::{Utf8Path, Utf8PathBuf};

/// Longueur max du résumé inline (tool_result parent / LLM).
pub(super) const EXPLORE_SUMMARY_MAX_CHARS: usize = 700;

/// Écrit `conclusion.md` et renvoie `(chemin relatif workspace, summary)`.
pub(super) fn write_explore_conclusion(
	workspace_root: &Utf8Path,
	run_id: Option<&str>,
	report: &str,
) -> io::Result<(String, String)> {
	let run_seg = sanitize_path_segment(run_id.unwrap_or("adhoc"));
	let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
	let call_seg = format!("{stamp}-explore");
	let rel_dir = Utf8PathBuf::from(".drox")
		.join("subagents")
		.join(&run_seg)
		.join(&call_seg);
	let abs_dir = workspace_root.join(&rel_dir);
	std::fs::create_dir_all(abs_dir.as_std_path())?;
	let abs_file = abs_dir.join("conclusion.md");
	let body = format!(
		"<!-- Drox Explore conclusion — available to parent via report_path; not a chat inject -->\n\n{}",
		report.trim()
	);
	std::fs::write(abs_file.as_std_path(), body)?;
	// Always forward slashes in the parent-facing path (workspace-relative).
	let rel_file = format!("{}/conclusion.md", rel_dir.as_str().replace('\\', "/"));
	let summary = build_explore_summary(report, EXPLORE_SUMMARY_MAX_CHARS);
	Ok((rel_file, summary))
}

fn sanitize_path_segment(raw: &str) -> String {
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

/// Préfère le bloc `## Findings`, sinon tête du rapport.
pub(super) fn build_explore_summary(report: &str, max_chars: usize) -> String {
	let trimmed = report.trim();
	if trimmed.is_empty() {
		return String::new();
	}
	let slice = if let Some(rest) = trimmed.strip_prefix("## Findings") {
		let body = rest.trim_start_matches(|c: char| c == '\n' || c == '\r' || c == ' ');
		let end = body.find("\n## ").unwrap_or(body.len());
		body[..end].trim()
	} else if let Some(idx) = trimmed.find("## Findings") {
		let after = &trimmed[idx + "## Findings".len()..];
		let body = after.trim_start_matches(|c: char| c == '\n' || c == '\r' || c == ' ');
		let end = body.find("\n## ").unwrap_or(body.len());
		body[..end].trim()
	} else {
		trimmed
	};
	if slice.chars().count() <= max_chars {
		return slice.to_string();
	}
	let mut out = String::new();
	for (i, ch) in slice.chars().enumerate() {
		if i >= max_chars {
			break;
		}
		out.push(ch);
	}
	out.push_str("…");
	out
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn summary_prefers_findings_block() {
		let report = "## Findings\nAuth in src/a.ts\n\n## Paths\n- src/a.ts\n\n## Gaps\nnone";
		let s = build_explore_summary(report, 700);
		assert!(s.contains("Auth in src/a.ts"));
		assert!(!s.contains("## Paths"));
	}

	#[test]
	fn write_creates_conclusion_under_subagents() {
		let dir = tempfile::tempdir().unwrap();
		let root = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
		let (rel, summary) =
			write_explore_conclusion(&root, Some("run_1"), "## Findings\nHello\n\n## Paths\n- x").unwrap();
		assert!(rel.starts_with(".drox/subagents/run_1/"));
		assert!(rel.ends_with("/conclusion.md"));
		assert!(summary.contains("Hello"));
		let abs = root.join(&rel);
		let body = std::fs::read_to_string(abs.as_std_path()).unwrap();
		assert!(body.contains("## Findings"));
		assert!(body.contains("Hello"));
	}
}
