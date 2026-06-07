//! Sous-agents (§2.10) — V1 : type **Explore** (lecture seule), tool `task`.

use std::sync::Arc;

use async_trait::async_trait;
use drox_llm::{ChatOptions, LlmClient};
use drox_tools::{
    DynTool, FileReadTool, GlobTool, GrepTool, LspTool, RunningExploreJobUi, SubagentCompletedJob,
    SubagentExecutor, SubagentExploreResult, SubagentHookEvent, SubagentSettings, ToolContext,
    ToolError, ToolRegistry, WebFetchTool, WebSearchTool, WorkspaceMapReadTool,
    structure_task_async_pending,
};
use serde_json::Value;
use futures::StreamExt;
use tokio::sync::Semaphore;
use tracing::{debug, warn};

use crate::agent::{Agent, AgentConfig};
use crate::context::ContextPolicy;
use crate::error::EngineError;
use crate::event::AgentEvent;
use crate::run_spec::RunSpec;
use crate::subagent_jobs::SubagentJobRegistry;

fn coerce_tool<T: drox_tools::Tool + Sized + 'static>(tool: T) -> DynTool {
    Arc::new(tool)
}

/// Registre minimal pour un sous-agent Explore (pas de `task`, bash, écriture).
#[must_use]
pub fn explore_tool_registry() -> ToolRegistry {
    let mut reg = ToolRegistry::new();
    reg.register(coerce_tool(FileReadTool));
    reg.register(coerce_tool(GlobTool));
    reg.register(coerce_tool(GrepTool));
    reg.register(coerce_tool(LspTool));
    reg.register(coerce_tool(WebFetchTool));
    reg.register(coerce_tool(WebSearchTool));
    reg.register(coerce_tool(WorkspaceMapReadTool));
    reg
}

const EXPLORE_SYSTEM_PROMPT: &str = "You are an **Explore** sub-agent (read-only) for the parent Drox agent.\n\
    \n\
    Tools: `grep`, `glob`, `file_read` (use **start_line** + **end_line** for partial reads), `lsp`, `workspace_map_read`.\n\
    Do **not** modify files, run bash, or spawn nested `task`.\n\
    \n\
    Phases: `[phase: reading]` + tools (telegraphic English notes only). Final turn:\n\
    `[phase: answering]` + short structured report (bullets, paths) + `[phase: done]` on the next line.\n\
    **Do not** loop or write « I need to answer » — one report, then done.\n\
    \n\
    Stop early when the scoped objective is satisfied.";

fn thoroughness_supplement(thoroughness: Option<&str>) -> &'static str {
    let Some(raw) = thoroughness else {
        return "";
    };
    match raw.trim().to_ascii_lowercase().as_str() {
        "quick" => "\n\nThoroughness: **quick** — minimal tool calls, fastest answer.",
        "medium" => "\n\nThoroughness: **medium** — balanced search depth.",
        "very thorough" | "very_thorough" | "very-thorough" => {
            "\n\nThoroughness: **very thorough** — search broadly across naming conventions and folders."
        }
        _ => "",
    }
}

fn emit_hook(settings: &SubagentSettings, event: SubagentHookEvent) {
    if let Some(ref hook) = settings.event_hook {
        hook(event);
    }
}

/// Exécuteur moteur branché sur `ToolContext::subagent_executor`.
#[derive(Clone)]
pub struct EngineSubagentExecutor {
    llm: Arc<dyn LlmClient>,
    chat_options: ChatOptions,
    settings: SubagentSettings,
    parent_run_spec: RunSpec,
    /// Fenêtre de contexte Ollama / budget snip du sous-agent (≠ parent).
    subagent_num_ctx: usize,
    semaphore: Arc<Semaphore>,
    jobs: Arc<SubagentJobRegistry>,
}

impl EngineSubagentExecutor {
    #[must_use]
    pub fn new(
        llm: Arc<dyn LlmClient>,
        chat_options: ChatOptions,
        settings: SubagentSettings,
        parent_run_spec: RunSpec,
        subagent_num_ctx: usize,
        jobs: Arc<SubagentJobRegistry>,
    ) -> Self {
        let permits = settings.max_concurrent.max(1);
        Self {
            llm,
            chat_options,
            settings,
            parent_run_spec,
            subagent_num_ctx: subagent_num_ctx.max(2048),
            semaphore: Arc::new(Semaphore::new(permits)),
            jobs,
        }
    }
}

