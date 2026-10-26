//! `EngineSubagentExecutor` — phase 1 (tools + commits) puis assemble 0-LLM.
//!
//! ```text
//! explore_executor/
//! ├── mod.rs      — orchestration
//! ├── phase1.rs   — boucle Agent + journal L0 + explore_commit
//! └── assemble.rs — kind map → bundle parent (blurb moteur)
//! ```

mod assemble;
mod phase1;

use std::sync::Arc;

use async_trait::async_trait;
use drox_llm::{ChatOptions, LlmClient};
use drox_tools::{
	ExploreCommitHandle, ExploreOutcome, ExploreRequest, SubagentExecutor, SubagentSettings,
	ToolContext, ToolError,
};
use tokio::sync::Semaphore;
use tracing::{debug, warn};

use super::budget::explore_iteration_budget;

use assemble::assemble_explore_outcome;
use phase1::{run_explore_phase1, Phase1Input, Phase1Result};

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

	fn execution_chat_options(&self) -> ChatOptions {
		let mut opts = self.chat_options.clone();
		// Défaut produit : thinking off en phase exec Explore.
		opts.think = Some(self.settings.execution_think);
		opts
	}
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

		let max_iterations = explore_iteration_budget(
			self.settings.max_iterations,
			request.thoroughness.as_deref(),
		);

		let commit_handle = ExploreCommitHandle::new(request.return_kinds.clone());

		debug!(
			max_iter = max_iterations,
			settings_max = self.settings.max_iterations,
			thoroughness = ?request.thoroughness,
			kinds = ?request.return_kinds.iter().map(|k| k.as_str()).collect::<Vec<_>>(),
			"explore subagent start (phase 1 — tools + explore_commit)"
		);

		// Flux LLM coupé avant tout commit / evidence : une seule relance.
		let mut attempt = 0;
		let phase1 = loop {
			let result = run_explore_phase1(Phase1Input {
				llm: self.llm.clone(),
				chat_options: self.execution_chat_options(),
				max_iterations,
				request: &request,
				parent_ctx,
				commit_handle: commit_handle.clone(),
			})
			.await?;
			let Some(err) = result.llm_error.as_deref() else {
				break result;
			};
			let snap = commit_handle.snapshot();
			let nothing_gathered = snap.bodies.is_empty() && snap.evidence_paths.is_empty();
			if nothing_gathered && attempt == 0 {
				attempt += 1;
				warn!(error = %err, "explore phase 1 LLM error before any evidence — retry once");
				continue;
			}
			if nothing_gathered {
				return Err(ToolError::remote(format!("subagent failed: LLM error: {err}")));
			}
			debug!(error = %err, "explore phase 1 LLM error — assembling partial delivery");
			break Phase1Result {
				hit_max: true,
				..result
			};
		};

		let snap = commit_handle.snapshot();
		debug!(
			hit_max = phase1.hit_max,
			iterations_used = phase1.iterations_used,
			max_iterations,
			committed = snap.bodies.len(),
			evidence = snap.evidence_paths.len(),
			"explore — assemble from commits (skip freeform JSON fill)"
		);

		assemble_explore_outcome(
			parent_ctx,
			session_id,
			&request,
			&commit_handle,
			phase1.hit_max,
			phase1.iterations_used,
			max_iterations,
		)
	}
}
