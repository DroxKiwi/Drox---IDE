//! `EngineSubagentExecutor` — phase 1 exécution (tools) puis phase 2 compte rendu.

use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use drox_llm::{ChatOptions, LlmClient};
use drox_tools::{
	ExploreOutcome, SubagentExecutor, SubagentSettings, ToolContext, ToolError,
};
use drox_types::{Message, StreamEvent};
use futures::StreamExt;
use tokio::sync::Semaphore;
use tracing::{debug, warn};

use crate::agent::{Agent, AgentConfig};
use crate::error::EngineError;
use crate::event::AgentEvent;

use super::budget::explore_iteration_budget;
use super::explore_ui_progress::{
	build_live_preview, flush_progress_throttled, tool_activity_line, EXPLORE_PROGRESS_INTERVAL,
};
use super::prompts::{thoroughness_supplement, EXPLORE_SYSTEM_PROMPT};
use super::explore_tool_registry::explore_tool_registry;
use super::report::{
	fallback_incomplete_report, parent_facing_report, strip_phase_markers, truncate_chars,
	EXPLORE_SYNTH_NOTES_MAX_CHARS,
};

/// Exécuteur moteur branché sur `ToolContext::subagent_executor`.
pub struct EngineSubagentExecutor {
	llm: Arc<dyn LlmClient>,
	chat_options: ChatOptions,
	settings: SubagentSettings,
	semaphore: Arc<Semaphore>,
}

impl EngineSubagentExecutor {
	#[must_use]
	pub fn new(
		llm: Arc<dyn LlmClient>,
		chat_options: ChatOptions,
		settings: SubagentSettings,
	) -> Self {
		let permits = settings.max_concurrent.max(1);
		Self {
			llm,
			chat_options,
			settings,
			semaphore: Arc::new(Semaphore::new(permits)),
		}
	}

	/// Phase 2 — tour **sans tools** : rapport parent (activity = contexte synth only).
	async fn synthesize_parent_report(
		&self,
		description: &str,
		draft_notes: &str,
		activity_for_synth: &[String],
		hit_max: bool,
	) -> Result<String, ToolError> {
		let notes = truncate_chars(draft_notes, EXPLORE_SYNTH_NOTES_MAX_CHARS);
		let activity_block = if activity_for_synth.is_empty() {
			"(no tool activity recorded)".to_string()
		} else {
			activity_for_synth.join("\n")
		};
		let ceiling = if hit_max {
			"Phase 1 (execution) hit its tool-turn ceiling before finishing. Phase 2 (report) must still produce the best structured report from available evidence."
		} else {
			"Phase 1 (execution) is complete. Phase 2 (report): distill a structured parent-facing report from the evidence below."
		};
		let user = format!(
			"{ceiling}\n\n\
## Original Explore task\n{description}\n\n\
## Working notes / partial assistant text (may be incomplete thinking — distill, do not paste verbatim)\n{notes}\n\n\
## Tools already attempted (synthesizer-only context — fold outcomes into Findings/Paths; \
DO NOT dump this tool list to the parent)\n{activity_block}\n\n\
Write ONLY the parent-facing report with these sections:\n\
## Findings\n## Paths\n## Gaps\n## Recommended next parent steps\n\n\
No tool calls. No preamble. No phase markers."
		);
		let messages = vec![
			Message::system(
				"You finalize Explore sub-agent reports for the parent agent. \
Output a concise structured report only. Never dump tool transcripts. \
Cite concrete paths and short facts the parent can act on.",
			),
			Message::user(user),
		];
		let options = self
			.chat_options
			.clone()
			.with_tools(Vec::new())
			.with_think(Some(false));
		let mut stream = self
			.llm
			.stream_chat(messages, options)
			.await
			.map_err(|e| ToolError::remote(format!("explore report synthesis failed: {e}")))?;
		let mut out = String::new();
		while let Some(ev) = stream.next().await {
			match ev {
				Ok(StreamEvent::TextDelta { text }) => out.push_str(&text),
				Ok(StreamEvent::Stop { .. }) => break,
				Ok(_) => {}
				Err(e) => {
					return Err(ToolError::remote(format!(
						"explore report synthesis stream error: {e}"
					)));
				}
			}
		}
		let cleaned = strip_phase_markers(out.trim());
		if cleaned.is_empty() {
			return Err(ToolError::remote("explore report synthesis empty"));
		}
		Ok(cleaned)
	}
}

