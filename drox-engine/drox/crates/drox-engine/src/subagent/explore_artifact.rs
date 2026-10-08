//! Artefacts Explore sous `.drox/subagents/<sessionId>/<exploreId>/`.

use std::collections::BTreeMap;
use std::io;

use camino::{Utf8Path, Utf8PathBuf};
use drox_tools::{
	append_index_entry, build_blurb, kinds_as_strings, sanitize_path_segment, session_subagents_dir,
	ExploreIndexEntry, ExploreReturnKind, ExploreReturnOptions, EXPLORE_BLURB_MAX_CHARS,
};
use serde::Serialize;
use serde_json::Value;

/// Longueur max du résumé inline (tool_result parent / LLM).
pub(super) const EXPLORE_SUMMARY_MAX_CHARS: usize = 700;

#[derive(Debug, Clone)]
pub(super) struct ExploreArtifactWrite {
	pub explore_id: String,
	pub report_path: String,
	pub summary: String,
	pub blurb: String,
	pub artifacts: BTreeMap<String, String>,
	pub kinds_incomplete: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExploreManifest {
	explore_id: String,
	session_id: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	title: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	plan_step_id: Option<String>,
	return_kinds: Vec<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	return_options: Option<ExploreReturnOptions>,
	artifacts: BTreeMap<String, String>,
	kinds_incomplete: Vec<String>,
	truncated: bool,
	status: String,
}

/// Écrit conclusion + artefacts par kind + manifest + ligne d'index.
///
/// Si `kind_bodies` est fourni (phase rapport JSON), on l’utilise ; sinon extract markdown
/// (`## <kind>`, **dernier** header gagnant) + lint stub.
pub(super) fn write_explore_bundle(
	workspace_root: &Utf8Path,
	session_id: &str,
	title: Option<&str>,
	plan_step_id: Option<&str>,
	kinds: &[ExploreReturnKind],
	options: &ExploreReturnOptions,
	report: &str,
	kind_bodies: Option<&BTreeMap<String, String>>,
	truncated_exec: bool,
) -> io::Result<ExploreArtifactWrite> {
	let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
	let explore_id = format!("exp_{stamp}");
	let session_seg = sanitize_path_segment(session_id);
	let rel_dir = Utf8PathBuf::from(".drox")
		.join("subagents")
		.join(&session_seg)
		.join(&explore_id);
	let abs_dir = workspace_root.join(&rel_dir);
	std::fs::create_dir_all(abs_dir.as_std_path())?;

	let abs_conclusion = abs_dir.join("conclusion.md");
	let body = format!(
		"<!-- Drox Explore conclusion — parent via report_path / artifacts; not a chat inject -->\n\n{}",
		report.trim()
	);
	std::fs::write(abs_conclusion.as_std_path(), body)?;
	let report_path = format!("{}/conclusion.md", rel_dir.as_str().replace('\\', "/"));

	let mut artifacts = BTreeMap::new();
	let mut kinds_incomplete = Vec::new();
	for kind in kinds {
		let section = kind_bodies
			.and_then(|m| m.get(kind.as_str()).cloned())
			.or_else(|| extract_kind_section(report, *kind));
		let filename = kind.artifact_filename();
		let abs_file = abs_dir.join(&filename);
		let content = section.unwrap_or_default();
		if !kind_body_usable(&content) {
			kinds_incomplete.push(kind.as_str().to_string());
			std::fs::write(
				abs_file.as_std_path(),
				format!(
					"<!-- incomplete: kind `{}` missing, empty, or stub in Explore report -->\n",
					kind.as_str()
				),
			)?;
		} else {
			std::fs::write(abs_file.as_std_path(), format!("{}\n", content.trim()))?;
		}
		let rel = format!("{}/{}", rel_dir.as_str().replace('\\', "/"), filename);
		artifacts.insert(kind.as_str().to_string(), rel);
	}

	let kinds_complete = kinds_incomplete.is_empty();
	let truncated = truncated_exec || (!kinds.is_empty() && !kinds_complete);
	let status = if truncated_exec {
		"truncated_exec".to_string()
	} else if !kinds.is_empty() && !kinds_complete {
		"kinds_incomplete".to_string()
	} else {
		"ok".to_string()
	};

	let summary = build_explore_summary(report, EXPLORE_SUMMARY_MAX_CHARS);
	let blurb = build_blurb(&summary, EXPLORE_BLURB_MAX_CHARS);

	let manifest = ExploreManifest {
		explore_id: explore_id.clone(),
		session_id: session_id.to_string(),
		title: title.map(str::to_string),
		plan_step_id: plan_step_id.map(str::to_string),
		return_kinds: kinds_as_strings(kinds),
		return_options: if serde_json::to_string(options).ok().as_deref() == Some("{}") {
			None
		} else {
			Some(options.clone())
		},
		artifacts: artifacts.clone(),
		kinds_incomplete: kinds_incomplete.clone(),
		truncated,
		status: status.clone(),
	};
	let manifest_path = abs_dir.join("manifest.json");
	std::fs::write(
		manifest_path.as_std_path(),
		serde_json::to_vec_pretty(&manifest).map_err(io::Error::other)?,
	)?;

	let index_entry = ExploreIndexEntry {
		explore_id: explore_id.clone(),
		session_id: session_id.to_string(),
		title: title.map(str::to_string),
		plan_step_id: plan_step_id.map(str::to_string),
		return_kinds: kinds_as_strings(kinds),
		status,
		blurb: blurb.clone(),
		artifacts: artifacts.clone(),
		report_path: Some(report_path.clone()),
		truncated,
		created_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
	};
	append_index_entry(workspace_root, &index_entry)?;

	let _ = session_subagents_dir(workspace_root, session_id);

	Ok(ExploreArtifactWrite {
		explore_id,
		report_path,
		summary,
		blurb,
		artifacts,
		kinds_incomplete,
	})
}

/// Corps kind utilisable (non vide + pas stub outline).
#[must_use]
pub(super) fn kind_body_usable(body: &str) -> bool {
	!is_stub_kind_body(body)
}

/// Détecte les stubs / outlines CoT / méta-descriptions (dogfood 2026-10-08).
#[must_use]
pub(super) fn is_stub_kind_body(body: &str) -> bool {
	let t = body.trim();
	if t.is_empty() {
		return true;
	}
	let lower = t.to_ascii_lowercase();
	// Chemins courts valides (`- src/a.ts`) : ne pas rejeter sur la seule longueur.
	if t.chars().count() < 8 && !kind_body_has_concrete_signal(&lower) {
		return true;
	}
	const EXACT: &[&str] = &[
		"tbd",
		"todo",
		"n/a",
		"none yet",
		"to fill",
		"placeholder",
		"(empty)",
		"(stub)",
		"…",
		"...",
		"-",
		"*",
	];
	if EXACT.iter().any(|m| lower == *m) {
		return true;
	}
	const PREFIX: &[&str] = &[
		"tbd",
		"todo:",
		"to fill",
		"will fill",
		"placeholder",
		"outline only",
		"(incomplete",
		"see below",
		"pending —",
		"pending:",
		"let me ",
		"i should ",
		"i need to ",
		"i'll ",
		"i will ",
		"now i ",
		"caps:",
	];
	if PREFIX.iter().any(|m| lower.starts_with(m)) {
		return true;
	}
	// Méta « cette section devrait contenir… » / outline de headers (dogfood).
	const META: &[&str] = &[
		"per-file summaries",
		"list of paths consulted",
		"list of paths",
		"tree overview",
		"i should keep",
		"let me distill",
		"let me write",
		"the report should",
		"write the report",
		"keep it concise",
		"parent-facing",
		"recommended next parent steps`",
		"## key_symbols",
		"## code_snippets",
		"## structure_map",
		"## file_summaries",
		"## paths_read",
		"## gaps",
	];
	if META.iter().any(|m| lower.contains(m)) && !kind_body_has_concrete_signal(&lower) {
		return true;
	}
	// Plusieurs headers markdown listés comme plan, sans faits.
	let header_bullets = lower
		.lines()
		.filter(|l| {
			let s = l.trim_start().trim_start_matches(['-', '*', '`']);
			s.trim_start().starts_with("## ")
		})
		.count();
	if header_bullets >= 2 && !kind_body_has_concrete_signal(&lower) {
		return true;
	}
	let lines: Vec<_> = t.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
	if lines.len() == 1 {
		let l = lines[0];
		if l == "-" || l == "*" || l == "…" || l == "..." || l.starts_with("(incomplete") {
			return true;
		}
		// Une seule ligne méta « — description du kind » (em/en dash), sans faits.
		if (l.starts_with('—') || l.starts_with('–')) && !kind_body_has_concrete_signal(&lower) {
			return true;
		}
	}
	false
}

/// Signal minimal qu’un kind contient des faits (chemins / fichiers), pas seulement du plan.
fn kind_body_has_concrete_signal(lower: &str) -> bool {
	lower.contains(".ts")
		|| lower.contains(".tsx")
		|| lower.contains(".js")
		|| lower.contains(".md")
		|| lower.contains(".rs")
		|| lower.contains(".json")
		|| lower.contains("src/")
		|| lower.contains("docs/")
		|| lower.contains("content/")
		|| lower.contains("\\")
		|| lower.contains("`/")
}

/// Parse le JSON de synthèse phase 2 → map kind→corps + next steps optionnels.
pub(super) fn parse_explore_report_json(
	raw: &str,
	kinds: &[ExploreReturnKind],
) -> Result<(BTreeMap<String, String>, Option<String>), String> {
	let json_str = extract_json_object(raw)?;
	let value: Value =
		serde_json::from_str(&json_str).map_err(|e| format!("json parse: {e}"))?;
	let obj = value
		.as_object()
		.ok_or_else(|| "json root must be an object".to_string())?;

	let mut map = BTreeMap::new();
	if kinds.is_empty() {
		for (key, kind) in [
			("findings", ExploreReturnKind::FileSummaries),
			("file_summaries", ExploreReturnKind::FileSummaries),
			("paths", ExploreReturnKind::PathsRead),
			("paths_read", ExploreReturnKind::PathsRead),
			("gaps", ExploreReturnKind::Gaps),
		] {
			if let Some(s) = obj.get(key).and_then(value_as_string) {
				map.entry(kind.as_str().to_string()).or_insert(s);
			}
		}
	} else {
		for k in kinds {
			let s = obj
				.get(k.as_str())
				.and_then(value_as_string)
				.unwrap_or_default();
			map.insert(k.as_str().to_string(), s);
		}
	}
	let next = obj
		.get("recommended_next_parent_steps")
		.and_then(value_as_string);
	Ok((map, next))
}

/// Reconstruit un markdown parent-facing depuis la map JSON.
#[must_use]
pub(super) fn kinds_map_to_markdown(
	map: &BTreeMap<String, String>,
	kinds: &[ExploreReturnKind],
	next_steps: Option<&str>,
) -> String {
	let mut out = String::new();
	let order: Vec<&str> = if kinds.is_empty() {
		vec!["file_summaries", "paths_read", "gaps"]
	} else {
		kinds.iter().map(|k| k.as_str()).collect()
	};
	for key in order {
		if let Some(body) = map.get(key) {
			if !body.trim().is_empty() {
				if !out.is_empty() {
					out.push_str("\n\n");
				}
				out.push_str("## ");
				out.push_str(key);
				out.push('\n');
				out.push_str(body.trim());
			}
		}
	}
	if let Some(ns) = next_steps.map(str::trim).filter(|s| !s.is_empty()) {
		if !out.is_empty() {
			out.push_str("\n\n");
		}
		out.push_str("## Recommended next parent steps\n");
		out.push_str(ns);
	}
	out
}

fn extract_json_object(raw: &str) -> Result<String, String> {
	let mut t = raw.trim();
	if t.starts_with("```") {
		t = t.trim_start_matches('`');
		if let Some(rest) = t.strip_prefix("json") {
			t = rest.trim_start();
		} else if let Some(rest) = t.strip_prefix("JSON") {
			t = rest.trim_start();
		}
		if let Some(end) = t.rfind("```") {
			t = t[..end].trim();
		}
	}
	let start = t
		.find('{')
		.ok_or_else(|| "no JSON object start".to_string())?;
	let end = t
		.rfind('}')
		.ok_or_else(|| "no JSON object end".to_string())?;
	if end < start {
		return Err("malformed JSON braces".into());
	}
	Ok(t[start..=end].to_string())
}

fn value_as_string(v: &Value) -> Option<String> {
	match v {
		Value::String(s) => Some(s.clone()),
		Value::Null => None,
		Value::Array(_) | Value::Object(_) => serde_json::to_string_pretty(v).ok(),
		other => Some(other.to_string()),
	}
}

/// Extrait le corps sous `## <kind>` (headers exacts snake_case).
/// **Dernier** header gagnant (évite outlines CoT en tête de réponse).
/// Fallback legacy : `## Paths` → paths_read, `## Gaps` → gaps, `## Findings` → file_summaries.
#[must_use]
pub(super) fn extract_kind_section(report: &str, kind: ExploreReturnKind) -> Option<String> {
	let primary = format!("## {}", kind.as_str());
	if let Some(body) = section_after_header(report, &primary) {
		return Some(body);
	}
	let legacy = match kind {
		ExploreReturnKind::PathsRead => Some("## Paths"),
		ExploreReturnKind::Gaps => Some("## Gaps"),
		ExploreReturnKind::FileSummaries => Some("## Findings"),
		_ => None,
	};
	legacy.and_then(|h| section_after_header(report, h))
}

fn section_after_header(report: &str, header: &str) -> Option<String> {
	let lower_report = report.to_ascii_lowercase();
	let lower_header = header.to_ascii_lowercase();
	let mut last_idx = None;
	let mut search_from = 0;
	while let Some(rel) = lower_report[search_from..].find(&lower_header) {
		let idx = search_from + rel;
		let at_line_start = idx == 0
			|| report
				.as_bytes()
				.get(idx.saturating_sub(1))
				.is_some_and(|b| *b == b'\n');
		if at_line_start {
			last_idx = Some(idx);
		}
		search_from = idx + lower_header.len().max(1);
	}
	let idx = last_idx?;
	let after = &report[idx + header.len()..];
	let body = after.trim_start_matches(|c: char| c == '\n' || c == '\r' || c == ' ');
	let end = body
		.find("\n## ")
		.or_else(|| body.find("\n##"))
		.unwrap_or(body.len());
	let slice = body[..end].trim();
	if slice.is_empty() {
		None
	} else {
		Some(slice.to_string())
	}
}

/// Préfère le bloc `## Findings` / `## file_summaries`, sinon tête du rapport.
pub(super) fn build_explore_summary(report: &str, max_chars: usize) -> String {
	let trimmed = report.trim();
	if trimmed.is_empty() {
		return String::new();
	}
	let slice = extract_kind_section(trimmed, ExploreReturnKind::FileSummaries)
		.or_else(|| section_after_header(trimmed, "## Findings"))
		.unwrap_or_else(|| trimmed.to_string());
	if slice.chars().count() <= max_chars {
		return slice;
	}
	let mut out = String::new();
	for (i, ch) in slice.chars().enumerate() {
		if i >= max_chars {
			break;
		}
		out.push(ch);
	}
	out.push('…');
	out
}

#[cfg(test)]
mod tests {
	use super::*;
	use drox_tools::ExploreReturnOptions;

