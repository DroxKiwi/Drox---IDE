//! Runner cascade **materialize/fill** — un tour LLM par kind demandé.
//!
//! **Legacy / non nominal** depuis Option A (`explore_commit` + L0). Conservé pour
//! réactivation éventuelle ; le chemin nominal est `explore_executor` assemble.
//!
//! Contrat structurel uniquement : JSON parseable + clé kind présente + valeur non vide.
//! Pas d’heuristique lexicale. Échec d’un kind → skip (assemble marquera incomplete).

#![allow(dead_code)]

use std::collections::BTreeMap;

use drox_llm::{ChatOptions, LlmClient};
use drox_prompts::FILL_KIND_SYSTEM;
use drox_tools::{ExploreReturnKind, ExploreReturnOptions};
use drox_types::{Message, StreamEvent};
use futures::StreamExt;
use tracing::{debug, warn};

use super::explore_artifact::{kind_body_usable, parse_explore_report_json};
use super::report::strip_phase_markers;

/// Template JSON à une clé (contrat de forme).
#[must_use]
pub(super) fn json_template_for_kind(kind: &str) -> String {
	format!(
		"{{\"{kind}\":\"\",\"recommended_next_parent_steps\":\"\"}}"
	)
}

fn fill_user_message(
	kind: &str,
	notes: &str,
	prior: &BTreeMap<String, String>,
	hit_max: bool,
	options: &ExploreReturnOptions,
) -> String {
	let ceiling = if hit_max {
		"Phase 1 hit its tool-turn ceiling. Still fill this one kind from the notes."
	} else {
		"Fill this one return kind from the notes."
	};
	let notes_block = if notes.trim().is_empty() {
		"(no evidence notes — leave the kind value empty if you cannot fill truthfully)"
	} else {
		notes
	};
	let mut prior_block = String::new();
	if !prior.is_empty() {
		prior_block.push_str("\n\n## Prior kind bodies (already filled — use as context, do not repeat blindly)\n");
		for (k, v) in prior {
			let clipped = if v.chars().count() > 1_200 {
				let c: String = v.chars().take(1_200).collect();
				format!("{c}…")
			} else {
				v.clone()
			};
			prior_block.push_str("### ");
			prior_block.push_str(k);
			prior_block.push('\n');
			prior_block.push_str(&clipped);
			prior_block.push('\n');
		}
	}
	let caps = serde_json::to_string(options).unwrap_or_else(|_| "{}".into());
	let template = json_template_for_kind(kind);
	format!(
		"{ceiling}\n\n\
## Evidence notes\n{notes_block}{prior_block}\n\n\
## Output contract\n\
Fill **only** the `{kind}` string (and optional `recommended_next_parent_steps`).\n\
Start from this template and replace empty strings with facts:\n\
{template}\n\
Honor caps when present: {caps}\n\
Reply with the JSON object only. First character `{{`. No prose before or after."
	)
}

/// Un tour fill pour un kind. `Ok(None)` = échec structurel (incomplete plus tard).
pub(super) async fn fill_one_kind(
	llm: &dyn LlmClient,
	chat_options: &ChatOptions,
	report_think: bool,
	kind: ExploreReturnKind,
	notes: &str,
	prior: &BTreeMap<String, String>,
	hit_max: bool,
	options: &ExploreReturnOptions,
) -> Option<(String, Option<String>)> {
	let key = kind.as_str();
	let user = fill_user_message(key, notes, prior, hit_max, options);
	let messages = vec![
		Message::system(FILL_KIND_SYSTEM),
		Message::user(user),
	];
	let opts = chat_options
		.clone()
		.with_tools(Vec::new())
		.with_think(Some(report_think));
	let mut stream = match llm.stream_chat(messages, opts).await {
		Ok(s) => s,
		Err(e) => {
			warn!(kind = key, error = %e, "cascade fill stream start failed");
			return None;
		}
	};
	let mut out = String::new();
	while let Some(ev) = stream.next().await {
		match ev {
			Ok(StreamEvent::TextDelta { text }) => out.push_str(&text),
			Ok(StreamEvent::Stop { .. }) => break,
			Ok(_) => {}
			Err(e) => {
				warn!(kind = key, error = %e, "cascade fill stream error");
				return None;
			}
		}
	}
	let cleaned = strip_phase_markers(out.trim());
	if cleaned.is_empty() {
		debug!(kind = key, "cascade fill empty");
		return None;
	}
	let kinds = vec![kind];
	let (map, next) = match parse_explore_report_json(&cleaned, &kinds) {
		Ok(v) => v,
		Err(e) => {
			debug!(kind = key, error = %e, "cascade fill JSON rejected — retry once");
			return fill_one_kind_retry(
				llm,
				chat_options,
				report_think,
				kind,
				notes,
				prior,
				hit_max,
				options,
				&e,
			)
			.await;
		}
	};
	let body = map.get(key).map(|s| s.trim().to_string()).unwrap_or_default();
	if !kind_body_usable(&body) {
		debug!(kind = key, "cascade fill body empty/placeholder");
		return None;
	}
	Some((body, next))
}

