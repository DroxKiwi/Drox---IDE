//! Tool `explore_commit` — dépose un kind Explore via le canal tools (Option A).
//!
//! Pendant la phase exécution, l’enfant appelle ce tool après chaque lot
//! d’évidence utile. Le moteur assemble les artefacts à la fin — **pas** de
//! tour JSON prose.

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::ToolError;
use crate::subagent::{ExploreReturnKind, MAX_COMMIT_BODY_CHARS};
use crate::tool::Tool;
use crate::tool_context::ToolContext;

/// Payload `explore_commit`.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct ExploreCommitInput {
	/// Kind demandé par le parent : `paths_read`, `file_summaries`, `structure_map`,
	/// `key_symbols`, `code_snippets`, `gaps`.
	pub kind: String,
	/// Corps markdown pour ce kind (faits, listes, chemins). Pas de CoT.
	pub body: String,
	/// Si `true`, concatène au corps déjà commité pour ce kind. Défaut : replace.
	#[serde(default)]
	pub append: bool,
}

/// Tool local Explore-only `explore_commit`.
pub struct ExploreCommitTool;

#[async_trait]
impl Tool for ExploreCommitTool {
	fn name(&self) -> &str {
		"explore_commit"
	}

	fn description(&self) -> &str {
		drox_prompts::EXPLORE_COMMIT_TOOL_DESCRIPTION
	}

	fn input_schema(&self) -> Value {
		serde_json::to_value(schemars::schema_for!(ExploreCommitInput)).unwrap_or(Value::Null)
	}

	fn is_read_only(&self) -> bool {
		true
	}

	fn is_concurrency_safe(&self) -> bool {
		// Mutations sur le handle partagé — sérialiser.
		false
	}

	async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
		let args: ExploreCommitInput = serde_json::from_value(input).map_err(|e| {
			ToolError::invalid_args(format!(
				"explore_commit: invalid JSON ({e}). Expected \
                 {{\"kind\":\"paths_read|file_summaries|…\",\"body\":\"…\",\"append\"?:bool}}."
			))
		})?;
		let Some(kind) = ExploreReturnKind::parse(&args.kind) else {
			return Err(ToolError::invalid_args(format!(
				"explore_commit: unknown kind `{}`. Valid: paths_read, file_summaries, \
                 key_symbols, code_snippets, structure_map, gaps.",
				args.kind.trim()
			)));
		};
		let Some(handle) = ctx.explore_commit.as_ref() else {
			return Err(ToolError::invalid_args(
				"explore_commit: unavailable outside Explore child (no commit backend wired)",
			));
		};
		let (body_chars, kinds_committed) = handle
			.commit(kind, args.body, args.append)
			.map_err(ToolError::invalid_args)?;
		Ok(json!({
			"committed": true,
			"kind": kind.as_str(),
			"append": args.append,
			"body_chars": body_chars,
			"kinds_committed": kinds_committed,
			"max_body_chars": MAX_COMMIT_BODY_CHARS,
		}))
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::subagent::{ExploreCommitHandle, ExploreReturnKind};
	use camino::Utf8PathBuf;

	fn ctx(handle: ExploreCommitHandle) -> ToolContext {
		ToolContext::new(Utf8PathBuf::from("/tmp"), false).with_explore_commit(handle)
	}

	#[tokio::test]
	async fn commits_kind() {
		let h = ExploreCommitHandle::new(vec![ExploreReturnKind::Gaps]);
		let out = ExploreCommitTool
			.execute(
				&ctx(h.clone()),
				json!({"kind": "gaps", "body": "- no tests for refresh"}),
			)
			.await
			.unwrap();
		assert_eq!(out["committed"], true);
		assert_eq!(out["kind"], "gaps");
		assert!(h.snapshot().bodies["gaps"].contains("refresh"));
	}

	#[tokio::test]
	async fn rejects_unknown_kind() {
		let h = ExploreCommitHandle::new(vec![]);
		let err = ExploreCommitTool
			.execute(&ctx(h), json!({"kind": "nope", "body": "x"}))
			.await
			.unwrap_err();
		assert!(matches!(err, ToolError::InvalidArgs(_)));
	}

	#[tokio::test]
	async fn errors_without_handle() {
		let ctx = ToolContext::new(Utf8PathBuf::from("/tmp"), false);
		let err = ExploreCommitTool
			.execute(&ctx, json!({"kind": "gaps", "body": "x"}))
			.await
			.unwrap_err();
		assert!(matches!(err, ToolError::InvalidArgs(ref m) if m.contains("unavailable")));
	}
}
