//! `EngineSubagentExecutor` — phase 1 exécution (tools) puis phase 2 compte rendu.

use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use drox_llm::{ChatOptions, LlmClient};
use drox_prompts::{
	explore_report_system_prompt, thoroughness_supplement, EXPLORE_SYSTEM_PROMPT,
};
use drox_tools::{
	format_kinds_json_contract, ExploreOutcome, ExploreRequest, ExploreReturnOptions,
	SubagentExecutor, SubagentSettings, ToolContext, ToolError,
};
use drox_types::{Message, StreamEvent};
use futures::StreamExt;
use tokio::sync::Semaphore;
use tracing::{debug, warn};

use crate::agent::{Agent, AgentConfig};
use crate::error::EngineError;
use crate::event::AgentEvent;

use super::budget::explore_iteration_budget;
use super::explore_artifact::{
	build_explore_summary, kind_body_usable, kinds_map_to_markdown, parse_explore_report_json,
	write_explore_bundle, EXPLORE_SUMMARY_MAX_CHARS,
};
use super::explore_tool_registry::explore_tool_registry;
use super::explore_ui_progress::{
	build_live_preview, flush_progress_throttled, tool_activity_line, EXPLORE_PROGRESS_INTERVAL,
};
use super::report::{
	fallback_incomplete_report, parent_facing_report, prepare_synth_notes, strip_phase_markers,
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
		kinds_contract: &str,
	) -> Result<String, ToolError> {
		let notes = prepare_synth_notes(draft_notes);
		let activity_block = if activity_for_synth.is_empty() {
			"(no tool activity recorded)".to_string()
		} else {
			// Cap activity: facts only, avoid flooding the synth turn.
			let joined = activity_for_synth.join("\n");
			if joined.len() > 2_500 {
				format!("…\n{}", &joined[joined.len().saturating_sub(2_500)..])
			} else {
				joined
			}
		};
		let ceiling = if hit_max {
			"Phase 1 hit its tool-turn ceiling. Phase 2 must still emit the JSON report from available evidence."
		} else {
			"Phase 1 complete. Phase 2: emit the parent-facing JSON report from the evidence below."
		};
		let contract_block = if kinds_contract.trim().is_empty() {
			format_kinds_json_contract(&[], &ExploreReturnOptions::default())
		} else {
			kinds_contract.to_string()
		};
		let user = format!(
			"{ceiling}\n\n\
## Original Explore task\n{description}\n\n\
## Evidence notes (facts only — copy concrete paths/facts into JSON string values; \
do not narrate your plan)\n{notes}\n\n\
## Tools already attempted (context only — fold outcomes into kind values; \
DO NOT dump this list)\n{activity_block}\n\n\
{contract_block}\n\
Reply with the JSON object only. First character `{{`. No prose before or after."
		);
		let messages = vec![
			Message::system(explore_report_system_prompt()),
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

	fn execution_chat_options(&self) -> ChatOptions {
		let mut opts = self.chat_options.clone();
		// Défaut produit : thinking off en phase exec Explore (évite notes CoT → synth).
		// Override explicite via `SubagentSettings::execution_think`.
		opts.think = Some(self.settings.execution_think);
		opts
	}
}

/// Parse JSON + refuse si tous les kinds demandés sont stubs / méta.
fn accept_json_kinds(
	raw: &str,
	kinds: &[drox_tools::ExploreReturnKind],
) -> Result<
	(
		std::collections::BTreeMap<String, String>,
		Option<String>,
	),
	String,
> {
	let (map, next) = parse_explore_report_json(raw, kinds)?;
	if kinds.is_empty() {
		return Ok((map, next));
	}
	let usable = kinds
		.iter()
		.filter(|k| {
			map.get(k.as_str())
				.map(|b| kind_body_usable(b))
				.unwrap_or(false)
		})
		.count();
	if usable == 0 {
		return Err("JSON parsed but every kind body is stub/meta/CoT".into());
	}
	Ok((map, next))
}

#[async_trait]
impl SubagentExecutor for EngineSubagentExecutor {
	async fn run_explore(
		&self,
		request: ExploreRequest,
		parent_ctx: &ToolContext,
	) -> Result<ExploreOutcome, ToolError> {
		let _permit = self
			.semaphore
			.acquire()
			.await
			.map_err(|_| ToolError::remote("subagent semaphore closed"))?;

		let session_id = parent_ctx
			.chat_session_id
			.as_deref()
			.map(str::trim)
			.filter(|s| !s.is_empty())
			.ok_or_else(|| {
				ToolError::invalid_args(
					"Explore requires chat session id (ses_…) — cannot write session-scoped artifacts",
				)
			})?;

		// Phase-1 kinds brief is already embedded in `request.description` via `task`.
		let json_contract =
			format_kinds_json_contract(&request.return_kinds, &request.return_options);

		let mut system = EXPLORE_SYSTEM_PROMPT.to_string();
		system.push_str(thoroughness_supplement(request.thoroughness.as_deref()));

		let max_iterations = explore_iteration_budget(
			self.settings.max_iterations,
			request.thoroughness.as_deref(),
		);

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
		};

		let registry = Arc::new(explore_tool_registry());
		let agent = Agent::new(
			self.llm.clone(),
			registry,
			explore_ctx,
			AgentConfig {
				system_prompt: Some(system),
				max_iterations,
				chat_options: self.execution_chat_options(),
				max_parallel_tool_calls: 4,
				explore_execution: true,
				..AgentConfig::default()
			},
		);

		let prompt = format!(
			"## Subagent task (phase 1 — execution)\n\n{}\n\n\
             Gather evidence with tools. When done, close with **one** short `[phase: answering]` \
             (optional `[phase: done]` same turn) — the engine stops and a **report phase** always \
             writes the parent-facing structured report from your notes. Focus on concrete paths \
             and facts. Honor any **Must return to parent** list and **Return contract** kinds. \
             Do not ask the user questions — the parent will.",
			request.description.trim()
		);

		debug!(
			max_iter = max_iterations,
			settings_max = self.settings.max_iterations,
			thoroughness = ?request.thoroughness,
			kinds = ?request.return_kinds.iter().map(|k| k.as_str()).collect::<Vec<_>>(),
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
		let synth_notes = prepare_synth_notes(report.trim());
		let (report_body, kind_bodies) = match self
			.synthesize_parent_report(
				request.description.trim(),
				&synth_notes,
				&activity,
				hit_max,
				&json_contract,
			)
			.await
		{
			Ok(synth) => match accept_json_kinds(&synth, &request.return_kinds) {
				Ok((map, next)) => {
					let md = kinds_map_to_markdown(&map, &request.return_kinds, next.as_deref());
					(parent_facing_report(&md, hit_max), Some(map))
				}
				Err(first_err) => {
					debug!(error = %first_err, "explore report JSON rejected — retry once");
					let retry_contract = format!(
						"{json_contract}\n\nPREVIOUS OUTPUT REJECTED ({first_err}). \
						 Reply with ONLY the JSON object. First char `{{`. No prose."
					);
					match self
						.synthesize_parent_report(
							request.description.trim(),
							&synth_notes,
							&activity,
							hit_max,
							&retry_contract,
						)
						.await
					{
						Ok(synth2) => match accept_json_kinds(&synth2, &request.return_kinds) {
							Ok((map, next)) => {
								let md = kinds_map_to_markdown(
									&map,
									&request.return_kinds,
									next.as_deref(),
								);
								(parent_facing_report(&md, hit_max), Some(map))
							}
							Err(e2) => {
								warn!(
									error = %e2,
									"explore report JSON retry rejected — incomplete (no soft markdown OK)"
								);
								(fallback_incomplete_report(&synth_notes, hit_max), None)
							}
						},
						Err(e) => {
							warn!(error = %e, "explore report JSON retry stream failed — incomplete");
							(fallback_incomplete_report(&synth_notes, hit_max), None)
						}
					}
				}
			},
			Err(e) => {
				warn!(error = %e, "explore report phase failed — incomplete");
				(fallback_incomplete_report(&synth_notes, hit_max), None)
			}
		};
		let ws = parent_ctx.effective_workspace();
		match write_explore_bundle(
			&ws,
			session_id,
			request.title.as_deref(),
			request.plan_step_id.as_deref(),
			&request.return_kinds,
			&request.return_options,
			&report_body,
			kind_bodies.as_ref(),
			hit_max,
		) {
			Ok(bundle) => {
				let kinds_incomplete = bundle.kinds_incomplete;
				let truncated = hit_max || !kinds_incomplete.is_empty();
				Ok(ExploreOutcome {
					explore_id: bundle.explore_id,
					report: report_body,
					report_path: Some(bundle.report_path),
					summary: bundle.summary,
					blurb: bundle.blurb,
					artifacts: bundle.artifacts,
					kinds_incomplete,
					truncated,
					iterations_used,
					max_iterations,
				})
			}
			Err(e) => {
				warn!(error = %e, "explore artifact write failed");
				let summary = build_explore_summary(&report_body, EXPLORE_SUMMARY_MAX_CHARS);
				Ok(ExploreOutcome {
					explore_id: format!(
						"exp_adhoc_{}",
						chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ")
					),
					report: report_body,
					report_path: None,
					blurb: drox_tools::build_blurb(&summary, drox_tools::EXPLORE_BLURB_MAX_CHARS),
					summary,
					artifacts: Default::default(),
					kinds_incomplete: request
						.return_kinds
						.iter()
						.map(|k| k.as_str().to_string())
						.collect(),
					truncated: true,
					iterations_used,
					max_iterations,
				})
			}
		}
	}
}
