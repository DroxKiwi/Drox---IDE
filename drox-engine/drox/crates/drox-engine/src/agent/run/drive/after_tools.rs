//! Boucle différée après outils et rappel step-by-step.

#![allow(unused_imports)]
#![allow(clippy::too_many_lines)]

use super::super::super::loop_detect::TurnOutcome;
use super::super::Agent;
use super::Turn;
use super::helpers::{bash_stopped_if_requested, history_probe_snapshot, tool_apply_failed};
use super::state::DriveState;

use std::collections::{HashMap, VecDeque};

use drox_hooks::{PostHookOutcome, PreHookOutcome, ToolHookContext};
use drox_tools::ToolError;
use drox_types::{Content, Message, Role, StopReason, ToolUseId, Usage};
use futures::{StreamExt, stream};
use serde_json::Value;
use tokio::sync::mpsc;
use tracing::debug;

use crate::error::EngineError;
use crate::event::{AgentEvent, HistoryProbeEntry, Phase};
use crate::memory::MemoryTracker;
use crate::tool_orchestration::{ToolCallBatch, partition_tool_calls, serial_tool_call_batches};
use crate::tool_progress::ToolProgressBridge;

use super::super::super::config::EngineProfile;
use super::super::super::consume_llm_stream::{consume_stream, push_assistant_message};
use super::super::super::context_load::{
    ContextLoadSnapshot, score as score_context_load, should_inject as should_inject_context_load,
    snapshot_from_glob_value,
};
use super::super::super::dispatch::{
    build_tool_specs, format_tool_result_for_llm_with_profile, mirror_workspace_map_from_tool,
    push_tool_error_tracked,
};
use super::super::super::gates::{
    counts_as_mutating_for_step_tracking, plan_write_gate_satisfied, record_counts_as_code_mutation,
};
use super::super::super::loop_close::{
    ENGINE_CLOSURE_EMPTY_REPLY, ENGINE_CLOSURE_TEXTUAL_TOOL_REPLY, emit_engine_closure,
    emit_synthetic_done,
};
use super::super::super::loop_detect::{LoopDecision, LoopDetector, PendingToolCall};
use super::super::super::nudges::{
    DOC_INGESTION_EXPLORE_ANNEX, DONE_ONLY_NUDGE_PROMPT, EXPLORE_ARTIFACT_READ_FAIL_NUDGE,
    EXPLORE_COVERED_REREAD_NUDGE, EXPLORE_RESCUE_PARENT_READ_NUDGE,
    INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT, INTENT_ONLY_WRITE_MAX_NUDGES,
    INTENT_ONLY_WRITE_NUDGE_PROMPT, LOCAL_EMPTY_TURN_NUDGE, LOCAL_EXPLORE_KICKOFF_NUDGE,
    LOCAL_FINAL_ANSWER_PROMPT, LOCAL_SOFT_CLOSE_CHECK_NUDGE, LOCAL_TEXTUAL_TOOL_NUDGE,
    LOCAL_TEXTUAL_TOOL_TOOLS_OFF_NUDGE, LOOP_DETECTED_NUDGE_PROMPT, LOOP_FORCE_CONCLUDE_PROMPT,
    LOOP_TOOL_FAMILY_NUDGE_PROMPT, MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
    MICRO_ACT_WRITE_NUDGE, MISSING_ANSWERING_PROMPT, NUDGE_PROMPT, PARENT_HEAVY_READ_NUDGE,
    PARENT_HEAVY_READ_NUDGE_THRESHOLD, PARENT_HEAVY_READ_PREFIX, POST_ASK_ACTING_NUDGE,
    POST_EXPLORE_STALL_ACT_NUDGE, POST_EXPLORE_STALL_READ_THRESHOLD, POST_MERGE_CLOSURE_NUDGE,
    REPEATED_FILE_READ_NUDGE, REPEATED_FILE_READ_NUDGE_THRESHOLD, ROTATING_FILE_READ_NUDGE,
    ROTATING_FILE_READ_REINJECT_EVERY, STEP_WITHOUT_EXPLORE_NUDGE_THRESHOLD, WORK_PLAN_FRAME_NUDGE,
    WORK_WITHOUT_PLAN_NUDGE, WORK_WITHOUT_PLAN_NUDGE_THRESHOLD, WORK_WITHOUT_PLAN_PREFIX,
    ask_user_question_loop_nudge, context_load_nudge, drop_stale_step_explore_reminders,
    drop_step_by_step_heads_up, drop_system_with_prefix, explore_incomplete_nudge,
    reply_has_textual_tool_call, run_objective_done_nudge, run_objective_system_block,
    step_by_step_todo_nudge, step_explore_kickoff_nudge, step_skips_explore_kickoff,
    step_without_explore_nudge, unfinished_todos_prompt,
};
use super::super::super::phase::{counts_as_pre_plan_activity, user_blocks_plain_text};
use super::super::super::session_intent::{SessionFrames, classify_session_user_intent};
use super::super::super::situation::{
    ExploreCoveredPaths, SituationSnapshot, advance_transcript_cursor_for_insert,
    clear_rotating_file_read_window, completed_todos_hint, counts_as_parent_heavy_read,
    explore_deliverable_empty, first_in_progress_todo_id, forget_file_read_after_mutation,
    next_todo_from_output, note_rotating_file_read, note_successful_file_read,
    note_task_tool_success, path_from_file_tool, repeated_file_read_stub_value,
    rotating_file_read_should_nudge, should_stub_repeated_file_read, task_outcome_telemetry,
    upsert_situation_card,
};
use super::super::super::todo_text_salvage::salvage_inline_todo_write;