	#[test]
	fn extract_prefers_exact_kind_header() {
		let report = "## paths_read\n- a.ts\n\n## gaps\nnone\n";
		let s = extract_kind_section(report, ExploreReturnKind::PathsRead).unwrap();
		assert!(s.contains("a.ts"));
	}

	#[test]
	fn extract_prefers_last_header_over_cot_outline() {
		let report = "\
## paths_read\n\
## file_summaries\n\
## gaps\n\
\n\
Thinking done.\n\
\n\
## paths_read\n\
- src/auth.ts\n\
- src/session.ts\n\
\n\
## file_summaries\n\
Auth helper owns login.\n\
\n\
## gaps\n\
No tests for refresh.\n";
		let paths = extract_kind_section(report, ExploreReturnKind::PathsRead).unwrap();
		assert!(paths.contains("src/auth.ts"));
		assert!(!is_stub_kind_body(&paths));
		let gaps = extract_kind_section(report, ExploreReturnKind::Gaps).unwrap();
		assert!(gaps.contains("No tests"));
	}

	#[test]
	fn stub_lint_rejects_outline_bodies() {
		assert!(is_stub_kind_body(""));
		assert!(is_stub_kind_body("TBD"));
		assert!(is_stub_kind_body("-"));
		assert!(is_stub_kind_body("todo: fill later"));
		assert!(is_stub_kind_body(
			"— per-file summaries for pedagogie (the core mission), with filename, size"
		));
		assert!(is_stub_kind_body(
			"`\n- `## key_symbols`\n- `## code_snippets`\n\nI should keep it concise, parent-facing"
		));
		assert!(!is_stub_kind_body("- src/auth.ts\n- src/session.ts"));
		assert!(!is_stub_kind_body(
			"- `docs/pedagogie/01-contact-ollama.md` (~627 lines) — Contact Ollama\n- `docs/pedagogie/README.md`"
		));
	}

