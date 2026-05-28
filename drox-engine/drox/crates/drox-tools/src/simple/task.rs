//! Tool `task` — délègue une exploration en lecture seule à un sous-agent (§2.10).
//!
//! Désactivé par défaut (`drox.subagents.enabled` / `subagentsEnabled` JSON-RPC).
//! V1 : seul `subagent_type: explore` est supporté.
//! M5c : `background: true` lance l'explore en arrière-plan (retour immédiat).

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::subagent_report::structure_task_output;
use crate::tool::Tool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TaskInput {
    /// Description de la tâche de recherche / exploration.
    pub description: String,
    /// Type de sous-agent. V1 : uniquement `explore`.
    #[serde(default = "default_subagent_type")]
    pub subagent_type: String,
    /// `false` (défaut) : attendre le rapport structuré (M5a sync). `true` : job async, retour immédiat.
    #[serde(default)]
    pub background: bool,
    /// Niveau d'exploration : `quick` | `medium` | `very thorough`.
    #[serde(default)]
    pub thoroughness: Option<String>,
    /// Chemins à privilégier (relatifs workspace).
    #[serde(default)]
    pub scope: Option<Vec<String>>,
    /// Fragment d'objectif parent (cap / étape plan).
    #[serde(default)]
    pub objective_fragment: Option<String>,
}

fn default_subagent_type() -> String {
    "explore".to_string()
}

pub struct TaskTool;

#[async_trait]
impl Tool for TaskTool {
    fn name(&self) -> &str {
        "task"
    }

    fn description(&self) -> &str {
        "Delegate **read-only** exploration to a sub-agent (grep, glob, file_read, lsp). \
         For broad or parallelizable searches only — not for reading a known file (use `file_read`). \
         **Disabled** when sub-agents are off in settings (`drox.subagents.enabled`). V1: `subagent_type` = `explore`. \
         `background: false` (default): parent waits for the report (sync). `background: true`: \
         explore in the background — report is injected on the parent's next turn. \
         Optional fields: `scope`, `objective_fragment`."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(TaskInput)).unwrap_or(Value::Null)
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn is_concurrency_safe(&self) -> bool {
        false
    }

    fn is_concurrency_safe_for_input(&self, input: &Value) -> bool {
        serde_json::from_value::<TaskInput>(input.clone())
            .map(|a| a.background)
            .unwrap_or(false)
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let settings = ctx
            .subagent_settings
            .as_ref()
            .cloned()
            .unwrap_or_default();
        if !settings.enabled {
            return Err(ToolError::invalid_args(
                "Subagents are disabled. Enable `drox.subagents.enabled` in VS Code settings \
                 to use `task`.",
            ));
        }
        let executor = ctx.subagent_executor.as_ref().ok_or_else(|| {
            ToolError::invalid_args(
                "Subagents are not configured for this run (missing executor on engine side).",
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
        if args.background {
            let (_job_id, pending) = executor
                .spawn_explore(
                    args.description,
                    args.thoroughness,
                    args.objective_fragment,
                    args.scope,
                    ctx,
                )
                .await?;
            return Ok(pending);
        }
        let result = executor
            .run_explore(
                args.description,
                args.thoroughness,
                args.objective_fragment,
                args.scope,
                ctx,
            )
            .await?;
        Ok(structure_task_output(&result))
    }
}
