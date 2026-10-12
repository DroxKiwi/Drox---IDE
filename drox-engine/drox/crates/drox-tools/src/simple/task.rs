/*---------------------------------------------------------------------------------------------
 * Task tool — Cursor-aligned description (when / when-not).
 *--------------------------------------------------------------------------------------------*/

//! Tool `task` — délègue une exploration en lecture seule à un sous-agent (§2.10).
//!
//! Désactivé par défaut (`drox.subagents.enabled` / `subagentsEnabled` JSON-RPC).
//! V1 : seul `subagent_type: explore` est supporté.

use std::any::Any;
use std::panic::AssertUnwindSafe;

use async_trait::async_trait;
use futures::FutureExt;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::ToolError;
use crate::subagent::{
	format_kinds_contract, parse_return_kinds, ExploreRequest, ExploreReturnOptions,
};
use crate::tool::Tool;
use crate::tool_context::ToolContext;

fn panic_payload_message(payload: Box<dyn Any + Send>) -> String {
	if let Some(s) = payload.downcast_ref::<&str>() {
		(*s).to_string()
	} else if let Some(s) = payload.downcast_ref::<String>() {
		s.clone()
	} else {
		"unknown panic".into()
	}
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TaskInput {
	/// Short concrete UI mission label only (≤8 words). Examples: "Map docs/pedagogie", \
	/// "Audit src/app/docs page". NEVER put meta text here ("sub-agent does not see this chat", \
	/// "Mission double", "pack all context", thoroughness notes).
	#[serde(default)]
	pub title: Option<String>,
	/// Short mission scoop for the sub-agent (it does NOT see the parent chat). \
	/// Goal + likely folders/symbols only — **not** an essay. Engine caps at \
	/// [`EXPLORE_TASK_DESCRIPTION_MAX_CHARS`] chars before kinds/must_return. \
	/// One focused mission per `task` call.
	pub description: String,
	/// Typed return formats the engine verifies as separate artifacts. Prefer always. \
	/// Values: paths_read | file_summaries | key_symbols | code_snippets | structure_map | gaps.
	#[serde(default)]
	pub return_kinds: Vec<String>,
	/// Optional caps / focus for the return kinds (maxFiles, maxCharsPerFile, …).
	#[serde(default)]
	pub return_options: ExploreReturnOptions,
	/// Acceptance criteria (legacy prose) the parent still wants in the report. Prefer \
	/// `return_kinds` for machine-checked formats; keep this for free-text extras.
	#[serde(default)]
	pub must_return: Vec<String>,
	/// Optional id linking this Explore to a `todo_write` step (session plan).
	#[serde(default)]
	pub plan_step_id: Option<String>,
	/// Sub-agent type. V1: only `explore`.
	#[serde(default = "default_subagent_type")]
	pub subagent_type: String,
	/// Search depth: `quick` | `medium` (default) | `very thorough`.
	#[serde(default = "default_thoroughness")]
	pub thoroughness: Option<String>,
}

fn default_subagent_type() -> String {
	"explore".to_string()
}

fn default_thoroughness() -> Option<String> {
	Some("medium".to_string())
}

/// LLMs often pass nested objects as a **JSON string** (`"{\"maxFiles\":25}"`).
/// Coerce `return_options` / `returnOptions` to a real object before serde.
fn normalize_task_input(input: Value) -> Value {
	let Value::Object(mut obj) = input else {
		return input;
	};
	let raw = obj
		.remove("return_options")
		.or_else(|| obj.remove("returnOptions"));
	if let Some(raw) = raw {
		let normalized = match raw {
			Value::String(s) => {
				let trimmed = s.trim();
				if trimmed.is_empty() {
					Value::Object(Default::default())
				} else if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
					parsed
				} else {
					// Keep original so serde surfaces a clear type error.
					Value::String(s)
				}
			}
			other => other,
		};
		obj.insert("return_options".into(), normalized);
	}
	Value::Object(obj)
}

/// Cursor-style tool policy — source : [`drox_prompts::TASK_TOOL_DESCRIPTION`].
pub use drox_prompts::TASK_TOOL_DESCRIPTION;

pub struct TaskTool;

/// Plafond description parent → enfant (romans rejetés / tronqués).
pub const EXPLORE_TASK_DESCRIPTION_MAX_CHARS: usize = 900;

