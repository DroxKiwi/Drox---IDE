//! Tool `delegate_executor` — Architect delegates plan task(s) to the Executor (sync / batch).

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::orchestration_delegate::ExecutorTaskRequest;
use crate::tool::Tool;

#[derive(Debug, Deserialize, JsonSchema, Clone)]
pub struct TaskSpec {
    pub task_id: String,
    pub description: String,
    #[serde(default)]
    pub deliverable: Option<String>,
    #[serde(default)]
    pub instructions: Option<String>,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub scope: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DelegateExecutorInput {
    /// Canonical input: one or many tasks. 1 item = single run, N items = batch.
    pub tasks: Vec<TaskSpec>,
}

fn result_to_json(result: &crate::orchestration_delegate::OrchestrationDelegateResult) -> Value {
    serde_json::json!({
        "taskId": result.task_id,
        "status": result.status,
        "verified": result.verified,
        "failure": result.failure,
        "reportMarkdown": result.report_markdown,
        "iterationsUsed": result.iterations_used,
        "truncated": result.truncated,
    })
}

fn build_task_requests(args: &DelegateExecutorInput) -> Result<Vec<ExecutorTaskRequest>, ToolError> {
    if args.tasks.is_empty() {
        return Err(ToolError::invalid_args("tasks must contain at least one item"));
    }
    let mut out = Vec::with_capacity(args.tasks.len());
    for t in &args.tasks {
        let task_id = t.task_id.trim();
        if task_id.is_empty() {
            return Err(ToolError::invalid_args("tasks[].task_id must not be empty"));
        }
        if t.description.trim().is_empty() {
            return Err(ToolError::invalid_args("tasks[].description must not be empty"));
        }
        out.push(ExecutorTaskRequest {
            task_id: task_id.to_string(),
            description: t.description.clone(),
            deliverable: t.deliverable.clone(),
            instructions: t.instructions.clone(),
            context: t.context.clone(),
            scope: t.scope.clone(),
        });
    }
    Ok(out)
}

pub struct DelegateExecutorTool;

#[async_trait]
impl Tool for DelegateExecutorTool {
    fn name(&self) -> &str {
        "delegate_executor"
    }

    fn description(&self) -> &str {
        "Spawn one or more **ephemeral blind Executors** for plan tasks (sync). \
         Canonical payload: `tasks: [...]` (1 task = single run, N tasks = batch). \
         One tool call = one batch; max slots = run setting `maxParallelExecutors`. \
         Fill `instructions` (≥80 chars) and optional `context`. \
         Each Executor writes under `.drox/agent-output/<plan_id>/<task_id>/`."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(DelegateExecutorInput)).unwrap_or(Value::Null)
    }

    fn is_read_only(&self) -> bool {
        false
    }

    fn is_concurrency_safe(&self) -> bool {
        false
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let delegate = ctx.orchestration_delegate.as_ref().ok_or_else(|| {
            ToolError::invalid_args(
                "Executor delegation is not configured for this run (orchestration v1_2 required).",
            )
        })?;
        let args: DelegateExecutorInput = serde_json::from_value(input)?;
        let tasks = build_task_requests(&args)?;

        if tasks.len() == 1 {
            let t = &tasks[0];
            let result = delegate
                .run_executor_task(
                    t.task_id.clone(),
                    t.description.clone(),
                    t.deliverable.clone(),
                    t.instructions.clone(),
                    t.context.clone(),
                    t.scope.clone(),
                    ctx,
                )
                .await?;
            return Ok(result_to_json(&result));
        }

        let results = delegate.run_executor_tasks_batch(tasks, ctx).await?;
        let items: Vec<Value> = results.iter().map(result_to_json).collect();
        Ok(serde_json::json!({
            "batch": true,
            "results": items,
        }))
    }
}
