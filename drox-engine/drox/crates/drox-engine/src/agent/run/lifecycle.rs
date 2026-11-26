//! Cycle de vie autour de la boucle : transcript, snip, permissions, pré-gates.

use drox_permissions::PermissionDecision;
use drox_tools::ToolContext;
use drox_types::{Content, Message, Role};
use serde_json::Value;
use tokio::sync::mpsc;
use tracing::{debug, warn};
use crate::error::EngineError;
use crate::event::AgentEvent;
use crate::memory::{persist_run, MemoryTracker};

use super::super::dispatch::{
    confirm_with_user, first_user_text, format_tool_result_for_llm_with_profile,
    mirror_workspace_map_from_tool,
};
use super::super::gates::{
    is_todo_recreation_from_scratch, plan_write_gate_satisfied, requires_todo_write_gate,
    MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED, SESSION_END_FORBIDDEN_FOR_MODEL,
    TODO_RECREATION_BLOCKED,
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

    /// Réécrit le JSONL après snip/microcompact/compaction live et pose le
    /// curseur en fin de `messages` (C-1 + C-3).
    pub(crate) async fn rewrite_transcript_after_shrink(
        &self,
        messages: &[Message],
        cursor: &mut usize,
        leading_injected_systems: usize,
    ) -> Result<(), EngineError> {
        let Some(ts) = self.config.transcript.as_ref() else {
            return Ok(());
        };
        let persistable = messages_for_transcript_rewrite(messages, leading_injected_systems);
        ts.sink.rewrite_messages(&persistable).await?;
        // C-3 : tout le contenu persistable est sur disque ; les prochains
        // flush n'appendent que les messages ajoutés après cet index.
        *cursor = messages.len();
        debug!(
            persistable = persistable.len(),
            cursor = *cursor,
            "transcript rewritten after context shrink"
        );
        Ok(())
    }

    /// Gates pré-exécution (hors permissions). `Some(msg)` = bloquer avec erreur.
    pub(super) async fn run_tool_pre_gates(
        &self,
        call: &PendingToolCall,
        saw_successful_todo_write_in_run: bool,
        last_todo_ids: &std::collections::HashSet<String>,
        last_todo_was_all_completed: bool,
    ) -> Option<String> {
        if self.config.profile().todo_before_mutation_gate()
            && !plan_write_gate_satisfied(saw_successful_todo_write_in_run)
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
        if call.name == "todo_write"
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
    /// Append le texte LLM à `round_tool_outputs` (filet L-tools).
    pub(super) async fn apply_read_only_tool_success(
        &self,
        ctx: &ToolContext,
        call: &PendingToolCall,
        value: Value,
        memory_tracker: &mut MemoryTracker,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        messages: &mut Vec<Message>,
        round_tool_outputs: &mut String,
    ) -> bool {
        memory_tracker.record_tool(&call.name);
        mirror_workspace_map_from_tool(ctx, &call.name, &value).await;
        let for_llm = format_tool_result_for_llm_with_profile(
            &call.name,
            &value,
            &ctx.workspace_root,
            self.config.profile(),
        );
        if !round_tool_outputs.is_empty() {
            round_tool_outputs.push('\n');
        }
        round_tool_outputs.push_str(&for_llm);
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
        let read_only = crate::agent_permissions::is_read_only_tool(&call.name)
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

/// Messages à persister après shrink : exclut les systems injectés en tête
/// (re-poussés à chaque run) et les nudges éphémères ; conserve les
/// checkpoints de compaction.
fn messages_for_transcript_rewrite(
    messages: &[Message],
    leading_injected_systems: usize,
) -> Vec<Message> {
    messages
        .iter()
        .enumerate()
        .filter(|(i, m)| {
            if matches!(m.role, Role::System) {
                let text = Content::collapse_text(&m.content);
                if text.contains("[context checkpoint") {
                    return true;
                }
            }
            if *i < leading_injected_systems {
                return false;
            }
            matches!(m.role, Role::System) == false
        })
        .map(|(_, m)| m.clone())
        .collect()
}
