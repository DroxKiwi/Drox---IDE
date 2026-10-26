//! Phase 1 Explore — tools ON + `explore_commit` + journal L0.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use drox_llm::{ChatOptions, LlmClient};
use drox_prompts::{thoroughness_supplement, EXPLORE_SYSTEM_PROMPT};
use drox_tools::{
	record_tool_evidence, ExploreCommitHandle, ExploreRequest, ToolContext, ToolError,
};
use futures::StreamExt;
use tracing::{debug, warn};

use crate::agent::{Agent, AgentConfig};
use crate::error::EngineError;
use crate::event::AgentEvent;

use super::super::explore_tool_registry::explore_tool_registry;
use super::super::explore_ui_progress::{
	build_live_preview, flush_progress_throttled, tool_activity_line, EXPLORE_PROGRESS_INTERVAL,
};

/// **D2** — seuil d'abort early si 0 commit et 0 evidence L0.
/// `max(8, max_iterations / 2)`, borné par le budget.
#[must_use]
pub(super) fn empty_abort_threshold(max_iterations: usize) -> usize {
	const MIN: usize = 8;
	max_iterations
		.saturating_div(2)
		.max(MIN)
		.min(max_iterations.max(1))
}

pub(super) struct Phase1Input<'a> {
	pub llm: Arc<dyn LlmClient>,
	pub chat_options: ChatOptions,
	pub max_iterations: usize,
	pub request: &'a ExploreRequest,
	pub parent_ctx: &'a ToolContext,
	pub commit_handle: ExploreCommitHandle,
}

pub(super) struct Phase1Result {
	pub hit_max: bool,
	pub iterations_used: usize,
	/// Erreur LLM (flux coupé, I/O) : l'appelant retente ou assemble le partiel.
	pub llm_error: Option<String>,
}

