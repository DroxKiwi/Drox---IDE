/*---------------------------------------------------------------------------------------------
 * Task tool — Cursor-aligned description (when / when-not).
 *--------------------------------------------------------------------------------------------*/

//! Tool `task` — délègue une exploration en lecture seule à un sous-agent (§2.10).
//!
//! Désactivé par défaut (`drox.subagents.enabled` / `subagentsEnabled` JSON-RPC).
//! V1 : seul `subagent_type: explore` est supporté.

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::tool_context::ToolContext;
use crate::error::ToolError;
use crate::tool::Tool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TaskInput {
    /// Short concrete UI mission label only (≤8 words). Examples: "Map docs/pedagogie", \
    /// "Audit src/app/docs page". NEVER put meta text here ("sub-agent does not see this chat", \
    /// "Mission double", "pack all context", thoroughness notes).
    #[serde(default)]
    pub title: Option<String>,
    /// Full exploration brief for the sub-agent (it does NOT see the parent chat — that fact \
    /// belongs ONLY here as engine knowledge, never as the `title` or as the first line of this \
    /// field). Include goal, likely folders/symbols. Keep **one focused mission** per `task` call.
    pub description: String,
    /// Acceptance criteria the parent **must** get back in the report to succeed its own mission. \
    /// Session-master contract: the child only returns a synthesis — list every fact/section you \
    /// still need (paths, APIs, tone notes, inventory counts, …). Empty = weaker brief.
    #[serde(default)]
    pub must_return: Vec<String>,
    /// Optional id linking this Explore to a `todo_write` step (session plan).
    #[serde(default)]
    pub plan_step_id: Option<String>,
    /// Sub-agent type. V1: only `explore`.
    #[serde(default = "default_subagent_type")]
    pub subagent_type: String,
    /// Search depth: `quick` | `medium` (default) | `very thorough`.
    /// Use `medium`/`very thorough` for large or unfamiliar trees; `quick` only for a small subtree.
    #[serde(default = "default_thoroughness")]
    pub thoroughness: Option<String>,
}

fn default_subagent_type() -> String {
    "explore".to_string()
}

fn default_thoroughness() -> Option<String> {
    Some("medium".to_string())
}

/// Cursor-style tool policy — source : [`drox_prompts::TASK_TOOL_DESCRIPTION`].
pub use drox_prompts::TASK_TOOL_DESCRIPTION;

pub struct TaskTool;

fn build_child_description(description: &str, must_return: &[String]) -> String {
    let base = description.trim();
    let items: Vec<&str> = must_return
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if items.is_empty() {
        return base.to_string();
    }
    let mut out = String::new();
    out.push_str(base);
    out.push_str("\n\n## Must return to parent (acceptance — include in Findings/Paths/Gaps)\n");
    for item in items {
        out.push_str("- ");
        out.push_str(item);
        out.push('\n');
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
        // Explore is read-only; parent may launch several focused `task` calls in one turn.
        // Engine semaphore still caps parallelism (`maxConcurrent`).
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
        let args: TaskInput = serde_json::from_value(input)?;
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
        let _title = args.title.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let _plan_step = args
            .plan_step_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let child_desc = build_child_description(&args.description, &args.must_return);
        let outcome = executor
            .run_explore(child_desc, thoroughness, ctx)
            .await?;
        // `report` = full markdown for IDE wire; LLM formatter strips it (keeps summary + path).
        Ok(json!({
            "subagent_type": "explore",
            "report": outcome.report,
            "report_path": outcome.report_path,
            "summary": outcome.summary,
            "truncated": outcome.truncated,
            "iterations_used": outcome.iterations_used,
            "max_iterations": outcome.max_iterations,
            "must_return": args.must_return,
            "plan_step_id": args.plan_step_id,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn description_has_session_master_protocol() {
        assert!(TASK_TOOL_DESCRIPTION.contains("session master"));
        assert!(TASK_TOOL_DESCRIPTION.contains("must_return"));
        assert!(TASK_TOOL_DESCRIPTION.contains("Plan"));
        assert!(TASK_TOOL_DESCRIPTION.contains("Assign"));
        assert!(TASK_TOOL_DESCRIPTION.contains("Merge"));
        assert!(TASK_TOOL_DESCRIPTION.contains("truncated"));
        assert!(TASK_TOOL_DESCRIPTION.contains("Needle"));
        assert!(TASK_TOOL_DESCRIPTION.contains("report_path"));
        assert!(TASK_TOOL_DESCRIPTION.contains("conclusion.md"));
    }

    #[test]
    fn build_child_appends_must_return() {
        let d = build_child_description("Map docs/x", &["inventory".into(), "tone".into()]);
        assert!(d.contains("Map docs/x"));
        assert!(d.contains("Must return to parent"));
        assert!(d.contains("inventory"));
        assert!(d.contains("tone"));
    }

    #[test]
    fn task_is_concurrency_safe_for_fanout() {
        assert!(TaskTool.is_concurrency_safe());
    }
}
