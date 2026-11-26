//! Mutation de contexte avant appel LLM (sémantique Cline `prepareTurn` — phase shrink).

use tokio::sync::mpsc;
use tracing::debug;
use uuid::Uuid;

use drox_llm::ToolSpec;

use crate::agent::history_transport;
use crate::agent::prepare_turn::{load_turn_context, TurnContextLoad, MAX_INPUT_UNDERESTIMATE_FACTOR};
use crate::agent::status_notice::emit_status_notice;
use crate::compaction::try_basic_compact;
use crate::error::EngineError;
use crate::event::{AgentEvent, StatusNoticeLevel};
use crate::long_memory::ContextChunkSummaryV1;
use drox_types::Message;

use super::Agent;

/// Résultat de la phase shrink (après situation card ; nudges tour courant hors périmètre).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PrepareShrinkOutcome {
    pub tokens_after: usize,
    pub did_compact: bool,
    pub blocked: bool,
}

impl Agent {
    fn turn_context_load(
        &self,
        policy: &crate::context_policy::ContextPolicy,
        messages: &[Message],
        tool_specs: &[ToolSpec],
        last_turn_input_tokens: usize,
    ) -> TurnContextLoad {
        let transport = history_transport::for_model(messages);
        load_turn_context(
            policy,
            &transport,
            tool_specs,
            None,
            last_turn_input_tokens,
        )
    }