#[async_trait]
impl SubagentExecutor for EngineSubagentExecutor {
    fn drain_completed_jobs(&self) -> Vec<SubagentCompletedJob> {
        self.jobs.drain_completed()
    }

    fn running_jobs_count(&self) -> usize {
        self.jobs.running_count()
    }

    fn running_explore_jobs(&self) -> Vec<RunningExploreJobUi> {
        self.jobs
            .running_job_entries()
            .into_iter()
            .map(|j| RunningExploreJobUi {
                job_id: j.job_id,
                description: j.description,
            })
            .collect()
    }

    async fn spawn_explore(
        &self,
        description: String,
        thoroughness: Option<String>,
        objective_fragment: Option<String>,
        scope: Option<Vec<String>>,
        ctx: &ToolContext,
    ) -> Result<(String, Value), ToolError> {
        let desc_trim = description.trim().to_string();
        if desc_trim.is_empty() {
            return Err(ToolError::invalid_args("description must not be empty"));
        }
        let job_id = SubagentJobRegistry::new_job_id();
        let me = self.clone();
        let parent_ctx = ctx.clone();
        let desc_spawn = desc_trim.clone();
        let th = thoroughness.clone();
        let obj = objective_fragment.clone();
        let sc = scope.clone();
        let pending = structure_task_async_pending(&job_id, &desc_trim);
        self.jobs.spawn(
            job_id.clone(),
            desc_trim,
            self.settings.clone(),
            async move {
                let _permit = me
                    .semaphore
                    .acquire()
                    .await
                    .map_err(|_| "subagent semaphore closed".to_string())?;
                me.explore_core(desc_spawn, th, obj, sc, &parent_ctx)
                    .await
                    .map_err(|e| e.to_string())
            },
        );
        Ok((job_id, pending))
    }

    async fn run_explore(
        &self,
        description: String,
        thoroughness: Option<String>,
        objective_fragment: Option<String>,
        scope: Option<Vec<String>>,
        parent_ctx: &ToolContext,
    ) -> Result<SubagentExploreResult, ToolError> {
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|_| ToolError::remote("subagent semaphore closed"))?;

        let desc_trim = description.trim().to_string();
        emit_hook(
            &self.settings,
            SubagentHookEvent::Start {
                subagent_type: "explore".to_string(),
                description: desc_trim.clone(),
                job_id: None,
                background: false,
            },
        );

        let result = self
            .explore_core(
                description,
                thoroughness,
                objective_fragment,
                scope,
                parent_ctx,
            )
            .await?;

        let summary = result
            .report_markdown
            .lines()
            .map(str::trim)
            .find(|l| !l.is_empty() && !l.starts_with('['))
            .unwrap_or(&result.report_markdown)
            .chars()
            .take(300)
            .collect::<String>();

        emit_hook(
            &self.settings,
            SubagentHookEvent::Done {
                subagent_type: "explore".to_string(),
                summary,
                truncated: result.truncated,
                iterations_used: result.iterations_used,
                job_id: None,
                success: true,
                error_message: None,
            },
        );

        Ok(result)
    }
}

