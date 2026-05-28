//! Délégation Architecte → Exécutant — implémentation moteur (run exécuteur inline).

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use async_trait::async_trait;
use drox_llm::{ChatOptions, LlmClient};
use drox_session::ensure_agent_output_task_dir;
use drox_tools::{
    agent_output_dir_for_plan_task, sanitize_deliverable_filename, ExecutorTaskRequest,
    OrchestrationDelegateExecutor, OrchestrationDelegateHookEvent,
    OrchestrationDelegateResult, ToolContext, ToolError, ToolRegistry,
};
use futures::{stream, StreamExt};
use tracing::warn;

use crate::agent::{Agent, AgentConfig};
use crate::context::ContextPolicy;
use crate::error::EngineError;
use crate::event::AgentEvent;
use crate::orchestration::find_deliverable_on_disk;
use crate::orchestration::{
    apply_truth_check_to_status, build_failure_packet, classify_delegate_task,
    executor_user_message_from_delegate, finalize_delegate_result, post_delegate_truth_check,
    validate_parallel_batch, EXECUTOR_SYSTEM_PROMPT,
};
use crate::run_spec::{RoleId, RunSpec};
use crate::{default_tool_registry, permissions::PermissionPolicy};

/// Registre outils exécutant (allowlist `RunSpec::Executor`).
#[must_use]
pub fn executor_tool_registry() -> ToolRegistry {
    let mut registry = default_tool_registry();
    let spec = RunSpec::for_orchestration_role(RoleId::Executor);
    let remove: Vec<String> = registry
        .names()
        .into_iter()
        .filter(|name| !spec.tool_visible(name))
        .collect();
    for name in remove {
        registry.remove(&name);
    }
    registry
}

/// Configuration pour [`EngineOrchestrationDelegate`].
#[derive(Clone)]
pub struct EngineOrchestrationDelegate {
    llms: Vec<Arc<dyn LlmClient>>,
    executor_models: Vec<String>,
    chat_options: ChatOptions,
    max_iterations: usize,
    executor_num_ctx: usize,
    permissions: Option<PermissionPolicy>,
    event_hook: Option<drox_tools::OrchestrationDelegateEventHook>,
    run_cancel: Arc<AtomicBool>,
    max_parallel_executors: usize,
}

impl EngineOrchestrationDelegate {
    #[must_use]
    pub fn new(
        llms: Vec<Arc<dyn LlmClient>>,
        executor_models: Vec<String>,
        chat_options: ChatOptions,
        max_iterations: usize,
        executor_num_ctx: usize,
        permissions: Option<PermissionPolicy>,
        event_hook: Option<drox_tools::OrchestrationDelegateEventHook>,
        run_cancel: Arc<AtomicBool>,
        max_parallel_executors: usize,
    ) -> Self {
        let llms = if llms.is_empty() {
            panic!("EngineOrchestrationDelegate requires at least one LLM client");
        } else {
            llms
        };
        let executor_models = if executor_models.is_empty() {
            vec!["executor".to_string()]
        } else {
            executor_models
        };
        Self {
            llms,
            executor_models,
            chat_options,
            max_iterations: max_iterations.clamp(1, 25),
            executor_num_ctx: executor_num_ctx.max(2048),
            permissions,
            event_hook,
            run_cancel,
            max_parallel_executors: max_parallel_executors.clamp(1, crate::orchestration::MAX_PARALLEL_EXECUTORS_CAP),
        }
    }

    fn pick_llm_for_task_index(&self, idx: usize) -> (Arc<dyn LlmClient>, String) {
        let pick = idx % self.llms.len();
        let llm = self.llms[pick].clone();
        let model = self
            .executor_models
            .get(pick)
            .cloned()
            .unwrap_or_else(|| format!("executor#{pick}"));
        (llm, model)
    }

