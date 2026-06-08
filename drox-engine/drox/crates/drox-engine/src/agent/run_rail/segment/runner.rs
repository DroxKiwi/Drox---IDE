//! Run an isolated ACT segment via nested `Agent::drive` (executor-like).
//!
//! Reuses `orchestration_delegate` tool mask — not the `delegate_executor` tool.

use std::sync::Arc;

use camino::Utf8Path;
use futures::StreamExt;
use tokio::sync::mpsc;

use super::persist;
use super::report::SegmentReport;
use super::trigger::SegmentSpawnRequest;
use crate::agent::{Agent, AgentConfig, format_tool_result_for_llm};
use crate::context::ContextPolicy;
use crate::error::EngineError;
use crate::event::AgentEvent;
use crate::orchestration_delegate::executor_tool_registry;
use crate::run_spec::RoleId;
use drox_types::{Message, ToolUseId};

const SEGMENT_SYSTEM_PROMPT: &str =
    include_str!("../../../orchestration/prompts/segments/execute.md");

/// Run one segment and return a structured report for the parent.
pub async fn run_act_segment(
    parent: &Agent,
    tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    workspace: &Utf8Path,
    run_id: &str,
    request: SegmentSpawnRequest,
    plan_id: Option<&str>,
) -> Result<SegmentReport, EngineError> {
    let _ = tx
        .send(Ok(AgentEvent::RailSegmentStart {
            station: "act".to_string(),
            task_id: request.task_id.clone(),
            label: Some(request.label.clone()),
            scope: request.scope.clone(),
        }))
        .await;

    let parent_config = parent.agent_config();
    let mut segment_ctx = parent.tool_context();
    if let Some(pid) = plan_id {
        segment_ctx = segment_ctx.with_orchestration_plan_id(pid.to_string());
    }

    let max_iter = parent_config
        .engine_tuning
        .executor_subrun_max_iterations
        .clamp(1, 25) as usize;

    let num_ctx = parent_config
        .chat_options
        .num_ctx
        .unwrap_or(8192)
        .max(2048) as usize;

    let run_spec = crate::run_spec::RunSpec::for_orchestration_role_with_tuning(
        RoleId::Executor,
        &parent_config.engine_tuning,
    );

    let segment_agent = Agent::new(
        parent.llm_client(),
        Arc::new(executor_tool_registry()),
        segment_ctx,
        AgentConfig {
            system_prompt: Some(SEGMENT_SYSTEM_PROMPT.to_string()),
            max_iterations: max_iter,
            chat_options: parent_config.chat_options.clone(),
            permissions: parent_config.permissions.clone(),
            context: Some(ContextPolicy::for_model_context_window_with_tuning(
                num_ctx,
                &parent_config.engine_tuning,
            )),
            run_spec,
            engine_tuning: parent_config.engine_tuning.clone(),
            delegate_task_id: Some(request.task_id.clone()),
            executor_deliverable_task_id: Some(request.task_id.clone()),
            executor_deliverable_plan_id: plan_id.map(str::to_string),
            run_objective: Some(request.brief.clone()),
            orchestration_run_id: parent_config.orchestration_run_id.clone(),
            ..AgentConfig::default()
        },
    );

    let user_body = format_segment_user_message(&request);
    let mut stream = segment_agent.run(user_body);
    let mut summary = String::new();
    let mut errored = false;
    let mut hit_max = false;

    while let Some(item) = stream.next().await {
        match item {
            Ok(ev) => {
                if let AgentEvent::TextDelta { text } = &ev {
                    summary.push_str(text);
                }
                let is_stop = matches!(&ev, AgentEvent::Stop { .. });
                if !ev.is_parent_context_gauge() {
                    let _ = tx.send(Ok(ev)).await;
                }
                if is_stop {
                    break;
                }
            }
            Err(EngineError::MaxIterations(_)) => {
                hit_max = true;
                break;
            }
            Err(e) => {
                errored = true;
                let _ = tx.send(Err(e)).await;
                break;
            }
        }
    }

    let status = if errored {
        "blocked"
    } else if hit_max {
        "partial"
    } else {
        "completed"
    };

    let report = SegmentReport {
        task_id: request.task_id.clone(),
        status: status.to_string(),
        paths_touched: request.scope.clone(),
        summary: summarize_segment_text(&summary),
        evidence: String::new(),
    };

    let _ = persist::persist_segment_report(workspace, run_id, &report).await;

    let _ = tx
        .send(Ok(AgentEvent::RailSegmentDone {
            task_id: report.task_id.clone(),
            status: report.status.clone(),
            summary: Some(report.summary.clone()),
            paths_touched: report.paths_touched.clone(),
        }))
        .await;

    Ok(report)
}

/// Push segment report into parent transcript as a synthetic tool result.
#[must_use]
pub fn segment_tool_result_message(tool_id: ToolUseId, report: &SegmentReport) -> Message {
    let body = format_tool_result_for_llm("rail_segment", &report.tool_result_json());
    Message::tool_result(tool_id, body, false)
}

fn format_segment_user_message(request: &SegmentSpawnRequest) -> String {
    let scope = request
        .scope
        .iter()
        .map(|p| format!("- {p}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "## Segment task (engine)\n\
         task_id: {}\n\
         scope:\n{scope}\n\n\
         ## Brief\n{}",
        request.task_id, request.brief
    )
}

fn summarize_segment_text(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "Segment finished with no summary text.".to_string();
    }
    trimmed.chars().take(800).collect()
}