    /// Hot snip → microcompact → snip → live/basic ; applique le blocage 97 %.
    pub(crate) async fn run_shrink_phase(
        &self,
        messages: &mut Vec<Message>,
        tool_specs: &[ToolSpec],
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        live_compaction_seq: &mut u32,
        transcript_cursor: &mut usize,
        leading_injected_systems: usize,
        last_turn_input_tokens: usize,
    ) -> Result<PrepareShrinkOutcome, ()> {
        let Some(policy) = self.config.context.as_ref() else {
            return Ok(PrepareShrinkOutcome {
                tokens_after: 0,
                did_compact: false,
                blocked: false,
            });
        };
        let provider_floor = last_turn_input_tokens.saturating_div(MAX_INPUT_UNDERESTIMATE_FACTOR);
        let mut load = self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
        let mut decision_policy = policy.with_decision_budget(load.decision_budget.clone());
        let mut request_tokens = load.estimate.request_tokens;
        let mut disk_dirty = false;
        let mut did_compact = false;

        if let Some(report) = policy.maybe_snip_hot_for_profile(
            messages,
            Some(self.ctx.workspace_root.as_ref()),
            self.config.profile(),
        ) {
            let tokens_before = request_tokens;
            load = self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
            decision_policy = policy.with_decision_budget(load.decision_budget.clone());
            request_tokens = load.estimate.request_tokens;
            debug!(
                marker = "c1.hot_snip",
                tokens_before,
                tokens_after = request_tokens,
                tokens_freed = report.tokens_freed,
                blocks_snipped = report.blocks_snipped,
                message_tokens = load.estimate.message_tokens,
                "dogfood: hot context snip applied (S-2/C1)"
            );
            disk_dirty = true;
            tx.send(Ok(AgentEvent::ContextSnip {
                tokens_freed: report.tokens_freed,
                blocks_snipped: report.blocks_snipped,
                tokens_used_after: request_tokens,
            }))
            .await
            .map_err(|_| ())?;
        }

        let mut state = load.warning_state();
        if !state.above_autocompact {
            return self
                .finish_shrink(
                    messages,
                    tool_specs,
                    tx,
                    transcript_cursor,
                    leading_injected_systems,
                    disk_dirty,
                    policy,
                    last_turn_input_tokens,
                    provider_floor,
                    request_tokens,
                    did_compact,
                )
                .await;
        }
        if let Some(mc) = policy.maybe_microcompact(messages) {
            load = self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
            decision_policy = policy.with_decision_budget(load.decision_budget.clone());
            request_tokens = load.estimate.request_tokens;
            debug!(
                tools_cleared = mc.tools_cleared,
                blocks_cleared = mc.blocks_cleared,
                request_tokens,
                message_tokens = load.estimate.message_tokens,
                "microcompact applied"
            );
            disk_dirty = true;
            state = load.warning_state();
            if !state.above_autocompact {
                return self
                    .finish_shrink(
                        messages,
                        tool_specs,
                        tx,
                        transcript_cursor,
                        leading_injected_systems,
                        disk_dirty,
                        policy,
                        last_turn_input_tokens,
                        provider_floor,
                        request_tokens,
                        did_compact,
                    )
                    .await;
            }
        }
        if let Some(report) = policy.maybe_snip(messages) {
            let tokens_before_snip = request_tokens;
            load = self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
            decision_policy = policy.with_decision_budget(load.decision_budget.clone());
            request_tokens = load.estimate.request_tokens;
            debug!(
                tokens_before = tokens_before_snip,
                tokens_after = request_tokens,
                tokens_freed = report.tokens_freed,
                blocks_snipped = report.blocks_snipped,
                "context snip applied"
            );
            disk_dirty = true;
            tx.send(Ok(AgentEvent::ContextSnip {
                tokens_freed: report.tokens_freed,
                blocks_snipped: report.blocks_snipped,
                tokens_used_after: request_tokens,
            }))
            .await
            .map_err(|_| ())?;
            state = load.warning_state();
        }
        if !state.above_autocompact {
            return self
                .finish_shrink(
                    messages,
                    tool_specs,
                    tx,
                    transcript_cursor,
                    leading_injected_systems,
                    disk_dirty,
                    policy,
                    last_turn_input_tokens,
                    provider_floor,
                    request_tokens,
                    did_compact,
                )
                .await;
        }
        let Some(memory) = self.config.memory.as_ref() else {
            if state.above_autocompact {
                if let Some(basic) = self
                    .emit_basic_compact(
                        messages,
                        &decision_policy,
                        provider_floor,
                        request_tokens,
                        tx,
                    )
                    .await?
                {
                    disk_dirty = true;
                    did_compact = true;
                    load =
                        self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
                    request_tokens = load.estimate.request_tokens;
                    let freed = basic.tokens_before.saturating_sub(basic.tokens_after);
                    let _ = tx
                        .send(Ok(AgentEvent::ContextSnip {
                            tokens_freed: freed,
                            blocks_snipped: basic.messages_removed,
                            tokens_used_after: request_tokens,
                        }))
                        .await;
                }
            }
            return self
                .finish_shrink(
                    messages,
                    tool_specs,
                    tx,
                    transcript_cursor,
                    leading_injected_systems,
                    disk_dirty,
                    policy,
                    last_turn_input_tokens,
                    provider_floor,
                    request_tokens,
                    did_compact,
                )
                .await;
        };
        if let Some(report) = crate::compaction::compact_until_budget(
            memory.llm.as_ref(),
            memory.compaction_prompt.as_str(),
            messages,
            &decision_policy,
            &memory.compaction_config,
            Some(request_tokens),
        )
        .await
        {
            disk_dirty = true;
            did_compact = true;
            *live_compaction_seq = live_compaction_seq.saturating_add(1);
            load = self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
            request_tokens = load.estimate.request_tokens;
            let transcript_sid = self
                .config
                .transcript_session_id
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("ses_none");
            let fingerprint = if self.config.workspace_fingerprint.is_empty() {
                self.ctx.workspace_root.as_str().to_string()
            } else {
                self.config.workspace_fingerprint.clone()
            };
            let ccs = ContextChunkSummaryV1 {
                schema_version: 1,
                id: format!("ccs_{}", Uuid::new_v4()),
                workspace_fingerprint: fingerprint,
                transcript_session_id: transcript_sid.to_string(),
                created_at: chrono::Utc::now(),
                compaction_seq: *live_compaction_seq,
                tokens_before: report.tokens_before,
                tokens_after: report.tokens_after,
                summary_text: report.summary_text.clone(),
                files_touched: report.files_touched.clone(),
                tags_suggested: Vec::new(),
                checkpoint_message_id: None,
            };
            tx.send(Ok(AgentEvent::ContextCompacted {
                tokens_before: report.tokens_before,
                tokens_after: report.tokens_after,
                messages_removed: report.messages_removed,
                usage: report.usage,
                context_chunk_summary: Some(ccs),
            }))
            .await
            .map_err(|_| ())?;
        }
        self.finish_shrink(
            messages,
            tool_specs,
            tx,
            transcript_cursor,
            leading_injected_systems,
            disk_dirty,
            policy,
            last_turn_input_tokens,
            provider_floor,
            request_tokens,
            did_compact,
        )
        .await
    }