	#[test]
	fn parse_json_kinds_and_markdown() {
		let raw = r#"```json
{"paths_read":"- a.ts","gaps":"none","recommended_next_parent_steps":"Merge"}
```"#;
		let kinds = vec![ExploreReturnKind::PathsRead, ExploreReturnKind::Gaps];
		let (map, next) = parse_explore_report_json(raw, &kinds).unwrap();
		assert_eq!(map.get("paths_read").unwrap(), "- a.ts");
		assert_eq!(next.as_deref(), Some("Merge"));
		let md = kinds_map_to_markdown(&map, &kinds, next.as_deref());
		assert!(md.contains("## paths_read"));
		assert!(md.contains("## Recommended next parent steps"));
	}

	#[test]
	fn write_bundle_creates_artifacts_and_index() {
		let dir = tempfile::tempdir().unwrap();
		let root = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
		let report = "## paths_read\n- src/a.ts\n\n## file_summaries\nAuth helper lives in src/a.ts\n\n## gaps\nMissing refresh coverage in src/a.ts\n";
		let kinds = vec![
			ExploreReturnKind::PathsRead,
			ExploreReturnKind::FileSummaries,
			ExploreReturnKind::Gaps,
		];
		let w = write_explore_bundle(
			&root,
			"ses_test",
			Some("Map auth"),
			None,
			&kinds,
			&ExploreReturnOptions::default(),
			report,
			None,
			false,
		)
		.unwrap();
		assert!(w.explore_id.starts_with("exp_"));
		assert!(
			w.kinds_incomplete.is_empty(),
			"unexpected incomplete: {:?}",
			w.kinds_incomplete
		);
		assert_eq!(w.artifacts.len(), 3);
		let abs = root.join(&w.report_path);
		assert!(abs.exists());
		let listed = drox_tools::list_index_entries(&root, "ses_test").unwrap();
		assert_eq!(listed.len(), 1);
		assert!(drox_tools::list_index_entries(&root, "ses_other")
			.unwrap()
			.is_empty());
	}

	#[test]
	fn write_bundle_from_json_map() {
		let dir = tempfile::tempdir().unwrap();
		let root = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
		let mut map = BTreeMap::new();
		map.insert("paths_read".into(), "- src/a.ts\n- src/b.ts".into());
		map.insert("gaps".into(), "Missing refresh tests".into());
		let kinds = vec![ExploreReturnKind::PathsRead, ExploreReturnKind::Gaps];
		let md = kinds_map_to_markdown(&map, &kinds, Some("Merge and act"));
		let w = write_explore_bundle(
			&root,
			"ses_json",
			None,
			None,
			&kinds,
			&ExploreReturnOptions::default(),
			&md,
			Some(&map),
			false,
		)
		.unwrap();
		assert!(w.kinds_incomplete.is_empty());
		let paths_file = root.join(w.artifacts.get("paths_read").unwrap());
		let body = std::fs::read_to_string(paths_file).unwrap();
		assert!(body.contains("src/a.ts"));
	}

	#[test]
	fn incomplete_kind_sets_flag() {
		let dir = tempfile::tempdir().unwrap();
		let root = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
		let report = "## paths_read\n- src/only.ts\n";
		let kinds = vec![ExploreReturnKind::PathsRead, ExploreReturnKind::Gaps];
		let w = write_explore_bundle(
			&root,
			"ses_x",
			None,
			None,
			&kinds,
			&ExploreReturnOptions::default(),
			report,
			None,
			false,
		)
		.unwrap();
		assert_eq!(w.kinds_incomplete, vec!["gaps".to_string()]);
	}

	#[test]
	fn stub_section_counts_incomplete() {
		let dir = tempfile::tempdir().unwrap();
		let root = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
		let report = "## paths_read\nTBD\n\n## gaps\nReal gap: no tests for refresh token path.\n";
		let kinds = vec![ExploreReturnKind::PathsRead, ExploreReturnKind::Gaps];
		let w = write_explore_bundle(
			&root,
			"ses_stub",
			None,
			None,
			&kinds,
			&ExploreReturnOptions::default(),
			report,
			None,
			false,
		)
		.unwrap();
		assert_eq!(w.kinds_incomplete, vec!["paths_read".to_string()]);
	}
}
