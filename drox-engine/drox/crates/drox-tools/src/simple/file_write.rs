//! Tool `file_write` — écrit un fichier sous le workspace.

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::fs;

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::agent_output::resolve_write_path_for_agent;
use crate::tool::Tool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct FileWriteInput {
    /// Chemin relatif au workspace ou absolu **sous** le workspace.
    pub path: String,
    /// Contenu UTF-8 à écrire.
    pub content: String,
}

pub struct FileWriteTool;

#[async_trait]
impl Tool for FileWriteTool {
    fn name(&self) -> &str {
        "file_write"
    }

    fn description(&self) -> &str {
        "Write a text file under the workspace. In `apply_fs_writes` mode, writes to disk; otherwise returns a JSON proposal."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(FileWriteInput)).unwrap_or(Value::Null)
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let args: FileWriteInput = serde_json::from_value(input)?;
        let workspace = ctx.effective_workspace();
        let (resolved, redirected) = resolve_write_path_for_agent(
            &workspace,
            &args.path,
            ctx.agent_markdown_root.as_deref(),
            ctx.agent_markdown_filename.as_deref(),
        )?;

        if ctx.plan_mode {
            return Err(ToolError::plan_violation("file_write"));
        }

        if ctx.apply_fs_writes {
            if let Some(parent) = resolved.parent() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| ToolError::io(parent.to_owned(), e))?;
            }
            fs::write(&resolved, args.content.as_bytes())
                .await
                .map_err(|e| ToolError::io(resolved.clone(), e))?;
            let mut out = json!({
                "applied": true,
                "path": resolved.as_str(),
                "bytes_written": args.content.len(),
            });
            if redirected {
                out["agent_output_redirect"] = json!(true);
                out["requested_path"] = json!(args.path);
            }
            Ok(out)
        } else {
            let mut out = json!({
                "applied": false,
                "proposed": true,
                "path": resolved.as_str(),
                "content": args.content,
            });
            if redirected {
                out["agent_output_redirect"] = json!(true);
                out["requested_path"] = json!(args.path);
            }
            Ok(out)
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::registry::ToolRegistry;

    #[tokio::test]
    async fn propose_mode_does_not_write() {
        let tmp = tempfile::tempdir().unwrap();
        let root = camino::Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        tokio::fs::create_dir_all(root.join("d")).await.unwrap();
        let ctx = ToolContext::new(root.clone(), false);
        let reg = ToolRegistry::with_simple_tools();
        let out = reg
            .execute_named(
                "file_write",
                &ctx,
                json!({ "path": "d/x.txt", "content": "hi" }),
            )
            .await
            .unwrap();
        assert_eq!(out["applied"], false);
        assert!(!root.join("d/x.txt").exists());
    }

    #[tokio::test]
    async fn apply_mode_writes() {
        let tmp = tempfile::tempdir().unwrap();
        let root = camino::Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        tokio::fs::create_dir_all(root.join("d")).await.unwrap();
        let ctx = ToolContext::new(root.clone(), true);
        let reg = ToolRegistry::with_simple_tools();
        reg.execute_named(
            "file_write",
            &ctx,
            json!({ "path": "d/y.txt", "content": "yo" }),
        )
        .await
        .unwrap();
        let text = tokio::fs::read_to_string(root.join("d/y.txt"))
            .await
            .unwrap();
        assert_eq!(text, "yo");
    }

    #[tokio::test]
    async fn redirects_executor_markdown() {
        let tmp = tempfile::tempdir().unwrap();
        let root = camino::Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        tokio::fs::create_dir_all(root.join(".drox")).await.unwrap();
        let ctx = ToolContext::new(root.clone(), true)
            .with_agent_markdown_root(crate::agent_output::agent_output_dir_for_segment("t2"));
        let reg = ToolRegistry::with_simple_tools();
        let out = reg
            .execute_named(
                "file_write",
                &ctx,
                json!({
                    "path": "src/ANALYSIS.md",
                    "content": "# Analysis"
                }),
            )
            .await
            .unwrap();
        assert_eq!(out["applied"], true);
        assert_eq!(out["agent_output_redirect"], true);
        let dest = root.join(".drox/agent-output/t2/ANALYSIS.md");
        assert!(dest.exists());
        let text = tokio::fs::read_to_string(dest).await.unwrap();
        assert_eq!(text, "# Analysis");
    }
}
