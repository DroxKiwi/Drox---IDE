//! Cycle de vie autour de la boucle : transcript, snip, permissions, pré-gates.

use drox_permissions::PermissionDecision;
use drox_tools::ToolContext;
use drox_types::{Message, Role};
use serde_json::Value;
use tokio::sync::mpsc;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::error::EngineError;
use crate::event::AgentEvent;
use crate::long_memory::ContextChunkSummaryV1;
use crate::memory::{persist_run, MemoryTracker};

use super::super::dispatch::{
    confirm_with_user, first_user_text, format_tool_result_for_llm, mirror_workspace_map_from_tool,
};
use super::super::gates::{
    is_todo_recreation_from_scratch, plan_write_gate_satisfied, requires_todo_write_gate,
    MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED, SESSION_END_FORBIDDEN_FOR_MODEL,
    TODO_RECREATION_BLOCKED, TODO_WRITE_FORBIDDEN_IN_PROFESSOR,
};
use super::super::hallucination::{
    is_hallucinated_phase_tool_call, PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL,
};
use super::super::loop_detect::PendingToolCall;
use super::Agent;

impl Agent {
    pub(super) async fn flush_transcript(
        &self,
        messages: &[Message],
        cursor: &mut usize,
    ) -> Result<(), EngineError> {
        let Some(ts) = self.config.transcript.as_ref() else {
            return Ok(());
        };
        let start = (*cursor).min(messages.len());
        for m in &messages[start..] {
            if matches!(m.role, Role::System) {
                continue;
            }
            let rec = drox_session::ChatMessageRecord::new(m);
            ts.sink.append_record(&rec).await?;
        }
        *cursor = messages.len();
        Ok(())
    }

    /// Sprint M1 — persistance de la session si le run a été non trivial.
    ///
    /// Best-effort : un échec d'archivage ne casse pas la clôture du run.
    /// On log et on continue vers `Stop`. L'événement `MemoryPersisted`
    /// n'est émis qu'en cas de succès complet (compaction + écriture).
    ///
    /// L'`objective_fallback` est extrait de la première ligne non vide du
    /// premier message `user` du run — utilisé pour le slug si la
    /// compaction n'a pas livré de section `## Objective`.
    pub(super) async fn maybe_persist_session(
        &self,
        messages: &[Message],
        tracker: &MemoryTracker,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    ) {
        let Some(memory) = self.config.memory.as_ref() else {
            return;
        };
        if !tracker.is_non_trivial() {
            debug!("memory: run trivial, no persistence");
            return;
        }
        let fallback = first_user_text(messages).unwrap_or_else(|| "session".to_string());
        match persist_run(memory, messages, &fallback).await {
            Ok(persisted) => {
                debug!(
                    slug = %persisted.slug,
                    path = %persisted.path,
                    "memory: session persisted (emitting MemoryPersisted)"
                );
                let _ = tx
                    .send(Ok(AgentEvent::MemoryPersisted {
                        slug: persisted.slug,
                        path: persisted.path.to_string(),
                        objective: persisted.result.objective,
                        usage: persisted.result.usage,
                    }))
                    .await;
            }
            Err(e) => {
                warn!(
                    error = %e,
                    "memory: persistence failed — run still closes cleanly"
                );
            }
        }
    }