pub(super) async fn run_explore_phase1(input: Phase1Input<'_>) -> Result<Phase1Result, ToolError> {
	let Phase1Input {
		llm,
		chat_options,
		max_iterations,
		request,
		parent_ctx,
		commit_handle,
	} = input;

	let mut system = EXPLORE_SYSTEM_PROMPT.to_string();
	system.push_str(thoroughness_supplement(request.thoroughness.as_deref()));

	let explore_ctx = ToolContext {
		workspace_root: parent_ctx.effective_workspace(),
		apply_fs_writes: false,
		plan_mode: true,
		allow_outside_workspace_read: parent_ctx.allow_outside_workspace_read,
		allow_outside_workspace_write: false,
		user_asker: None,
		session_notes: None,
		mcp_hub: None,
		scope_deferred: None,
		workspace_map: parent_ctx.workspace_map.clone(),
		drox_ignore: parent_ctx.drox_ignore.clone(),
		subagent_settings: None,
		subagent_executor: None,
		tool_progress: None,
		agent_run_id: parent_ctx.agent_run_id.clone(),
		chat_session_id: parent_ctx.chat_session_id.clone(),
		explore_commit: Some(commit_handle.clone()),
	};

	let registry = Arc::new(explore_tool_registry());
	let agent = Agent::new(
		llm,
		registry,
		explore_ctx,
		AgentConfig {
			system_prompt: Some(system),
			max_iterations,
			chat_options,
			max_parallel_tool_calls: 4,
			explore_execution: true,
			..AgentConfig::default()
		},
	);

	let prompt = format!(
		"## Subagent task (phase 1 — execution + explore_commit)\n\n{}\n\n\
         Gather evidence with tools. After each useful batch, call **`explore_commit`** \
         for each requested return kind (`kind` + markdown `body`; `append` to grow). \
         Close with **one** short `[phase: answering]` (optional `[phase: done]` same turn) \
         and **no tool calls**. Do not ask the user questions.",
		request.description.trim()
	);

	let started = Instant::now();
	let mut stream = agent.run(prompt);
	let mut report = String::new();
	let mut activity: Vec<String> = Vec::new();
	let mut last_progress = Instant::now()
		.checked_sub(EXPLORE_PROGRESS_INTERVAL)
		.unwrap_or_else(Instant::now);
	let mut hit_max = false;
	let mut iterations_used: usize = 0;
	let mut llm_error: Option<String> = None;
	// tool_call id → (name, args) pour apparier ToolFinish → L0.
	let mut pending: HashMap<String, (String, serde_json::Value)> = HashMap::new();

	let abort_at = empty_abort_threshold(max_iterations);

	while let Some(event) = stream.next().await {
		match event {
			Ok(AgentEvent::TurnUsage { .. }) => {
				iterations_used = iterations_used.saturating_add(1);
				// D2 : couper tôt si aucun commit ni evidence (évite brûler tout le budget).
				if iterations_used >= abort_at {
					let snap = commit_handle.snapshot();
					if snap.bodies.is_empty() && snap.evidence_paths.is_empty() {
						debug!(
							marker = "d2.explore_empty_abort",
							iterations_used,
							abort_at,
							max_iterations,
							"explore phase1 abort: 0 commit + 0 L0 evidence"
						);
						hit_max = true;
						break;
					}
				}
			}
			Ok(AgentEvent::ToolStart {
				id,
				name,
				arguments,
			}) => {
				if let Some(sink) = parent_ctx.tool_progress.as_ref() {
					sink.report_child_tool_start(id.as_str(), &name, &arguments);
				}
				pending.insert(id.as_str().to_string(), (name.clone(), arguments.clone()));
				activity.push(tool_activity_line(&name, &arguments));
				let live = build_live_preview(&activity, &report);
				flush_progress_throttled(parent_ctx, &live, started, &mut last_progress, true);
			}
			Ok(AgentEvent::ToolFinish {
				id,
				output,
				is_error,
			}) => {
				if let Some(sink) = parent_ctx.tool_progress.as_ref() {
					sink.report_child_tool_finish(id.as_str(), &output, is_error);
				}
				if let Some((name, args)) = pending.remove(id.as_str()) {
					let out_str = output
						.as_str()
						.map(str::to_string)
						.unwrap_or_else(|| output.to_string());
					record_tool_evidence(
						&commit_handle,
						&name,
						&args,
						Some(out_str.as_str()),
						is_error,
					);
				}
			}
			Ok(AgentEvent::TextDelta { text }) => {
				report.push_str(&text);
				if !text.is_empty() {
					let live = build_live_preview(&activity, &report);
					flush_progress_throttled(
						parent_ctx,
						&live,
						started,
						&mut last_progress,
						false,
					);
				}
			}
			Ok(AgentEvent::Stop { .. }) => break,
			Err(EngineError::MaxIterations(_)) => {
				hit_max = true;
				if iterations_used == 0 {
					iterations_used = max_iterations;
				}
				break;
			}
			Err(EngineError::Llm(e)) => {
				warn!(error = %e, iterations_used, "explore subagent LLM error — partial phase 1");
				llm_error = Some(e.to_string());
				break;
			}
			Err(e) => {
				warn!(error = %e, "explore subagent engine error");
				return Err(ToolError::remote(format!("subagent failed: {e}")));
			}
			_ => {}
		}
	}

	if hit_max {
		iterations_used = iterations_used.max(max_iterations);
	}

	let live = build_live_preview(&activity, &report);
	flush_progress_throttled(parent_ctx, &live, started, &mut last_progress, true);
	{
		let mut phase2 = activity.join("\n");
		if !phase2.is_empty() {
			phase2.push('\n');
		}
		phase2.push_str("--- phase: assemble (commits + L0) ---");
		flush_progress_throttled(parent_ctx, &phase2, started, &mut last_progress, true);
	}

	Ok(Phase1Result {
		hit_max,
		iterations_used,
		llm_error,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn empty_abort_threshold_half_budget_min_8() {
		assert_eq!(empty_abort_threshold(49), 24);
		assert_eq!(empty_abort_threshold(10), 8);
		assert_eq!(empty_abort_threshold(6), 6);
		assert_eq!(empty_abort_threshold(1), 1);
	}
}