/// Max items `must_return` collés (extras libres).
pub const EXPLORE_TASK_MUST_RETURN_MAX_ITEMS: usize = 6;

/// Max chars par item `must_return`.
pub const EXPLORE_TASK_MUST_RETURN_ITEM_MAX_CHARS: usize = 120;

fn truncate_head_chars(s: &str, max_chars: usize) -> String {
	let t = s.trim();
	if t.chars().count() <= max_chars {
		return t.to_string();
	}
	let clipped: String = t.chars().take(max_chars).collect();
	if let Some(i) = clipped.rfind('\n') {
		if i > max_chars / 3 {
			return format!("{}\n…", clipped[..i].trim_end());
		}
	}
	format!("{}…", clipped.trim_end())
}

/// Normalise la mission phase 1 : scoop court (sans contrat kinds).
#[must_use]
pub fn normalize_explore_task_description(description: &str) -> String {
	truncate_head_chars(description, EXPLORE_TASK_DESCRIPTION_MAX_CHARS)
}

fn build_child_description(
	description: &str,
	must_return: &[String],
	kinds_contract: &str,
) -> String {
	let base = normalize_explore_task_description(description);
	let mut out = base;
	if !kinds_contract.trim().is_empty() {
		out.push_str("\n\n");
		out.push_str(kinds_contract.trim());
	}
	let items: Vec<String> = must_return
		.iter()
		.map(|s| s.trim())
		.filter(|s| !s.is_empty())
		.take(EXPLORE_TASK_MUST_RETURN_MAX_ITEMS)
		.map(|s| truncate_head_chars(s, EXPLORE_TASK_MUST_RETURN_ITEM_MAX_CHARS))
		.collect();
	if !items.is_empty() {
		out.push_str("\n\n## Must return to parent (acceptance — free-text extras)\n");
		for item in &items {
			out.push_str("- ");
			out.push_str(item);
			out.push('\n');
		}
	}
	out
}

#[async_trait]
impl Tool for TaskTool {
	fn name(&self) -> &str {
		"task"
	}

	fn description(&self) -> &str {
		TASK_TOOL_DESCRIPTION
	}

	fn input_schema(&self) -> Value {
		serde_json::to_value(schemars::schema_for!(TaskInput)).unwrap_or(Value::Null)
	}

	fn is_read_only(&self) -> bool {
		true
	}

	fn is_concurrency_safe(&self) -> bool {
		true
	}

