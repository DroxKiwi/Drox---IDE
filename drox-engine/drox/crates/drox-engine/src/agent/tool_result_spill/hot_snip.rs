//! Snip chaud hors fenêtre — **F2** préserve un compact merge Explore.

use camino::Utf8Path;
use serde_json::Value;
use tracing::{debug, warn};

use super::format::{format_spill_stub, spill_tool_result_to_disk};
use super::thresholds::{
	is_explore_delivery_tool, looks_like_spill_stub, tool_name_from_llm_wrapper,
};

/// Plafond du stub merge préservé (hot snip) — assez pour agir, pas pour re-inventorier.
const EXPLORE_MERGE_PRESERVE_MAX_CHARS: usize = 2_400;
const INLINE_KIND_PRESERVE_CHARS: usize = 400;

/// Snip chaud : remplace un gros résultat hors fenêtre par un stub.
///
/// - Stub spill déjà présent → raccourcir (D1).
/// - **F2** : livraison Explore (`task` / `explore_artifact_read`) → compact merge
///   (summary + chemins kind + extrait inline), **sans** spill 512 B inutile.
/// - Sinon : spill disque + stub générique (C1).
pub(crate) fn stub_for_hot_snip(workspace_root: &Utf8Path, content: &str) -> String {
	if looks_like_spill_stub(content) {
		return shorten_existing_spill_stub(content);
	}
	if let Some(compact) = compact_explore_delivery_for_hot_snip(content) {
		debug!(
			marker = "f2.hot_snip_explore_preserve",
			chars = compact.chars().count(),
			"dogfood: hot-snip preserved Explore merge compact"
		);
		return compact;
	}
	match spill_tool_result_to_disk(workspace_root, "hot-snip", content) {
		Ok(path) => format_spill_stub("tool", content.len(), &path, content),
		Err(e) => {
			warn!(error = %e, "hot-snip spill failed — using short placeholder");
			format!(
				"[drox: tool result — SPILL FAILED during hot snip ({e})]\n\
                 Output removed from context. Re-run the tool if still needed."
			)
		}
	}
}

/// Stub déjà spillé : garder path + rappel, jeter un long preview résiduel.
fn shorten_existing_spill_stub(content: &str) -> String {
	if content.contains("EXPLORE MERGE PRESERVED") {
		// Déjà un compact F2 — ne pas le vider davantage.
		return content.chars().take(EXPLORE_MERGE_PRESERVE_MAX_CHARS).collect();
	}
	let path_line = content
		.lines()
		.find(|l| l.contains(".drox/tool-outputs/") || l.contains("written to:"))
		.unwrap_or("Full body on disk under .drox/tool-outputs/");
	format!(
		"[drox: tool result — SPILLED FOR CONTEXT (hot snip)]\n\
         {path_line}\n\
         Preview dropped to free context. Do NOT file_read this spill path — use \
         Explore artifacts or a 1–2 line needle on the original source if you must edit."
	)
}

/// **F2** — si le message tool est une livraison Explore, produire un compact actionnable.
#[must_use]
pub(super) fn compact_explore_delivery_for_hot_snip(content: &str) -> Option<String> {
	let tool = tool_name_from_llm_wrapper(content).unwrap_or("");
	let json_slice = json_payload_from_wrapper(content)?;
	let value: Value = serde_json::from_str(json_slice).ok()?;

	let looks_explore = is_explore_delivery_tool(tool)
		|| value.get("artifacts").is_some()
		|| value.get("artifacts_inline").is_some()
		|| value
			.get("path")
			.and_then(|v| v.as_str())
			.is_some_and(|p| p.contains(".drox/subagents/"));

	if !looks_explore {
		return None;
	}

	let label = if tool.is_empty() { "explore" } else { tool };
	let mut lines = vec![
		format!(
			"[drox: tool result for «{label}» — EXPLORE MERGE PRESERVED (hot snip)]"
		),
		"Act from this merge. Prefer explore_artifact_read on kind paths; do NOT re-file_read covered sources.".into(),
	];

	if let Some(s) = value.get("summary").and_then(|v| v.as_str()) {
		let t: String = s.chars().take(500).collect();
		lines.push(format!("summary: {t}"));
	}
	if let Some(b) = value.get("blurb").and_then(|v| v.as_str()) {
		let t: String = b.chars().take(200).collect();
		lines.push(format!("blurb: {t}"));
	}
	// explore_artifact_read payload: often { path, content } or similar.
	if let Some(p) = value.get("path").and_then(|v| v.as_str()) {
		if p.contains(".drox/subagents/") || p.ends_with(".md") {
			lines.push(format!("artifact_path: {p}"));
		}
	}
	if let Some(arts) = value.get("artifacts").and_then(|v| v.as_object()) {
		if !arts.is_empty() {
			lines.push("artifacts:".into());
			for (kind, path) in arts {
				if let Some(p) = path.as_str() {
					lines.push(format!("  - {kind}: {p}"));
				}
			}
		}
	}
	if let Some(inline) = value.get("artifacts_inline").and_then(|v| v.as_object()) {
		for (kind, body) in inline {
			let Some(text) = body.as_str() else {
				continue;
			};
			let excerpt: String = text.chars().take(INLINE_KIND_PRESERVE_CHARS).collect();
			let ellipsis = if text.chars().count() > INLINE_KIND_PRESERVE_CHARS {
				"…"
			} else {
				""
			};
			lines.push(format!("inline.{kind}:\n{excerpt}{ellipsis}"));
		}
	} else if let Some(c) = value.get("content").and_then(|v| v.as_str()) {
		// Kind body via explore_artifact_read.
		let excerpt: String = c.chars().take(INLINE_KIND_PRESERVE_CHARS).collect();
		let ellipsis = if c.chars().count() > INLINE_KIND_PRESERVE_CHARS {
			"…"
		} else {
			""
		};
		lines.push(format!("content_excerpt:\n{excerpt}{ellipsis}"));
	}

	let mut out = lines.join("\n");
	if out.chars().count() > EXPLORE_MERGE_PRESERVE_MAX_CHARS {
		out = out.chars().take(EXPLORE_MERGE_PRESERVE_MAX_CHARS).collect();
		out.push('…');
	}
	Some(out)
}

fn json_payload_from_wrapper(content: &str) -> Option<&str> {
	let trimmed = content.trim();
	if let Some(i) = trimmed.find('\n') {
		let after = trimmed[i + 1..].trim_start();
		if after.starts_with('{') {
			return Some(after);
		}
	}
	if trimmed.starts_with('{') {
		return Some(trimmed);
	}
	// Fallback : premier objet JSON.
	let start = trimmed.find('{')?;
	Some(&trimmed[start..])
}