impl Agent {
    pub(super) async fn after_tools(
        &self,
        st: &mut DriveState,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        outcome: &TurnOutcome,
    ) -> Turn {
        if let Some(decision) = st.deferred_pre_tool_loop {
            match decision {
                LoopDecision::Ok => {}
                LoopDecision::Warn { kind } => {
                    debug!(kind, "boucle — Warn après résultats d'outils");
                    let nudge = if kind == "tool_family" {
                        LOOP_TOOL_FAMILY_NUDGE_PROMPT
                    } else {
                        LOOP_DETECTED_NUDGE_PROMPT
                    };
                    st.messages.push(Message::system(nudge));
                    if let Err(e) = self
                        .flush_transcript(&st.messages, &mut st.transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return Turn::Stop;
                    }
                    return Turn::Next;
                }
                LoopDecision::ForceConclude { kind } => {
                    debug!(kind, "boucle — ForceConclude après résultats d'outils");
                    st.messages
                        .push(Message::system(LOOP_FORCE_CONCLUDE_PROMPT));
                    st.loop_tools_disabled = true;
                    if let Err(e) = self
                        .flush_transcript(&st.messages, &mut st.transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return Turn::Stop;
                    }
                    return Turn::Next;
                }
                LoopDecision::SyntheticDone { kind, turns } => {
                    debug!(
                        kind,
                        turns, "boucle — SyntheticDone après résultats d'outils"
                    );
                    emit_synthetic_done(&tx, &mut st.messages, kind, turns).await;
                    self.maybe_persist_session(&st.messages, &st.memory_tracker, &tx)
                        .await;
                    let _ = tx
                        .send(Ok(AgentEvent::Stop {
                            reason: outcome.reason,
                            usage: Usage::default(),
                        }))
                        .await;
                    return Turn::Stop;
                }
            }
        }

        // 1.6.0 L-tools — même (tool, args) + même output → escalade clôture.
        match st
            .loop_detector
            .observe_tool_outputs(&outcome.tool_calls, &st.round_tool_outputs)
        {
            LoopDecision::Ok => {}
            LoopDecision::Warn { kind } => {
                debug!(kind, "boucle tools — Warn");
                st.messages
                    .push(Message::system(LOOP_DETECTED_NUDGE_PROMPT));
                if let Err(e) = self
                    .flush_transcript(&st.messages, &mut st.transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return Turn::Stop;
                }
                return Turn::Next;
            }
            LoopDecision::ForceConclude { kind } => {
                debug!(kind, "boucle tools — ForceConclude");
                st.messages
                    .push(Message::system(LOOP_FORCE_CONCLUDE_PROMPT));
                st.loop_tools_disabled = true;
                if let Err(e) = self
                    .flush_transcript(&st.messages, &mut st.transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return Turn::Stop;
                }
                return Turn::Next;
            }
            LoopDecision::SyntheticDone { kind, turns } => {
                debug!(kind, turns, "boucle tools — SyntheticDone");
                emit_synthetic_done(&tx, &mut st.messages, kind, turns).await;
                self.maybe_persist_session(&st.messages, &st.memory_tracker, &tx)
                    .await;
                let _ = tx
                    .send(Ok(AgentEvent::Stop {
                        reason: StopReason::EndTurn,
                        usage: Usage::default(),
                    }))
                    .await;
                return Turn::Stop;
            }
        }

        if st.consecutive_ask_user_question_failures >= MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES {
            debug!(
                consecutive_ask_user_question_failures = st.consecutive_ask_user_question_failures,
                "ask_user_question — anti-boucle JSON (§2.21)"
            );
            st.messages
                .push(Message::system(ask_user_question_loop_nudge()));
            st.consecutive_ask_user_question_failures = 0;
            // Reset OK : anti-boucle ask_user — message de sortie dédié.
            st.loop_detector.reset();
            if let Err(e) = self
                .flush_transcript(&st.messages, &mut st.transcript_cursor)
                .await
            {
                let _ = tx.send(Err(e)).await;
                return Turn::Stop;
            }
        }

        // Filet "step-by-step" : si le modèle vient d'exécuter plusieurs
        // outils mutateurs sans intercaler `todo_write` et qu'il lui
        // reste du travail dans son plan, on lui rappelle de mettre à
        // jour ses étapes avant le prochain tour. Ne se déclenche qu'à
        // partir de 2 outils mutateurs sans MAJ (silence en deçà).
        // `plan_nudges` est faux en `local-9b` : ce filet ne s'y applique pas.
        // `local-27b` et `cloud-full` le gardent, mais une seule copie :
        // le rappel précédent est retiré avant d'écrire le nouveau, et
        // retiré tout court quand le plan n'a plus d'étape ouverte.
        let plan_still_open = st.last_todo_pending > 0 || st.last_todo_in_progress > 0;
        if st.plan_nudges && !plan_still_open {
            drop_step_by_step_heads_up(&mut st.messages, &mut st.transcript_cursor);
        }
        if st.plan_nudges && st.mutating_tools_since_last_todo >= 2 && plan_still_open {
            debug!(
                mutating_tools_since_last_todo = st.mutating_tools_since_last_todo,
                last_todo_pending = st.last_todo_pending,
                last_todo_in_progress = st.last_todo_in_progress,
                "step-by-step nudge : outils mutateurs accumulés sans MAJ plan"
            );
            drop_step_by_step_heads_up(&mut st.messages, &mut st.transcript_cursor);
            let nudge = step_by_step_todo_nudge(
                st.mutating_tools_since_last_todo,
                st.last_todo_pending,
                st.last_todo_in_progress,
            );
            st.messages.push(Message::system(nudge));
            st.mutating_tools_since_last_todo = 0;
            // Reset OK : step-by-step todo — on demande un todo_write.
            st.loop_detector.reset();
            if let Err(e) = self
                .flush_transcript(&st.messages, &mut st.transcript_cursor)
                .await
            {
                let _ = tx.send(Err(e)).await;
                return Turn::Stop;
            }
        }
        Turn::Proceed
    }
}