impl EngineSubagentExecutor {
    async fn explore_core(
        &self,
        description: String,
        thoroughness: Option<String>,
        objective_fragment: Option<String>,
        scope: Option<Vec<String>>,
        parent_ctx: &ToolContext,
    ) -> Result<SubagentExploreResult, ToolError> {
        let desc_trim = description.trim().to_string();

        let mut system = EXPLORE_SYSTEM_PROMPT.to_string();
        system.push_str(thoroughness_supplement(thoroughness.as_deref()));
        if let Some(obj) = objective_fragment.as_deref() {
            if !obj.trim().is_empty() {
                system.push_str("\n\nParent objective fragment:\n");
                system.push_str(obj.trim());
            }
        }
        if let Some(paths) = scope.as_ref() {
            if !paths.is_empty() {
                system.push_str("\n\nScope paths (prefer these):\n");
                for p in paths {
                    system.push_str("- ");
                    system.push_str(p.trim());
                    system.push('\n');
                }
            }
        }

        let explore_ctx = ToolContext {
            workspace_root: parent_ctx.effective_workspace(),
            apply_fs_writes: false,
            plan_mode: true,
            user_asker: None,
            session_notes: None,
            mcp_hub: None,
            scope_deferred: None,
            workspace_map: parent_ctx.workspace_map.clone(),
            drox_ignore: parent_ctx.drox_ignore.clone(),
            subagent_settings: None,
            subagent_executor: None,
            orchestration_delegate: None,
            orchestration_plan_id: None,
            orchestration_task_labels: None,
            agent_markdown_root: None,
            agent_markdown_filename: None,
            orchestration_delegate_attempt: None,
            orchestration_run_closable: false,
            orchestration_max_parallel_executors: 1,
            architect_help_snapshot: None,
        };

        let child_spec = self.parent_run_spec.clone();
        let max_iterations = self.settings.effective_max_iterations();
        let max_parallel = 4;

        let mut subagent_chat_options = self.chat_options.clone();
        let wire_num_ctx = self.subagent_num_ctx as i64;
        subagent_chat_options.num_ctx = Some(wire_num_ctx);

        tracing::info!(
            subagent_num_ctx = wire_num_ctx,
            chat_options_num_ctx = ?subagent_chat_options.num_ctx,
            "explore subagent — num_ctx envoyé à Ollama (options par tour)"
        );

        let registry = Arc::new(explore_tool_registry());
        let agent = Agent::new(
            self.llm.clone(),
            registry,
            explore_ctx,
            AgentConfig {
                system_prompt: Some(system),
                max_iterations,
                chat_options: subagent_chat_options,
                permissions: None,
                context: Some(ContextPolicy::for_model_context_window(
                    self.subagent_num_ctx,
                )),
                transcript: None,
                memory: None,
                transcript_session_id: None,
                workspace_fingerprint: String::new(),
                max_parallel_tool_calls: max_parallel,
                tool_hooks: None,
                run_objective: objective_fragment,
                delegate_task_id: None,
                executor_deliverable_task_id: None,
                executor_deliverable_plan_id: None,
                run_spec: child_spec,
                engine_tuning: crate::orchestration::EngineTuning::default(),
                orchestration_run_id: None,
            },
        );

        let mut prompt = format!(
            "## Subagent task\n\n{}\n\nReturn your findings as a structured report for the parent agent.",
            desc_trim
        );
        if let Some(paths) = scope {
            if !paths.is_empty() {
                prompt.push_str("\n\nFocus paths:\n");
                for p in paths {
                    prompt.push_str("- ");
                    prompt.push_str(p.trim());
                    prompt.push('\n');
                }
            }
        }

        debug!(max_iter = max_iterations, "explore subagent start");

        let mut stream = agent.run(prompt);
        let mut report = String::new();
        let mut hit_max = false;
        let mut iterations_used = 0usize;

        while let Some(event) = stream.next().await {
            match event {
                Ok(AgentEvent::TextDelta { text }) => report.push_str(&text),
                Ok(AgentEvent::ToolStart { .. }) => {
                    iterations_used = iterations_used.saturating_add(1);
                }
                Ok(AgentEvent::Stop { .. }) => {
                    iterations_used = iterations_used.max(1);
                    break;
                }
                Err(EngineError::MaxIterations(_)) => {
                    hit_max = true;
                    iterations_used = max_iterations;
                    break;
                }
                Err(e) => {
                    warn!(error = %e, "explore subagent engine error");
                    return Err(ToolError::remote(format!("subagent failed: {e}")));
                }
                _ => {}
            }
        }

        let trimmed = report.trim();
        let report_markdown = if trimmed.is_empty() {
            "(Explore sub-agent finished with no text — check logs or retry with a clearer description.)"
                .to_string()
        } else if hit_max {
            format!(
                "{trimmed}\n\n---\n*(Report truncated: sub-agent iteration limit reached.)*"
            )
        } else {
            trimmed.to_string()
        };

        Ok(SubagentExploreResult {
            report_markdown,
            truncated: hit_max,
            iterations_used,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explore_registry_has_no_nested_task() {
        let names = explore_tool_registry().names();
        assert!(!names.iter().any(|n| n == "task"));
        assert!(names.iter().any(|n| n == "file_read"));
    }
}