    async fn run_executor_task_on_llm(
        &self,
        llm: Arc<dyn LlmClient>,
        llm_model: &str,
        task_id: String,
        description: String,
        deliverable: Option<String>,
        instructions: Option<String>,
        context: Option<String>,
        scope: Option<Vec<String>>,
        parent_ctx: &ToolContext,
    ) -> Result<OrchestrationDelegateResult, ToolError> {
        let task_started = Instant::now();
        let desc_trim = description.trim().to_string();
        tracing::info!(
            task_id = %task_id,
            model = %llm_model,
            scope_count = scope.as_ref().map_or(0, |s| s.len()),
            "delegate_executor task start"
        );
        self.emit_hook(OrchestrationDelegateHookEvent::RoleEnter {
            role_id: "executor".to_string(),
        });
        self.emit_hook(OrchestrationDelegateHookEvent::ExecutorTaskStart {
            task_id: task_id.clone(),
            description: desc_trim.clone(),
        });

        let plan_id = parent_ctx.orchestration_plan_id.as_deref().ok_or_else(|| {
            ToolError::invalid_args(
                "Orchestration plan id missing — Architect must call `todo_write` before `delegate_executor`.",
            )
        })?;

        let task_label = parent_ctx
            .orchestration_task_labels
            .as_ref()
            .and_then(|labels| labels.get(&task_id))
            .map(String::as_str)
            .unwrap_or(desc_trim.as_str());
        let deliverable_filename = sanitize_deliverable_filename(task_label);

        let workspace = parent_ctx.effective_workspace();
        let _output_dir = ensure_agent_output_task_dir(&workspace, plan_id, &task_id)
            .await
            .map_err(|e| ToolError::invalid_args(format!("agent output dir: {e}")))?;

        let executor_ctx = ToolContext {
            workspace_root: workspace.clone(),
            apply_fs_writes: parent_ctx.apply_fs_writes,
            plan_mode: false,
            user_asker: parent_ctx.user_asker.clone(),
            session_notes: None,
            mcp_hub: None,
            scope_deferred: parent_ctx.scope_deferred.clone(),
            workspace_map: parent_ctx.workspace_map.clone(),
            drox_ignore: parent_ctx.drox_ignore.clone(),
            subagent_settings: None,
            subagent_executor: None,
            orchestration_delegate: None,
            orchestration_plan_id: Some(plan_id.to_string()),
            orchestration_task_labels: parent_ctx.orchestration_task_labels.clone(),
            agent_markdown_root: None,
            agent_markdown_filename: None,
            orchestration_delegate_attempt: None,
            orchestration_run_closable: false,
            orchestration_max_parallel_executors: 1,
            architect_help_snapshot: None,
        }
        .with_agent_markdown_root(agent_output_dir_for_plan_task(plan_id, &task_id))
        .with_agent_markdown_filename(deliverable_filename.clone());

        let user_message = executor_user_message_from_delegate(
            plan_id,
            &task_id,
            task_label,
            &description,
            deliverable.as_deref(),
            instructions.as_deref(),
            context.as_deref(),
            scope.as_deref(),
        );

        let mut chat_options = self.chat_options.clone();
        chat_options.num_ctx = Some(self.executor_num_ctx as i64);

        let registry = Arc::new(executor_tool_registry());
        let run_spec = RunSpec::for_orchestration_role(RoleId::Executor);

        let agent = Agent::new(
            llm,
            registry,
            executor_ctx,
            AgentConfig {
                system_prompt: Some(EXECUTOR_SYSTEM_PROMPT.to_string()),
                max_iterations: self.max_iterations,
                chat_options,
                permissions: self.permissions.clone(),
                context: Some(ContextPolicy::for_model_context_window(
                    self.executor_num_ctx,
                )),
                transcript: None,
                memory: None,
                transcript_session_id: None,
                workspace_fingerprint: String::new(),
                max_parallel_tool_calls: 2,
                tool_hooks: None,
                run_objective: Some(description.clone()),
                delegate_task_id: Some(task_id.clone()),
                executor_deliverable_task_id: Some(task_id.clone()),
                executor_deliverable_plan_id: Some(plan_id.to_string()),
                run_spec,
            },
        );

        let mut stream = agent.run(user_message);
        let mut report = String::new();
        let mut hit_max = false;
        let mut iterations_used = 0usize;
        let mut errored = false;
        let mut engine_error: Option<String> = None;
        let mut successful_tools = 0usize;

        while let Some(event) = stream.next().await {
            if self.run_cancel.load(Ordering::SeqCst) {
                errored = true;
                engine_error = Some("Run cancelled".to_string());
                break;
            }
            match event {
                Ok(ev) => {
                    if let AgentEvent::TextDelta { ref text } = ev {
                        report.push_str(text);
                    }
                    if let AgentEvent::ToolFinish { is_error: false, .. } = &ev {
                        successful_tools = successful_tools.saturating_add(1);
                    }
                    if matches!(&ev, AgentEvent::ToolStart { .. }) {
                        iterations_used = iterations_used.saturating_add(1);
                    }
                    self.forward_agent_event(&ev, &task_id);
                    if matches!(&ev, AgentEvent::Stop { .. }) {
                        iterations_used = iterations_used.max(1);
                        break;
                    }
                }
                Err(EngineError::MaxIterations(_)) => {
                    hit_max = true;
                    iterations_used = self.max_iterations;
                    break;
                }
                Err(e) => {
                    warn!(error = %e, task_id = %task_id, model = %llm_model, "executor delegate engine error");
                    engine_error = Some(e.to_string());
                    errored = true;
                    break;
                }
            }
        }

        self.emit_hook(OrchestrationDelegateHookEvent::RoleEnter {
            role_id: "architect".to_string(),
        });

        let disk_deliverable =
            find_deliverable_on_disk(&workspace, plan_id, &task_id, Some(&deliverable_filename));

        let scope_paths: Vec<String> = scope
            .as_ref()
            .map(|paths| {
                paths
                    .iter()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        let task_kind = classify_delegate_task(
            &scope_paths,
            &desc_trim,
            deliverable.as_deref(),
            instructions.as_deref(),
        );

        let (mut delegate_status, mut report_markdown) = finalize_delegate_result(
            &task_id,
            report.trim(),
            hit_max,
            errored,
            successful_tools,
            engine_error.as_deref(),
            disk_deliverable.as_ref(),
        );

        let truth = post_delegate_truth_check(
            &workspace,
            &scope_paths,
            task_kind,
            disk_deliverable.as_ref(),
        );
        delegate_status = apply_truth_check_to_status(delegate_status, &truth);

        if delegate_status == crate::orchestration::DelegateStatus::Partial
            && !report_markdown.contains("scope file(s) are missing")
            && !truth.passes_for_completed()
        {
            report_markdown.push_str(
                "\n\n---\n*(Engine truth-check: deliverable `.md` may exist but required scope target(s) \
                 are missing or empty — status downgraded to `partial`.)*",
            );
        }

        let delegate_attempts = parent_ctx.orchestration_delegate_attempt.unwrap_or(1);
        let failure = build_failure_packet(
            &task_id,
            delegate_status,
            &truth,
            iterations_used,
            delegate_attempts,
            engine_error.as_deref(),
        );
        let verified = delegate_status == crate::orchestration::DelegateStatus::Completed
            && truth.passes_for_completed();

        let status = delegate_status.as_str().to_string();
        let success = delegate_status.success();

        let summary_for_ui = report_markdown.clone();
        self.emit_hook(OrchestrationDelegateHookEvent::ExecutorTaskDone {
            task_id: task_id.clone(),
            status: status.to_string(),
            summary: summary_for_ui,
            truncated: hit_max,
            iterations_used,
            success,
        });

        tracing::info!(
            task_id = %task_id,
            model = %llm_model,
            status = %status,
            elapsed_ms = task_started.elapsed().as_millis() as u64,
            "delegate_executor task done"
        );

        Ok(OrchestrationDelegateResult {
            task_id,
            status,
            report_markdown,
            iterations_used,
            truncated: hit_max,
            verified,
            failure,
        })
    }

    fn emit_hook(&self, event: OrchestrationDelegateHookEvent) {
        if let Some(ref hook) = self.event_hook {
            hook(event);
        }
    }

    fn forward_agent_event(&self, ev: &AgentEvent, task_id: &str) {
        if ev.is_parent_context_gauge() {
            return;
        }
        let Ok(mut payload) = serde_json::to_value(ev) else {
            return;
        };
        if let Some(obj) = payload.as_object_mut() {
            obj.insert(
                "job_id".to_string(),
                serde_json::Value::String(task_id.to_string()),
            );
        }
        self.emit_hook(OrchestrationDelegateHookEvent::AgentEventJson { payload });
    }
}

#[async_trait]
impl OrchestrationDelegateExecutor for EngineOrchestrationDelegate {
    async fn run_executor_task(
        &self,
        task_id: String,
        description: String,
        deliverable: Option<String>,
        instructions: Option<String>,
        context: Option<String>,
        scope: Option<Vec<String>>,
        parent_ctx: &ToolContext,
    ) -> Result<OrchestrationDelegateResult, ToolError> {
        let (llm, model) = self.pick_llm_for_task_index(0);
        self.run_executor_task_on_llm(
            llm,
            &model,
            task_id,
            description,
            deliverable,
            instructions,
            context,
            scope,
            parent_ctx,
        )
        .await
    }

    async fn run_executor_tasks_batch(
        &self,
        tasks: Vec<ExecutorTaskRequest>,
        parent_ctx: &ToolContext,
    ) -> Result<Vec<OrchestrationDelegateResult>, ToolError> {
        let batch_started = Instant::now();
        let task_ids: Vec<String> = tasks.iter().map(|t| t.task_id.clone()).collect();
        let scopes: Vec<Vec<String>> = tasks
            .iter()
            .map(|t| {
                t.scope
                    .as_ref()
                    .map(|paths| {
                        paths
                            .iter()
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect()
                    })
                    .unwrap_or_default()
            })
            .collect();
        validate_parallel_batch(&task_ids, &scopes, self.max_parallel_executors)
            .map_err(ToolError::invalid_args)?;

        let max_parallel = self.max_parallel_executors;
        tracing::info!(
            tasks = task_ids.len(),
            slots = max_parallel,
            task_ids = ?task_ids,
            "delegate_executor batch start"
        );
        let parent_ctx = parent_ctx.clone();
        let this = self.clone();

        let collected = stream::iter(tasks.into_iter().enumerate())
            .map(|(idx, task)| {
                let this = this.clone();
                let parent_ctx = parent_ctx.clone();
                async move {
                    let (llm, model) = this.pick_llm_for_task_index(idx);
                    this.run_executor_task_on_llm(
                        llm,
                        &model,
                        task.task_id,
                        task.description,
                        task.deliverable,
                        task.instructions,
                        task.context,
                        task.scope,
                        &parent_ctx,
                    ).await
                }
            })
            .buffer_unordered(max_parallel)
            .collect::<Vec<Result<OrchestrationDelegateResult, ToolError>>>()
            .await;

        let mut out = Vec::with_capacity(collected.len());
        for item in collected {
            out.push(item?);
        }
        tracing::info!(
            tasks = out.len(),
            slots = max_parallel,
            elapsed_ms = batch_started.elapsed().as_millis() as u64,
            "delegate_executor batch done"
        );
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestration::DelegateStatus;

    #[test]
    fn executor_registry_has_file_edit_not_delegate() {
        let names = executor_tool_registry().names();
        assert!(names.iter().any(|n| n == "file_edit"));
        assert!(!names.iter().any(|n| n == "delegate_executor"));
    }

    #[test]
    fn engine_error_after_successful_tools_without_report_is_partial() {
        let (status, report) = finalize_delegate_result(
            "t1",
            "Applied dark blue gradients.",
            false,
            true,
            2,
            Some("loop detected: model repeated the same text for 3 consecutive turns"),
            None,
        );
        assert_eq!(status, DelegateStatus::Partial);
        assert!(report.contains("structured"));
    }

    #[test]
    fn engine_error_without_tools_is_failed() {
        let (status, _) = finalize_delegate_result(
            "t1",
            "",
            false,
            true,
            0,
            Some("LLM error: timeout"),
            None,
        );
        assert_eq!(status, DelegateStatus::Failed);
        assert!(!status.success());
    }

    #[test]
    fn parent_context_gauge_detects_context_events() {
        use crate::event::AgentEvent;
        assert!(AgentEvent::ContextUsage {
            parent_tokens: 1,
            parent_budget: None,
        }
        .is_parent_context_gauge());
        assert!(!AgentEvent::TextDelta {
            text: "x".into(),
        }
        .is_parent_context_gauge());
    }
}