#[async_trait]
impl SubagentExecutor for EngineSubagentExecutor {
	async fn run_explore(
		&self,
		description: String,
		thoroughness: Option<String>,
		parent_ctx: &ToolContext,
	) -> Result<ExploreOutcome, ToolError> {
		let _permit = self
			.semaphore
			.acquire()
			.await
			.map_err(|_| ToolError::remote("subagent semaphore closed"))?;

		let mut system = EXPLORE_SYSTEM_PROMPT.to_string();
		system.push_str(thoroughness_supplement(thoroughness.as_deref()));

		let max_iterations =
			explore_iteration_budget(self.settings.max_iterations, thoroughness.as_deref());

		// Pas de `tool_progress` sur le contexte enfant : activité → sink du `task` parent.
		let explore_ctx = ToolContext {
			workspace_root: parent_ctx.effective_workspace(),
			apply_fs_writes: false,
			plan_mode: true,
			allow_outside_workspace: parent_ctx.allow_outside_workspace,
			user_asker: None,
			session_notes: None,
			mcp_hub: None,
			scope_deferred: None,
			workspace_map: parent_ctx.workspace_map.clone(),
			drox_ignore: parent_ctx.drox_ignore.clone(),
			subagent_settings: None,
			subagent_executor: None,
			tool_progress: None,
		};

		let registry = Arc::new(explore_tool_registry());
		let agent = Agent::new(
			self.llm.clone(),
			registry,
			explore_ctx,
			AgentConfig {
				system_prompt: Some(system),
				max_iterations,
				chat_options: self.chat_options.clone(),
				permissions: None,
				context: None,
				transcript: None,
				memory: None,
				transcript_session_id: None,
				workspace_fingerprint: String::new(),
				max_parallel_tool_calls: 4,
				tool_hooks: None,
				run_objective: None,
				context_load: Default::default(),
				work_plan_frame: false,
			},
		);

		let prompt = format!(
			"## Subagent task (phase 1 — execution)\n\n{}\n\n\
             Gather evidence with tools. A dedicated **report phase** will always run afterward \
             to write the parent-facing structured report — focus on finding concrete paths and facts. \
             Honor any **Must return to parent** acceptance list in the brief. \
             Do not ask the user questions — the parent will.",
			description.trim()
		);

		debug!(
			max_iter = max_iterations,
			settings_max = self.settings.max_iterations,
			thoroughness = ?thoroughness,
			"explore subagent start (phase 1 — execution)"
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

		while let Some(event) = stream.next().await {
			match event {
				Ok(AgentEvent::TurnUsage { .. }) => {
					iterations_used = iterations_used.saturating_add(1);
				}
				Ok(AgentEvent::ToolStart {
					id,
					name,
					arguments,
				}) => {
					if let Some(sink) = parent_ctx.tool_progress.as_ref() {
						sink.report_child_tool_start(id.as_str(), &name, &arguments);
					}
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
				}
				Ok(AgentEvent::TextDelta { text }) => {
					report.push_str(&text);
					if !text.is_empty() {
						// Thinking live → ToolProgress (déjà throttlé). Pas de
						// SubagentChildTextDelta par token (canal mpsc 32).
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

		// Phase 2 — always: tools-off compte rendu for the parent (isolation).
		debug!(
			hit_max,
			iterations_used,
			max_iterations,
			notes_len = report.trim().len(),
			activity = activity.len(),
			"explore — phase 2 report"
		);
		{
			let mut phase2 = activity.join("\n");
			if !phase2.is_empty() {
				phase2.push('\n');
			}
			phase2.push_str("--- phase: report ---");
			flush_progress_throttled(parent_ctx, &phase2, started, &mut last_progress, true);
		}
		let report_body = match self
			.synthesize_parent_report(description.trim(), report.trim(), &activity, hit_max)
			.await
		{
			Ok(synth) => parent_facing_report(&synth, hit_max),
			Err(e) => {
				warn!(error = %e, "explore report phase failed — fallback");
				fallback_incomplete_report(report.trim(), hit_max)
			}
		};
		Ok(ExploreOutcome {
			report: report_body,
			truncated: hit_max,
			iterations_used,
			max_iterations,
		})
	}
}