    async fn finish_shrink(
        &self,
        messages: &mut Vec<Message>,
        tool_specs: &[ToolSpec],
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        transcript_cursor: &mut usize,
        leading_injected_systems: usize,
        disk_dirty: bool,
        policy: &crate::context_policy::ContextPolicy,
        last_turn_input_tokens: usize,
        provider_floor: usize,
        _request_tokens_hint: usize,
        mut did_compact: bool,
    ) -> Result<PrepareShrinkOutcome, ()> {
        let mut disk_dirty = disk_dirty;
        let load = self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
        let decision_policy = policy.with_decision_budget(load.decision_budget.clone());
        let mut request_tokens = load.estimate.request_tokens;
        let mut state = load.warning_state();
        if state.at_blocking_limit {
            if let Some(basic) = self
                .emit_basic_compact(
                    messages,
                    &decision_policy,
                    provider_floor,
                    request_tokens,
                    tx,
                )
                .await?
            {
                did_compact = true;
                let load =
                    self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
                request_tokens = load.estimate.request_tokens;
                let freed = basic.tokens_before.saturating_sub(basic.tokens_after);
                let _ = tx
                    .send(Ok(AgentEvent::ContextSnip {
                        tokens_freed: freed,
                        blocks_snipped: basic.messages_removed,
                        tokens_used_after: request_tokens,
                    }))
                    .await;
                state = load.warning_state();
                disk_dirty = true;
            }
            if state.at_blocking_limit {
                let _ = emit_status_notice(
                    tx,
                    "context_blocking",
                    StatusNoticeLevel::Warn,
                    format!(
                        "Contexte saturé (~{} tok requête, limite {}) — compaction requise avant nouvel appel LLM.",
                        request_tokens,
                        load.decision_budget.blocking_limit()
                    ),
                )
                .await;
                if disk_dirty {
                    if let Err(e) = self
                        .rewrite_transcript_after_shrink(
                            messages,
                            transcript_cursor,
                            leading_injected_systems,
                        )
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return Err(());
                    }
                }
                return Ok(PrepareShrinkOutcome {
                    tokens_after: request_tokens,
                    did_compact,
                    blocked: true,
                });
            }
        }
        if disk_dirty {
            if let Err(e) = self
                .rewrite_transcript_after_shrink(
                    messages,
                    transcript_cursor,
                    leading_injected_systems,
                )
                .await
            {
                let _ = tx.send(Err(e)).await;
                return Err(());
            }
        }
        Ok(PrepareShrinkOutcome {
            tokens_after: request_tokens,
            did_compact,
            blocked: false,
        })
    }

    async fn emit_basic_compact(
        &self,
        messages: &mut Vec<Message>,
        decision_policy: &crate::context_policy::ContextPolicy,
        provider_floor: usize,
        request_gate: usize,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    ) -> Result<Option<crate::compaction::BasicCompactReport>, ()> {
        let Some(basic) =
            try_basic_compact(messages, decision_policy, provider_floor, Some(request_gate))
        else {
            return Ok(None);
        };
        let _ = emit_status_notice(
            tx,
            "compaction_failed_fallback_basic",
            StatusNoticeLevel::Info,
            format!(
                "Compaction déterministe : {}→{} tok estimés.",
                basic.tokens_before, basic.tokens_after
            ),
        )
        .await;
        let _ = emit_status_notice(
            tx,
            "context_overflow_recovery",
            StatusNoticeLevel::Info,
            "Récupération contexte (basic compaction, sans LLM).",
        )
        .await;
        Ok(Some(basic))
    }

    /// Filet après erreur provider `context_length_exceeded` — une passe basic.
    pub(crate) async fn try_context_overflow_recovery(
        &self,
        messages: &mut Vec<Message>,
        tool_specs: &[ToolSpec],
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        transcript_cursor: &mut usize,
        leading_injected_systems: usize,
        last_turn_input_tokens: usize,
    ) -> bool {
        let Some(policy) = self.config.context.as_ref() else {
            return false;
        };
        let provider_floor = last_turn_input_tokens.saturating_div(MAX_INPUT_UNDERESTIMATE_FACTOR);
        let load = self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
        let decision_policy = policy.with_decision_budget(load.decision_budget.clone());
        let request_gate = load.estimate.request_tokens.max(last_turn_input_tokens);
        let Ok(Some(basic)) = self
            .emit_basic_compact(
                messages,
                &decision_policy,
                provider_floor,
                request_gate,
                tx,
            )
            .await
        else {
            return false;
        };
        let after_load = self.turn_context_load(policy, messages, tool_specs, last_turn_input_tokens);
        let request_tokens = after_load.estimate.request_tokens;
        let freed = basic.tokens_before.saturating_sub(basic.tokens_after);
        let _ = tx
            .send(Ok(AgentEvent::ContextSnip {
                tokens_freed: freed,
                blocks_snipped: basic.messages_removed,
                tokens_used_after: request_tokens,
            }))
            .await;
        let _ = self
            .rewrite_transcript_after_shrink(
                messages,
                transcript_cursor,
                leading_injected_systems,
            )
            .await;
        true
    }
}