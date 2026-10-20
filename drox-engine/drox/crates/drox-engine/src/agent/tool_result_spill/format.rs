//! Émission post-outil : JSON inline ou spill + stub.

use camino::Utf8Path;
use serde_json::Value;
use tracing::{debug, warn};

use super::slim_task::slim_task_tool_result_for_llm;
use super::thresholds::{
	is_explore_delivery_tool, spill_threshold_for_tool, TOOL_RESULT_PREVIEW_BYTES,
};

/// Corps `role=tool` après exécution réussie.
///
/// Explore `task` : pas de `report` monolithique — `artifacts_inline` borné + chemins kind.
/// **F1** : `task` / `explore_artifact_read` spillent seulement au-delà de 64 KiB.
pub(crate) fn format_tool_result_for_llm(
	tool_name: &str,
	value: &Value,
	workspace_root: &Utf8Path,
) -> String {
	let value_for_llm = if tool_name == "task" {
		slim_task_tool_result_for_llm(value)
	} else {
		value.clone()
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
			let truncated = &serialized[..serialized.len().min(threshold)];
			format!(
				"[drox: tool result for «{tool_name}» — LARGE OUTPUT TRUNCATED (spill failed: {e})]\n\
                 {truncated}\n…[truncated]"
			)
		}
	}
}

pub(super) fn format_spill_stub(tool_name: &str, bytes: usize, path: &str, body: &str) -> String {
	let preview_len = body.len().min(TOOL_RESULT_PREVIEW_BYTES);
	let preview = &body[..preview_len];
	// D1 : ne plus inciter file_read du spill (re-gonfle le contexte).
	format!(
		"[drox: tool result for «{tool_name}» — LARGE OUTPUT SPILLED TO DISK]\n\
         Full body ({bytes} bytes) written to: {path}\n\
         Preview (first {preview_len} bytes):\n{preview}\n\
         Do NOT file_read this spill path (re-inflates context). Prefer Explore \
         artifacts / explore_artifact_read, or a short needle on the original source \
         if you must edit. Do NOT re-call the same tool just to re-fetch this blob."
	)
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
