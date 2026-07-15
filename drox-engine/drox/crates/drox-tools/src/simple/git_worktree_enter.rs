//! Tool `git_worktree_enter` — crée un worktree isolé et active la session.

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::git_worktree::{WorktreeError, enter_worktree};
use crate::tool::Tool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GitWorktreeEnterInput {
    /// Nom du worktree (segments alphanum / `.` `_` `-`, `/` pour imbriquer).
    /// Aléatoire si omis.
    #[serde(default)]
    pub name: Option<String>,
}

pub struct GitWorktreeEnterTool;

#[async_trait]
impl Tool for GitWorktreeEnterTool {
    fn name(&self) -> &str {
        "git_worktree_enter"
    }

    fn description(&self) -> &str {
        "Creates (or resumes) a git worktree under `.drox/worktrees/<name>/` with a \
         `worktree-<name>` branch, then switches file/bash tools to this \
         worktree for the rest of the run. Use only if the user explicitly requests \
         a worktree. Format: {\"name\": \"feature-x\"} (optional)."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(GitWorktreeEnterInput)).unwrap_or(Value::Null)
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let args: GitWorktreeEnterInput = serde_json::from_value(input).map_err(|e| {
            ToolError::invalid_args(format!("git_worktree_enter: invalid JSON ({e})"))
        })?;
        let name = args.name.as_deref().map(str::trim);
        if let Some(n) = name {
            if n.is_empty() {
                return Err(ToolError::invalid_args("git_worktree_enter: name is empty"));
            }
        }
        let session = enter_worktree(&ctx.workspace_root, name)
            .await
            .map_err(map_worktree_err)?;
        Ok(json!({
            "worktree_path": session.worktree_path.as_str(),
            "worktree_branch": session.worktree_branch,
            "worktree_name": session.worktree_name,
            "main_repo_root": session.main_repo_root.as_str(),
            "message": format!(
                "Active worktree: {} (branch {}). Subsequent file_read/file_write/bash \
                 calls target this directory. Exit with git_worktree_exit.",
                session.worktree_path, session.worktree_branch
            ),
        }))
    }
}

fn map_worktree_err(e: WorktreeError) -> ToolError {
    ToolError::invalid_args(e.to_string())
}