async fn fill_one_kind_retry(
	llm: &dyn LlmClient,
	chat_options: &ChatOptions,
	report_think: bool,
	kind: ExploreReturnKind,
	notes: &str,
	prior: &BTreeMap<String, String>,
	hit_max: bool,
	options: &ExploreReturnOptions,
	first_err: &str,
) -> Option<(String, Option<String>)> {
	let key = kind.as_str();
	let mut user = fill_user_message(key, notes, prior, hit_max, options);
	user.push_str("\n\nPREVIOUS OUTPUT REJECTED (");
	user.push_str(first_err);
	user.push_str("). Reply with ONLY the JSON object. First char `{`.");
	let messages = vec![
		Message::system(FILL_KIND_SYSTEM),
		Message::user(user),
	];
	let opts = chat_options
		.clone()
		.with_tools(Vec::new())
		.with_think(Some(report_think));
	let mut stream = match llm.stream_chat(messages, opts).await {
		Ok(s) => s,
		Err(e) => {
			warn!(kind = key, error = %e, "cascade fill retry start failed");
			return None;
		}
	};
	let mut out = String::new();
	while let Some(ev) = stream.next().await {
		match ev {
			Ok(StreamEvent::TextDelta { text }) => out.push_str(&text),
			Ok(StreamEvent::Stop { .. }) => break,
			Ok(_) => {}
			Err(e) => {
				warn!(kind = key, error = %e, "cascade fill retry stream error");
				return None;
			}
		}
	}
	let cleaned = strip_phase_markers(out.trim());
	let kinds = vec![kind];
	let (map, next) = parse_explore_report_json(&cleaned, &kinds).ok()?;
	let body = map.get(key).map(|s| s.trim().to_string()).unwrap_or_default();
	if !kind_body_usable(&body) {
		return None;
	}
	Some((body, next))
}

/// Remplit tous les kinds demandés (ordre parent). Retourne map + dernier next-steps.
pub(super) async fn materialize_kinds_cascade(
	llm: &dyn LlmClient,
	chat_options: &ChatOptions,
	report_think: bool,
	kinds: &[ExploreReturnKind],
	notes: &str,
	hit_max: bool,
	options: &ExploreReturnOptions,
) -> (BTreeMap<String, String>, Option<String>) {
	let mut map = BTreeMap::new();
	let mut last_next: Option<String> = None;
	debug!(
		marker = "c5b.cascade_fill",
		kinds = ?kinds.iter().map(|k| k.as_str()).collect::<Vec<_>>(),
		notes_chars = notes.chars().count(),
		"dogfood: Explore materialize = fill-per-kind cascade"
	);
	for kind in kinds {
		match fill_one_kind(
			llm,
			chat_options,
			report_think,
			*kind,
			notes,
			&map,
			hit_max,
			options,
		)
		.await
		{
			Some((body, next)) => {
				if let Some(n) = next.filter(|s| !s.trim().is_empty()) {
					last_next = Some(n);
				}
				map.insert(kind.as_str().to_string(), body);
			}
			None => {
				debug!(kind = kind.as_str(), "cascade fill skipped — incomplete later");
			}
		}
	}
	(map, last_next)
}