    /// Si la `ContextPolicy` est définie et que l'historique dépasse le seuil
    /// `autocompact` : (1) passe de **snip** synchrone sur les gros
    /// `tool_result` ; (2) si toujours au-dessus du seuil **et** que
    /// `memory` est configuré, **compaction LLM live** (checkpoint `system`)
    /// via [`crate::compaction::try_live_compact`]. Émet `ContextSnip` et/ou
    /// `ContextCompacted`.
    ///
    /// Retourne `Err(())` si le canal de sortie est fermé (cas où l'agent
    /// doit s'arrêter sans bruit).
    pub(super) async fn maybe_snip(
        &self,
        messages: &mut Vec<Message>,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        live_compaction_seq: &mut u32,
    ) -> Result<(), ()> {
        let Some(policy) = self.config.context.as_ref() else {
            return Ok(());
        };
        let mut tokens = policy.count_tokens(messages);
        let mut state = policy.budget().evaluate(tokens);
        if !state.above_autocompact {
            return Ok(());
        }
        if let Some(mc) = policy.maybe_microcompact(messages) {
            tokens = policy.count_tokens(messages);
            debug!(
                tools_cleared = mc.tools_cleared,
                blocks_cleared = mc.blocks_cleared,
                tokens_after = tokens,
                "microcompact applied"
            );
            state = policy.budget().evaluate(tokens);
            if !state.above_autocompact {
                return Ok(());
            }
        }
        if let Some(report) = policy.maybe_snip(messages) {
            let tokens_before_snip = tokens;
            tokens = policy.count_tokens(messages);
            debug!(
                tokens_before = tokens_before_snip,
                tokens_after = tokens,
                tokens_freed = report.tokens_freed,
                blocks_snipped = report.blocks_snipped,
                "context snip applied"
            );
            tx.send(Ok(AgentEvent::ContextSnip {
                tokens_freed: report.tokens_freed,
                blocks_snipped: report.blocks_snipped,
                tokens_used_after: tokens,
            }))
            .await
            .map_err(|_| ())?;
            state = policy.budget().evaluate(tokens);
        }
        if !state.above_autocompact {
            return Ok(());
        }
        let Some(memory) = self.config.memory.as_ref() else {
            return Ok(());
        };
        if let Some(report) = crate::compaction::compact_until_budget(
            memory.llm.as_ref(),
            memory.compaction_prompt.as_str(),
            messages,
            policy,
            &memory.compaction_config,
        )
        .await
        {
            *live_compaction_seq = live_compaction_seq.saturating_add(1);
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
        Ok(())
    }

    /// Gates pré-exécution (hors permissions). `Some(msg)` = bloquer avec erreur.
    pub(super) async fn run_tool_pre_gates(
        &self,
        call: &PendingToolCall,
        professor: bool,
        professor_course_state: &crate::professor::ProfessorCourseState,
        saw_successful_todo_write_in_run: bool,
        last_todo_ids: &std::collections::HashSet<String>,
        last_todo_was_all_completed: bool,
    ) -> Option<String> {
        if professor && call.name == "todo_write" {
            return Some(TODO_WRITE_FORBIDDEN_IN_PROFESSOR.to_string());
        }
        if professor {
            if let Some(msg) = crate::professor::check_mutating_tool(
                &call.name,
                &call.arguments,
                professor_course_state,
            ) {
                return Some(msg.to_string());
            }
        } else if !plan_write_gate_satisfied(false, saw_successful_todo_write_in_run, false)
            && requires_todo_write_gate(&call.name, &call.arguments, &self.ctx.workspace_root)
        {
            return Some(MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED.to_string());
        }
        if is_hallucinated_phase_tool_call(&call.name, &call.arguments) {
            return Some(PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL.to_string());
        }
        if call.name == "session_end" {
            return Some(SESSION_END_FORBIDDEN_FOR_MODEL.to_string());
        }
        if !professor
            && call.name == "todo_write"
            && is_todo_recreation_from_scratch(
                &call.arguments,
                last_todo_ids,
                last_todo_was_all_completed,
            )
        {
            return Some(TODO_RECREATION_BLOCKED.to_string());
        }
        None
    }

    /// Applique le succès d'un tool read-only (lot parallèle §2.29).
    pub(super) async fn apply_read_only_tool_success(
        &self,
        ctx: &ToolContext,
        call: &PendingToolCall,
        value: Value,
        memory_tracker: &mut MemoryTracker,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        messages: &mut Vec<Message>,
    ) -> bool {
        memory_tracker.record_tool(&call.name);
        mirror_workspace_map_from_tool(ctx, &call.name, &value).await;
        let for_llm = format_tool_result_for_llm(&call.name, &value);
        if tx
            .send(Ok(AgentEvent::ToolFinish {
                id: call.id.clone(),
                output: value,
                is_error: false,
            }))
            .await
            .is_err()
        {
            return false;
        }
        messages.push(Message::tool_result(call.id.clone(), for_llm, false));
        true
    }

    /// Évalue la permission pour un tool call. Renvoie `Some(message)` si la
    /// décision finale est un refus (à pousser comme `tool_result` d'erreur),
    /// `None` si le tool peut s'exécuter.
    pub(super) async fn check_permission(&self, call: &PendingToolCall) -> Option<String> {
        let policy = self.config.permissions.as_ref()?;
        let read_only = crate::permissions::is_read_only_tool(&call.name)
            || self
                .registry
                .get(&call.name)
                .is_some_and(|t| t.is_read_only());
        let decision = policy.evaluate_with_read_only_hint(
            &call.name,
            &call.arguments,
            Some(read_only),
        );
        match decision {
            PermissionDecision::Allow { reason } => {
                debug!(tool = %call.name, ?reason, "tool autorisé");
                None
            }
            PermissionDecision::Deny { reason, message } => {
                warn!(tool = %call.name, ?reason, "tool refusé");
                Some(message)
            }
            PermissionDecision::Ask { reason, message } => {
                debug!(tool = %call.name, ?reason, "tool nécessite confirmation");
                if confirm_with_user(&self.ctx, &call.name, &call.arguments, &message).await {
                    None
                } else {
                    Some(format!("User denied permission for `{}`.", call.name))
                }
            }
        }
    }
}
