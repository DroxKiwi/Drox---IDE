//! Journal L0 — chemins observés via tools de lecture (sans LLM).

use serde_json::Value;

use super::handle::ExploreCommitHandle;

/// Une entrée d’évidence (path + outil source).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvidencePath {
	pub path: String,
	pub source: String,
}

/// Enregistre les paths visibles dans un tool call / result.
///
/// - `file_read` : `arguments.path`
/// - `glob` : `output.files[]` (+ `arguments.path` préfixe si présent)
/// - `grep` : `output.matches[].path` ou `arguments.path`
pub fn record_tool_evidence(
	handle: &ExploreCommitHandle,
	tool_name: &str,
	arguments: &Value,
	output: Option<&str>,
	is_error: bool,
) {
	if is_error {
		return;
	}
	match tool_name {
		"file_read" => {
			if let Some(p) = arguments.get("path").and_then(|v| v.as_str()) {
				handle.push_evidence_path(p, "file_read");
			}
		}
		"glob" => {
			if let Some(raw) = output {
				if let Ok(v) = serde_json::from_str::<Value>(raw) {
					if let Some(files) = v.get("files").and_then(|f| f.as_array()) {
						for f in files {
							if let Some(p) = f.as_str() {
								handle.push_evidence_path(strip_unc_prefix(p), "glob");
							}
						}
					}
				}
			}
			if let Some(p) = arguments.get("path").and_then(|v| v.as_str()) {
				if looks_like_file(p) {
					handle.push_evidence_path(p, "glob");
				}
			}
		}
		"grep" => {
			if let Some(raw) = output {
				if let Ok(v) = serde_json::from_str::<Value>(raw) {
					if let Some(matches) = v.get("matches").and_then(|m| m.as_array()) {
						for m in matches {
							if let Some(p) = m.get("path").and_then(|x| x.as_str()) {
								handle.push_evidence_path(strip_unc_prefix(p), "grep");
							}
						}
					}
				}
			}
			if let Some(p) = arguments.get("path").and_then(|v| v.as_str()) {
				if looks_like_file(p) {
					handle.push_evidence_path(p, "grep");
				}
			}
		}
		_ => {}
	}
}

fn strip_unc_prefix(p: &str) -> String {
	let t = p.trim();
	t.strip_prefix("//?/")
		.or_else(|| t.strip_prefix(r"\\?\"))
		.unwrap_or(t)
		.to_string()
}

fn looks_like_file(p: &str) -> bool {
	let t = p.trim();
	if t.is_empty() {
		return false;
	}
	std::path::Path::new(t)
		.extension()
		.map(|e| !e.is_empty())
		.unwrap_or(false)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::subagent::return_kinds::ExploreReturnKind;

	#[test]
	fn records_file_read_and_glob_files() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::PathsRead]);
		record_tool_evidence(
			&h,
			"file_read",
			&serde_json::json!({"path": "src/app/page.tsx"}),
			None,
			false,
		);
		let out = serde_json::json!({
			"files": ["//?/C:/repo/a.md", "C:/repo/b.md"]
		})
		.to_string();
		record_tool_evidence(
			&h,
			"glob",
			&serde_json::json!({"pattern": "**/*"}),
			Some(&out),
			false,
		);
		let snap = h.snapshot();
		assert_eq!(snap.evidence_paths.len(), 3);
		assert!(snap.evidence_paths.iter().any(|e| e.path.contains("page.tsx")));
		assert!(snap.evidence_paths.iter().any(|e| e.path.contains("a.md")));
	}

	#[test]
	fn skips_errors() {
		let h = ExploreCommitHandle::new(vec![]);
		record_tool_evidence(
			&h,
			"file_read",
			&serde_json::json!({"path": "x.rs"}),
			None,
			true,
		);
		assert!(h.snapshot().evidence_paths.is_empty());
	}
}
