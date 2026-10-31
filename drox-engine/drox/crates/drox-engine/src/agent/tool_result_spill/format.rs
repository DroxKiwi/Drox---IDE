//! Émission post-outil : JSON inline ou spill + stub.

use camino::Utf8Path;
use serde_json::Value;
use tracing::{debug, warn};

use crate::agent::config::EngineProfile;

use super::slim_task::slim_task_tool_result_for_profile;
use super::thresholds::{
	is_explore_delivery_tool, spill_threshold_for_tool, TOOL_RESULT_PREVIEW_BYTES,
};

/// Corps `role=tool` après exécution réussie (`cloud-full`).
#[cfg(test)]
pub(crate) fn format_tool_result_for_llm(
	tool_name: &str,
	value: &Value,
	workspace_root: &Utf8Path,
) -> String {
	format_tool_result_for_llm_with_profile(tool_name, value, workspace_root, EngineProfile::CloudFull)
}

/// Corps `role=tool` après exécution réussie.
///
/// Explore `task` (`cloud-full`) : pas de `report` monolithique — `artifacts_inline` borné +
/// chemins kind. Profils locaux : `report` inline borné.
/// **F1** : `task` / `explore_artifact_read` spillent seulement au-delà de 64 KiB.
pub(crate) fn format_tool_result_for_llm_with_profile(
	tool_name: &str,
	value: &Value,
	workspace_root: &Utf8Path,
	profile: EngineProfile,
) -> String {
	let value_for_llm = if tool_name == "task" {
		slim_task_tool_result_for_profile(value, profile)
	} else {
		without_duplicate_tool_body(tool_name, value)
	};
	let serialized = serde_json::to_string(&value_for_llm).unwrap_or_default();
	let threshold = spill_threshold_for_tool(tool_name);
	if serialized.len() <= threshold {
		return format!(
			"[drox: tool result for «{tool_name}» — JSON below; this is NOT a user message]\n{serialized}",
		);
	}
	match spill_tool_result_to_disk(workspace_root, tool_name, &serialized) {
		Ok(path) => {
			debug!(
				marker = "c1.spill",
				tool = %tool_name,
				bytes = serialized.len(),
				threshold,
				spill_path = %path,
				explore_delivery = is_explore_delivery_tool(tool_name),
				"dogfood: tool result spilled to disk"
			);
			if is_explore_delivery_tool(tool_name) {
				format_explore_delivery_spill_stub(tool_name, serialized.len(), &path, &value_for_llm)
			} else {
				format_spill_stub(tool_name, serialized.len(), &path, &serialized)
			}
		}
		Err(e) => {
			warn!(
				marker = "c1.spill_failed",
				tool = %tool_name,
				error = %e,
				"tool result spill failed — truncating inline"
			);
			let truncated = &serialized[..floor_char_boundary(&serialized, threshold)];
			format!(
				"[drox: tool result for «{tool_name}» — LARGE OUTPUT TRUNCATED (spill failed: {e})]\n\
                 {truncated}\n…[truncated]"
			)
		}
	}
}

pub(super) fn format_spill_stub(tool_name: &str, bytes: usize, path: &str, body: &str) -> String {
	format_spill_stub_with_preview(tool_name, bytes, path, body, TOOL_RESULT_PREVIEW_BYTES)
}

pub(super) fn format_spill_stub_with_preview(
	tool_name: &str,
	bytes: usize,
	path: &str,
	body: &str,
	preview_max: usize,
) -> String {
	let preview_len = floor_char_boundary(body, preview_max);
	let preview = &body[..preview_len];
	let source_hint = source_path_from_body(body)
		.map(|p| format!("Source: {p}\n"))
		.unwrap_or_default();
	// D1 : ne pas inciter file_read du spill (re-gonfle le contexte) ; la source reste lisible par plage.
	format!(
		"[drox: tool result for «{tool_name}» — LARGE OUTPUT SPILLED TO DISK]\n\
         Full body ({bytes} bytes) written to: {path}\n\
         {source_hint}\
         Preview (first {preview_len} bytes):\n{preview}\n\
         Do NOT file_read the spill path. If you still need more of the original \
         source, file_read it with start_line / end_line (a focused range)."
	)
}

/// Plus grand index ≤ `max` sur une frontière de caractère UTF-8.
pub(super) fn floor_char_boundary(s: &str, max: usize) -> usize {
	if max >= s.len() {
		return s.len();
	}
	let mut i = max;
	while i > 0 && !s.is_char_boundary(i) {
		i -= 1;
	}
	i
}

/// Champ `"path"` d'un résultat JSON (`file_read`, …) — sans désérialiser tout le blob.
pub(super) fn source_path_from_body(body: &str) -> Option<String> {
	let json_start = body.find('{')?;
	if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(&body[json_start..]) {
		return map
			.get("path")
			.and_then(Value::as_str)
			.map(str::to_string);
	}
	None
}

