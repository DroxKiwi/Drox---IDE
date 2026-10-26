//! Slim outcome `task` pour le parent LLM (C2 merge inject).

use serde_json::{Map, Value};
use tracing::debug;

use crate::agent::config::EngineProfile;

/// Plafonds LLM pour outcome `task` — détail = `artifacts_inline` + fichiers kind.
pub(super) const TASK_SUMMARY_MAX_CHARS: usize = 700;
pub(super) const TASK_BLURB_MAX_CHARS: usize = 200;
pub(super) const TASK_INLINE_KIND_MAX_CHARS: usize = 1_800;
/// Profils locaux : rapport kinds inline (~1,5k tokens) au lieu de pointeurs.
pub(super) const TASK_REPORT_INLINE_MAX_CHARS: usize = 6_000;

/// Retire `report` éventuel, borne summary/blurb/`artifacts_inline`.
#[cfg(test)]
#[must_use]
pub(crate) fn slim_task_tool_result_for_llm(value: &Value) -> Value {
	slim_task_tool_result_for_profile(value, EngineProfile::CloudFull)
}

/// `cloud-full` : slim 1.6.0. Profils locaux : `report` inline borné, sans
/// doublon `artifacts_inline` (et sans chemins kind en `local-9b`).
#[must_use]
pub(crate) fn slim_task_tool_result_for_profile(value: &Value, profile: EngineProfile) -> Value {
	let mut obj = match value {
		Value::Object(map) => map.clone(),
		other => {
			return other.clone();
		}
	};
	if profile.is_local() {
		if let Some(Value::String(report)) = obj.get("report") {
			if !report.trim().is_empty() {
				obj.remove("artifacts_inline");
				if profile == EngineProfile::Local9b {
					obj.remove("artifacts");
				}
				obj.remove("report_path");
				clamp_string_field(&mut obj, "report", TASK_REPORT_INLINE_MAX_CHARS);
				clamp_string_field(&mut obj, "summary", TASK_SUMMARY_MAX_CHARS);
				clamp_string_field(&mut obj, "blurb", TASK_BLURB_MAX_CHARS);
				debug!(
					marker = "c2.slim_task_inline_report",
					profile = profile.id(),
					"dogfood: task outcome inline report for local profile"
				);
				return Value::Object(obj);
			}
		}
	}
	let had_report = obj.remove("report").is_some();
	obj.remove("report_path");
	clamp_string_field(&mut obj, "summary", TASK_SUMMARY_MAX_CHARS);
	clamp_string_field(&mut obj, "blurb", TASK_BLURB_MAX_CHARS);
	clamp_artifacts_inline(&mut obj);
	if !obj.contains_key("summary") {
		if obj
			.get("artifacts_inline")
			.and_then(|v| v.as_object())
			.is_some_and(|m| !m.is_empty())
		{
			obj.insert(
				"summary".into(),
				Value::String("See artifacts_inline (merge from kind bodies).".into()),
			);
		} else if let Some(arts) = obj.get("artifacts").and_then(|v| v.as_object()) {
			if let Some((_, path)) = arts.iter().next() {
				if let Some(p) = path.as_str() {
					obj.insert(
						"summary".into(),
						Value::String(format!("See artifacts (e.g. {p}) / explore_artifact_read")),
					);
				}
			}
		}
	}
	let inline_n = obj
		.get("artifacts_inline")
		.and_then(|v| v.as_object())
		.map(|m| m.len())
		.unwrap_or(0);
	debug!(
		marker = "c2.slim_task",
		had_report,
		inline_n,
		summary_len = obj.get("summary").and_then(|v| v.as_str()).map(|s| s.len()),
		blurb_len = obj.get("blurb").and_then(|v| v.as_str()).map(|s| s.len()),
		"dogfood: task outcome slimmed for parent LLM"
	);
	Value::Object(obj)
}

fn clamp_artifacts_inline(obj: &mut Map<String, Value>) {
	let Some(Value::Object(map)) = obj.get_mut("artifacts_inline") else {
		return;
	};
	let keys: Vec<String> = map.keys().cloned().collect();
	for key in keys {
		let Some(Value::String(s)) = map.get(&key) else {
			continue;
		};
		if s.chars().count() <= TASK_INLINE_KIND_MAX_CHARS {
			continue;
		}
		let clipped: String = s.chars().take(TASK_INLINE_KIND_MAX_CHARS).collect();
		map.insert(key, Value::String(format!("{clipped}…")));
	}
}

fn clamp_string_field(obj: &mut Map<String, Value>, key: &str, max_chars: usize) {
	let Some(Value::String(s)) = obj.get(key) else {
		return;
	};
	if s.chars().count() <= max_chars {
		return;
	}
	let clipped: String = s.chars().take(max_chars).collect();
	obj.insert(key.into(), Value::String(format!("{clipped}…")));
}
