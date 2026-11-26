//! Tool `project_rule_write` — persiste une règle projet sous `.drox/rules/`.

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::fs;

use crate::error::ToolError;
use crate::path_util::resolve_path_for_write;
use crate::tool::Tool;
use crate::tool_context::ToolContext;

const RULES_REL_DIR: &str = ".drox/rules";
const MAX_SLUG_LEN: usize = 64;
const MAX_BODY_LEN: usize = 12_000;

#[derive(Debug, Clone, Copy, Deserialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProjectRuleWriteMode {
    Create,
    Update,
    Append,
}

impl Default for ProjectRuleWriteMode {
    fn default() -> Self {
        Self::Create
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ProjectRuleWriteInput {
    /// Kebab-case id for the file name (e.g. `encadrement-upstream`).
    pub slug: String,
    /// Rule body (markdown, no frontmatter).
    pub body: String,
    /// Short title for prompts / Customizations.
    #[serde(default)]
    pub description: Option<String>,
    /// When true (default), rule is auto-injected every run.
    #[serde(default = "default_always_apply")]
    pub always_apply: bool,
    /// Glob patterns when `always_apply` is false (VS Code `applyTo`).
    #[serde(default)]
    pub apply_to: Vec<String>,
    #[serde(default)]
    pub mode: ProjectRuleWriteMode,
}

fn default_always_apply() -> bool {
    true
}

pub struct ProjectRuleWriteTool;

fn validate_slug(slug: &str) -> Result<(), ToolError> {
    let t = slug.trim();
    if t.is_empty() {
        return Err(ToolError::invalid_args(
            "project_rule_write: `slug` must not be empty",
        ));
    }
    if t.len() > MAX_SLUG_LEN {
        return Err(ToolError::invalid_args(format!(
            "project_rule_write: `slug` too long (max {MAX_SLUG_LEN})"
        )));
    }
    let bytes = t.as_bytes();
    if !bytes[0].is_ascii_alphanumeric() || !bytes[bytes.len() - 1].is_ascii_alphanumeric() {
        return Err(ToolError::invalid_args(
            "project_rule_write: `slug` must start and end with an alphanumeric character",
        ));
    }
    for &b in bytes {
        if b.is_ascii_digit() || (b >= b'a' && b <= b'z') || b == b'-' {
            continue;
        }
        return Err(ToolError::invalid_args(
            "project_rule_write: `slug` may only contain lowercase letters, digits, and hyphens",
        ));
    }
    Ok(())
}

fn humanize_slug(slug: &str) -> String {
    slug.split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ")
}

fn rule_relative_path(slug: &str) -> String {
    format!("{RULES_REL_DIR}/{slug}.instructions.md")
}

fn format_rule_markdown(
    description: &str,
    always_apply: bool,
    apply_to: &[String],
    body: &str,
) -> String {
    let mut fm = format!("---\ndescription: \"{}\"\n", escape_yaml_double_quoted(description));
    if always_apply {
        fm.push_str("alwaysApply: true\n");
    } else if !apply_to.is_empty() {
        let joined = apply_to
            .iter()
            .map(|g| escape_yaml_double_quoted(g))
            .collect::<Vec<_>>()
            .join(", ");
        fm.push_str(&format!("applyTo: {joined}\n"));
    }
    fm.push_str("---\n\n");
    format!("{fm}{}", body.trim())
}

fn escape_yaml_double_quoted(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn split_frontmatter(raw: &str) -> Option<(String, String)> {
    let trimmed = raw.trim_start_matches('\u{feff}');
    let rest = trimmed.strip_prefix("---\n")?;
    let end = rest.find("\n---\n")?;
    let body = rest[end + 5..].trim_start().to_string();
    Some((rest[..end].to_string(), body))
}

#[async_trait]
impl Tool for ProjectRuleWriteTool {
    fn name(&self) -> &str {
        "project_rule_write"
    }

    fn description(&self) -> &str {
        drox_prompts::PROJECT_RULE_WRITE_TOOL_DESCRIPTION
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(ProjectRuleWriteInput)).unwrap_or(Value::Null)
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let args: ProjectRuleWriteInput = serde_json::from_value(input).map_err(|e| {
            ToolError::invalid_args(format!(
                "project_rule_write: invalid JSON ({e}). Expected: \
                 {{\"slug\": \"my-rule\", \"body\": \"…\", \"mode\"?: \"create\"}}."
            ))
        })?;

        let slug = args.slug.trim();
        validate_slug(slug)?;

        let body = args.body.trim();
        if body.is_empty() {
            return Err(ToolError::invalid_args(
                "project_rule_write: `body` is empty after trim",
            ));
        }
        if body.len() > MAX_BODY_LEN {
            return Err(ToolError::invalid_args(format!(
                "project_rule_write: `body` too long ({} chars, max {MAX_BODY_LEN})",
                body.len()
            )));
        }

        if ctx.plan_mode {
            return Err(ToolError::plan_violation("project_rule_write"));
        }

        let description = args
            .description
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| humanize_slug(slug));

        let rel = rule_relative_path(slug);

        if !ctx.apply_fs_writes {
            return Ok(json!({
                "applied": false,
                "proposed": true,
                "relative_path": rel,
                "slug": slug,
                "always_apply": args.always_apply,
            }));
        }

        let rules_parent = ctx.effective_workspace().join(RULES_REL_DIR);
        fs::create_dir_all(rules_parent.as_std_path())
            .await
            .map_err(|e| ToolError::io(rules_parent.clone(), e))?;

        let resolved = resolve_path_for_write(&ctx.effective_workspace(), &rel, false)?;

        let exists = resolved.as_std_path().exists();

        let file_body = match args.mode {
            ProjectRuleWriteMode::Create => {
                if exists {
                    return Err(ToolError::invalid_args(format!(
                        "project_rule_write: rule already exists at `{rel}` — use mode `update` or `append`"
                    )));
                }
                format_rule_markdown(&description, args.always_apply, &args.apply_to, body)
            }
            ProjectRuleWriteMode::Update => {
                if !exists {
                    return Err(ToolError::invalid_args(format!(
                        "project_rule_write: no rule at `{rel}` — use mode `create`"
                    )));
                }
                format_rule_markdown(&description, args.always_apply, &args.apply_to, body)
            }
            ProjectRuleWriteMode::Append => {
                if !exists {
                    return Err(ToolError::invalid_args(format!(
                        "project_rule_write: no rule at `{rel}` — use mode `create`"
                    )));
                }
                let prev = fs::read_to_string(resolved.as_std_path())
                    .await
                    .map_err(|e| ToolError::io(resolved.clone(), e))?;
                let (_, prev_body) = split_frontmatter(&prev).unwrap_or((String::new(), prev));
                let merged = if prev_body.trim().is_empty() {
                    body.to_string()
                } else {
                    format!("{}\n\n{}", prev_body.trim_end(), body)
                };
                format_rule_markdown(&description, args.always_apply, &args.apply_to, &merged)
            }
        };

        fs::write(resolved.as_std_path(), file_body.as_bytes())
            .await
            .map_err(|e| ToolError::io(resolved.clone(), e))?;

        Ok(json!({
            "ok": true,
            "relative_path": rel,
            "slug": slug,
            "mode": match args.mode {
                ProjectRuleWriteMode::Create => "create",
                ProjectRuleWriteMode::Update => "update",
                ProjectRuleWriteMode::Append => "append",
            },
            "always_apply": args.always_apply,
            "apply_to": args.apply_to,
            "description": description,
            "bytes_written": file_body.len(),
            "injection_note": "Rule is picked up on the next agent run when project rules are enabled."
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use tempfile::tempdir;

    use crate::tool_context::ToolContext;

    #[tokio::test]
    async fn create_writes_instructions_file() {
        let dir = tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let ctx = ToolContext::new(root.clone(), true);
        let tool = ProjectRuleWriteTool;
        let out = tool
            .execute(
                &ctx,
                json!({
                    "slug": "test-rule",
                    "body": "Always use DROX-BEGIN markers.",
                }),
            )
            .await
            .unwrap();
        assert_eq!(out["ok"], true);
        let path = root.join(".drox/rules/test-rule.instructions.md");
        let text = fs::read_to_string(path).await.unwrap();
        assert!(text.contains("alwaysApply: true"));
        assert!(text.contains("Always use DROX-BEGIN"));
    }

    #[tokio::test]
    async fn create_rejects_duplicate() {
        let dir = tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let ctx = ToolContext::new(root, true);
        let tool = ProjectRuleWriteTool;
        let payload = json!({ "slug": "dup", "body": "one" });
        tool.execute(&ctx, payload.clone()).await.unwrap();
        let err = tool.execute(&ctx, payload).await.unwrap_err();
        assert!(format!("{err}").contains("already exists"));
    }

    #[tokio::test]
    async fn append_adds_body() {
        let dir = tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
        let ctx = ToolContext::new(root.clone(), true);
        let tool = ProjectRuleWriteTool;
        tool.execute(
            &ctx,
            json!({ "slug": "grow", "body": "First.", "mode": "create" }),
        )
        .await
        .unwrap();
        tool.execute(
            &ctx,
            json!({ "slug": "grow", "body": "Second.", "mode": "append" }),
        )
        .await
        .unwrap();
        let path = root.join(".drox/rules/grow.instructions.md");
        let text = fs::read_to_string(path).await.unwrap();
        assert!(text.contains("First."));
        assert!(text.contains("Second."));
    }

    #[test]
    fn slug_rejects_invalid() {
        assert!(validate_slug("").is_err());
        assert!(validate_slug("-bad").is_err());
        assert!(validate_slug("ok-rule").is_ok());
    }
}