/// Spill forcé d’une livraison Explore : pointer les kinds, pas inciter re-read sources.
fn format_explore_delivery_spill_stub(
	tool_name: &str,
	bytes: usize,
	spill_path: &str,
	value: &Value,
) -> String {
	let mut lines = vec![
		format!(
			"[drox: tool result for «{tool_name}» — LARGE OUTPUT SPILLED TO DISK (Explore delivery)]"
		),
		format!("Full body ({bytes} bytes) written to: {spill_path}"),
		"Do NOT file_read this spill path. Prefer kind paths below via explore_artifact_read, then act (file_write/file_edit).".into(),
	];
	if let Some(summary) = value.get("summary").and_then(|v| v.as_str()) {
		let s: String = summary.chars().take(400).collect();
		lines.push(format!("summary: {s}"));
	}
	if let Some(arts) = value.get("artifacts").and_then(|v| v.as_object()) {
		if !arts.is_empty() {
			lines.push("artifacts (kind → path):".into());
			for (kind, path) in arts {
				if let Some(p) = path.as_str() {
					lines.push(format!("  - {kind}: {p}"));
				}
			}
		}
	}
	if let Some(inline) = value.get("artifacts_inline").and_then(|v| v.as_object()) {
		if !inline.is_empty() {
			let keys: Vec<&str> = inline.keys().map(String::as_str).collect();
			lines.push(format!(
				"artifacts_inline keys (spilled): {}",
				keys.join(", ")
			));
		}
	}
	lines.join("\n")
}

/// L'appel porte déjà la demande. Le résultat vers le modèle ne la répète pas.
/// L'UI reçoit toujours le JSON complet via `ToolFinish`.
fn without_duplicate_tool_body(tool_name: &str, value: &Value) -> Value {
	let Some(obj) = value.as_object() else {
		return value.clone();
	};
	let drop_keys: &[&str] = match tool_name {
		"file_edit" | "file_write" | "notebook_edit" => &["diff", "new_content", "content"],
		"todo_write" => &["todos"],
		"course_plan_write" => &["steps"],
		"bash" => &["command", "description"],
		_ => return value.clone(),
	};
	let mut slim = obj.clone();
	for key in drop_keys {
		slim.remove(*key);
	}
	Value::Object(slim)
}

pub(super) fn spill_tool_result_to_disk(
	workspace_root: &Utf8Path,
	tool_name: &str,
	body: &str,
) -> std::io::Result<String> {
	let dir = workspace_root.join(".drox").join("tool-outputs");
	std::fs::create_dir_all(dir.as_std_path())?;
	let safe: String = tool_name
		.chars()
		.map(|c| {
			if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
				c
			} else {
				'_'
			}
		})
		.collect();
	let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
	let file_name = format!("{stamp}-{safe}.json");
	let path = dir.join(&file_name);
	std::fs::write(path.as_std_path(), body)?;
	Ok(path.to_string())
}

#[cfg(test)]
mod tests {
	use super::*;
	use serde_json::json;

	#[test]
	fn file_edit_result_for_llm_drops_diff() {
		let value = json!({
			"applied": true,
			"path": "src/page.tsx",
			"edits_applied": 1,
			"diff": "--- a/src/page.tsx\n+++ b/src/page.tsx\n-old\n+new"
		});
		let formatted = format_tool_result_for_llm(
			"file_edit",
			&value,
			Utf8Path::new("."),
		);
		assert!(formatted.contains("\"applied\":true"));
		assert!(formatted.contains("src/page.tsx"));
		assert!(!formatted.contains("diff"));
		assert!(!formatted.contains("--- a/"));
	}

	#[test]
	fn todo_bash_and_course_plan_drop_echoed_request() {
		let todo = format_tool_result_for_llm(
			"todo_write",
			&json!({
				"todos": [{"id": "1", "content": "faire", "status": "pending"}],
				"counts": {"pending": 1},
				"summary": "1 pending"
			}),
			Utf8Path::new("."),
		);
		assert!(todo.contains("summary"));
		assert!(!todo.contains("faire"));

		let plan = format_tool_result_for_llm(
			"course_plan_write",
			&json!({
				"courseTitle": "Rust",
				"steps": [{"id": "1", "title": "boucle"}],
				"counts": {"pending": 1},
				"summary": "1 step"
			}),
			Utf8Path::new("."),
		);
		assert!(plan.contains("Rust"));
		assert!(!plan.contains("boucle"));

		let bash = format_tool_result_for_llm(
			"bash",
			&json!({
				"command": "dir",
				"description": "lister",
				"exit_code": 0,
				"stdout": "a.txt"
			}),
			Utf8Path::new("."),
		);
		assert!(bash.contains("a.txt"));
		assert!(!bash.contains("dir"));
		assert!(!bash.contains("lister"));
	}
}