	async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
		let settings = ctx
			.subagent_settings
			.as_ref()
			.cloned()
			.unwrap_or_default();
		if !settings.enabled {
			return Err(ToolError::invalid_args(
				"Sub-agents disabled. Enable `drox.subagents.enabled` in VS Code settings \
                 to use `task`.",
			));
		}
		let executor = ctx.subagent_executor.as_ref().ok_or_else(|| {
			ToolError::invalid_args(
				"Sub-agents not configured for this run (missing executor on the engine side).",
			)
		})?;
		let args: TaskInput = serde_json::from_value(normalize_task_input(input))?;
		if args.description.trim().is_empty() {
			return Err(ToolError::invalid_args("description must not be empty"));
		}
		let kind = args.subagent_type.trim().to_ascii_lowercase();
		if kind != "explore" {
			return Err(ToolError::invalid_args(format!(
				"unknown subagent_type `{kind}` — V1 only supports `explore`"
			)));
		}
		let thoroughness = args
			.thoroughness
			.as_deref()
			.map(str::trim)
			.filter(|s| !s.is_empty())
			.map(|s| s.to_string())
			.or_else(|| Some("medium".to_string()));
		let title = args
			.title
			.as_deref()
			.map(str::trim)
			.filter(|s| !s.is_empty())
			.map(str::to_string);
		let plan_step = args
			.plan_step_id
			.as_deref()
			.map(str::trim)
			.filter(|s| !s.is_empty())
			.map(str::to_string);
		let return_kinds = parse_return_kinds(&args.return_kinds);
		let kinds_contract = format_kinds_contract(&return_kinds, &args.return_options);
		let child_desc =
			build_child_description(&args.description, &args.must_return, &kinds_contract);
		let request = ExploreRequest {
			description: child_desc,
			thoroughness,
			title,
			plan_step_id: plan_step,
			must_return: args.must_return.clone(),
			return_kinds,
			return_options: args.return_options.clone(),
		};
		let outcome = match AssertUnwindSafe(executor.run_explore(request, ctx))
			.catch_unwind()
			.await
		{
			Ok(Ok(o)) => o,
			Ok(Err(e)) => return Err(e),
			Err(payload) => {
				let detail = panic_payload_message(payload);
				return Err(ToolError::remote(format!(
					"explore subagent panicked: {detail}"
				)));
			}
		};
		Ok(json!({
			"subagent_type": "explore",
			"explore_id": outcome.explore_id,
			"summary": outcome.summary,
			"blurb": outcome.blurb,
			"artifacts": outcome.artifacts,
			"artifacts_inline": outcome.artifacts_inline,
			"kinds_incomplete": outcome.kinds_incomplete,
			"truncated": outcome.truncated,
			"status": outcome.status,
			"iterations_used": outcome.iterations_used,
			"max_iterations": outcome.max_iterations,
			"return_kinds": args.return_kinds,
			"must_return": args.must_return,
			"plan_step_id": args.plan_step_id,
			"merge_hint": "Merge from artifacts_inline (and artifacts paths). Do not re-file_read covered sources; needle 1–2 lines OK. Zoom: explore_artifact_read.",
		}))
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn description_mentions_return_kinds_and_index() {
		assert!(TASK_TOOL_DESCRIPTION.contains("return_kinds"));
		assert!(TASK_TOOL_DESCRIPTION.contains("explore_index_list"));
		assert!(TASK_TOOL_DESCRIPTION.contains("session"));
		assert!(TASK_TOOL_DESCRIPTION.contains("paths_read"));
		assert!(TASK_TOOL_DESCRIPTION.contains("never a stringified JSON string"));
	}

	#[test]
	fn build_child_includes_kinds_and_must_return() {
		let contract = format_kinds_contract(
			&parse_return_kinds(&["paths_read".into(), "gaps".into()]),
			&ExploreReturnOptions::default(),
		);
		let d = build_child_description("Map docs/x", &["tone".into()], &contract);
		assert!(d.contains("Map docs/x"));
		assert!(d.contains("paths_read"));
		assert!(d.contains("tone"));
	}

	#[test]
	fn build_child_caps_long_parent_description() {
		let novel = format!(
			"{}\n\nRetour attendu: structure_map, file_summaries, and a long essay about design.",
			"Mission detail paragraph. ".repeat(80)
		);
		assert!(novel.chars().count() > EXPLORE_TASK_DESCRIPTION_MAX_CHARS);
		let capped = normalize_explore_task_description(&novel);
		assert!(capped.chars().count() <= EXPLORE_TASK_DESCRIPTION_MAX_CHARS + 1);
		let contract = format_kinds_contract(
			&parse_return_kinds(&["gaps".into()]),
			&ExploreReturnOptions::default(),
		);
		let d = build_child_description(&novel, &[], &contract);
		assert!(d.contains("gaps"));
		assert!(d.starts_with(&capped));
	}

	#[test]
	fn task_is_concurrency_safe_for_fanout() {
		assert!(TaskTool.is_concurrency_safe());
	}

	#[test]
	fn normalize_parses_stringified_return_options() {
		let input = json!({
			"description": "Map docs",
			"return_kinds": ["file_summaries"],
			"return_options": "{\"maxCharsPerFile\": 800, \"maxFiles\": 25, \"maxSnippets\": 6}"
		});
		let args: TaskInput = serde_json::from_value(normalize_task_input(input)).unwrap();
		assert_eq!(args.return_options.max_chars_per_file, Some(800));
		assert_eq!(args.return_options.max_files, Some(25));
		assert_eq!(args.return_options.max_snippets, Some(6));
	}

	#[test]
	fn normalize_keeps_object_return_options() {
		let input = json!({
			"description": "Map docs",
			"return_options": { "maxFiles": 10, "focus": "api" }
		});
		let args: TaskInput = serde_json::from_value(normalize_task_input(input)).unwrap();
		assert_eq!(args.return_options.max_files, Some(10));
		assert_eq!(args.return_options.focus.as_deref(), Some("api"));
	}
}
