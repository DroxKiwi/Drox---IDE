//! Tools parent — navigation index Explore (scope discussion).

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::ToolError;
use crate::subagent::{find_index_entry, list_index_entries, ExploreReturnKind};
use crate::tool::Tool;
use crate::tool_context::ToolContext;

fn require_session_id(ctx: &ToolContext) -> Result<&str, ToolError> {
	ctx.chat_session_id
		.as_deref()
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.ok_or_else(|| {
			ToolError::invalid_args(
				"explore index tools require a chat session id (ses_…) — scoped to this discussion",
			)
		})
}

// ── explore_index_list ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ExploreIndexListInput {
	/// Max entries to return (newest last in file; returned newest-first). Default 20.
	#[serde(default)]
	pub limit: Option<u32>,
}

pub struct ExploreIndexListTool;

#[async_trait]
impl Tool for ExploreIndexListTool {
	fn name(&self) -> &str {
		"explore_index_list"
	}

	fn description(&self) -> &str {
		drox_prompts::EXPLORE_INDEX_LIST_TOOL_DESCRIPTION
	}

	fn input_schema(&self) -> Value {
		serde_json::to_value(schemars::schema_for!(ExploreIndexListInput)).unwrap_or(Value::Null)
	}

	fn is_read_only(&self) -> bool {
		true
	}

	async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
		let args: ExploreIndexListInput = serde_json::from_value(input)?;
		let session_id = require_session_id(ctx)?;
		let limit = args.limit.unwrap_or(20).clamp(1, 100) as usize;
		let mut entries = list_index_entries(&ctx.effective_workspace(), session_id)
			.map_err(|e| ToolError::io(ctx.effective_workspace(), e))?;
		entries.reverse(); // newest first
		entries.truncate(limit);
		let items: Vec<Value> = entries
			.into_iter()
			.map(|e| {
				json!({
					"exploreId": e.explore_id,
					"title": e.title,
					"blurb": e.blurb,
					"returnKinds": e.return_kinds,
					"status": e.status,
					"truncated": e.truncated,
					"artifacts": e.artifacts,
					"reportPath": e.report_path,
					"createdAt": e.created_at,
				})
			})
			.collect();
		Ok(json!({
			"sessionId": session_id,
			"count": items.len(),
			"entries": items,
		}))
	}
}

// ── explore_artifact_read ───────────────────────────────────────────────────

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ExploreArtifactReadInput {
	/// Id returned by `task` / `explore_index_list` (`exp_…`).
	pub explore_id: String,
	/// One of: paths_read | file_summaries | key_symbols | code_snippets | structure_map | gaps
	pub kind: String,
}

pub struct ExploreArtifactReadTool;

#[async_trait]
impl Tool for ExploreArtifactReadTool {
	fn name(&self) -> &str {
		"explore_artifact_read"
	}

	fn description(&self) -> &str {
		drox_prompts::EXPLORE_ARTIFACT_READ_TOOL_DESCRIPTION
	}

	fn input_schema(&self) -> Value {
		serde_json::to_value(schemars::schema_for!(ExploreArtifactReadInput)).unwrap_or(Value::Null)
	}

	fn is_read_only(&self) -> bool {
		true
	}

	async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
		let args: ExploreArtifactReadInput = serde_json::from_value(input).map_err(|e| {
			artifact_read_recovery(format!("invalid args for explore_artifact_read: {e}"))
		})?;
		let session_id = require_session_id(ctx).map_err(|e| {
			artifact_read_recovery(e.to_string())
		})?;
		let explore_id = args.explore_id.trim();
		if explore_id.is_empty() {
			return Err(artifact_read_recovery(
				"explore_id must not be empty".into(),
			));
		}
		let kind = ExploreReturnKind::parse(&args.kind).ok_or_else(|| {
			artifact_read_recovery(format!(
				"unknown kind `{}` — use paths_read|file_summaries|key_symbols|code_snippets|structure_map|gaps",
				args.kind.trim()
			))
		})?;
		let ws = ctx.effective_workspace();
		let entry = find_index_entry(&ws, session_id, explore_id)
			.map_err(|e| {
				artifact_read_recovery(format!("index io error for explore_id `{explore_id}`: {e}"))
			})?
			.ok_or_else(|| {
				artifact_read_recovery(format!(
					"explore_id `{explore_id}` not found in this discussion's Explore index"
				))
			})?;
		let rel = entry.artifacts.get(kind.as_str()).ok_or_else(|| {
			artifact_read_recovery(format!(
				"kind `{}` not present for explore_id `{explore_id}` — check artifacts map / kinds_incomplete",
				kind.as_str()
			))
		})?;
		let abs = ws.join(rel);
		ctx.deny_if_drox_ignored(&abs).map_err(|e| {
			artifact_read_recovery(format!("{e}"))
		})?;
		let content = tokio::fs::read_to_string(abs.as_std_path())
			.await
			.map_err(|e| {
				artifact_read_recovery(format!("cannot read kind file `{rel}`: {e}"))
			})?;
		Ok(json!({
			"exploreId": explore_id,
			"sessionId": session_id,
			"kind": kind.as_str(),
			"path": rel,
			"content": content,
			"blurb": entry.blurb,
			"merge_hint": "Use this body (or artifacts_inline). Do not file_read this path again — act next.",
		}))
	}
}

/// Erreur `explore_artifact_read` + recovery soft (anti `file_read` kind).
fn artifact_read_recovery(msg: String) -> ToolError {
	ToolError::invalid_args(format!(
		"{msg}. Recovery: prefer `artifacts_inline` from the last `task` result, or retry \
		 explore_artifact_read once with explore_id+kind. Do NOT file_read \
		 `.drox/subagents/…/<kind>.md` (re-inflates) — skeleton file_write/file_edit instead."
	))
}
