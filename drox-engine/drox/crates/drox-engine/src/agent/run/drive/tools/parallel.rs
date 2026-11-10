//! Lot parallèle : pré-gates, exécution groupée, télémétrie.

#![allow(unused_imports)]
#![allow(clippy::too_many_lines)]

use super::super::super::super::loop_detect::TurnOutcome;
use super::super::super::Agent;
use super::super::Turn;
use super::super::helpers::{bash_stopped_if_requested, history_probe_snapshot, tool_apply_failed};
use super::super::state::DriveState;

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

use super::super::super::super::config::EngineProfile;
use super::super::super::super::consume_llm_stream::{consume_stream, push_assistant_message};
use super::super::super::super::context_load::{
    ContextLoadSnapshot, score as score_context_load, should_inject as should_inject_context_load,
    snapshot_from_glob_value,
};
use super::super::super::super::dispatch::{
    build_tool_specs, format_tool_result_for_llm_with_profile, mirror_workspace_map_from_tool,
    push_tool_error_tracked,
};
use super::super::super::super::gates::{
    counts_as_mutating_for_step_tracking, plan_write_gate_satisfied, record_counts_as_code_mutation,
};
use super::super::super::super::loop_close::{
    ENGINE_CLOSURE_EMPTY_REPLY, ENGINE_CLOSURE_TEXTUAL_TOOL_REPLY, emit_engine_closure,
    emit_synthetic_done,
};
use super::super::super::super::loop_detect::{LoopDecision, LoopDetector, PendingToolCall};
use super::super::super::super::nudges::{
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
use super::super::super::super::phase::{counts_as_pre_plan_activity, user_blocks_plain_text};
use super::super::super::super::session_intent::{SessionFrames, classify_session_user_intent};
use super::super::super::super::situation::{
    ExploreCoveredPaths, SituationSnapshot, advance_transcript_cursor_for_insert,
    clear_rotating_file_read_window, completed_todos_hint, counts_as_parent_heavy_read,
    explore_deliverable_empty, first_in_progress_todo_id, forget_file_read_after_mutation,
    next_todo_from_output, note_rotating_file_read, note_successful_file_read,
    note_task_tool_success, path_from_file_tool, repeated_file_read_stub_value,
    rotating_file_read_should_nudge, should_stub_repeated_file_read, task_outcome_telemetry,
    upsert_situation_card,
};
use super::super::super::super::todo_text_salvage::salvage_inline_todo_write;

impl Agent {
    pub(super) async fn run_parallel_batch(
        &self,
        st: &mut DriveState,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        outcome: &mut TurnOutcome,
        indices: Vec<usize>,
    ) -> Turn {
        let max_parallel = self.config.max_parallel_tool_calls.max(1);
        let mut to_execute: Vec<usize> = Vec::new();
        let mut by_idx: std::collections::BTreeMap<usize, Result<Value, drox_tools::ToolError>> =
            std::collections::BTreeMap::new();
        for idx in &indices {
            let call = &outcome.tool_calls[*idx];
            if let Some(msg) = self
                .run_tool_pre_gates(
                    call,
                    st.saw_successful_todo_write_in_run,
                    &st.last_todo_ids,
                    st.last_todo_was_all_completed,
                )
                .await
            {
                if push_tool_error_tracked(
                    &tx,
                    &mut st.messages,
                    call,
                    msg,
                    &mut st.consecutive_ask_user_question_failures,
                )
                .await
                .is_err()
                {
                    return Turn::Stop;
                }
                if let Err(e) = self
                    .flush_transcript(&st.messages, &mut st.transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return Turn::Stop;
                }
                continue;
            }
            if let Some(denial) = self.check_permission(call).await {
                if push_tool_error_tracked(
                    &tx,
                    &mut st.messages,
                    call,
                    denial,
                    &mut st.consecutive_ask_user_question_failures,
                )
                .await
                .is_err()
                {
                    return Turn::Stop;
                }
                if let Err(e) = self
                    .flush_transcript(&st.messages, &mut st.transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return Turn::Stop;
                }
                continue;
            }
            // R4 — même path déjà lu ×N → stub (pas de re-IO).
            if let Some((path, n)) = should_stub_repeated_file_read(
                &st.file_read_success_counts,
                &call.name,
                &call.arguments,
            ) {
                debug!(
                    marker = "r4.repeated_file_read_stub",
                    path = %path,
                    prior_reads = n,
                    "dogfood: stub repeated file_read"
                );
                by_idx.insert(*idx, Ok(repeated_file_read_stub_value(&path, n)));
                continue;
            }
            if let Some(stopped) = bash_stopped_if_requested(call) {
                by_idx.insert(*idx, stopped);
                continue;
            }
            to_execute.push(*idx);
        }

        let registry = self.registry.clone();
        let ctx_parallel = st.ctx.clone();
        let exec_results: Vec<(usize, PendingToolCall, Result<Value, drox_tools::ToolError>)> =
            stream::iter(to_execute)
                .map(|idx| {
                    let call = outcome.tool_calls[idx].clone();
                    let registry = registry.clone();
                    let ctx_exec =
                        ctx_parallel
                            .clone()
                            .with_tool_progress(ToolProgressBridge::new(
                                tx.clone(),
                                call.id.clone(),
                                call.name.clone(),
                            ));
                    async move {
                        let result = registry
                            .execute_named(&call.name, &ctx_exec, call.arguments.clone())
                            .await;
                        (idx, call, result)
                    }
                })
                .buffer_unordered(max_parallel)
                .collect()
                .await;

        for (idx, _call, result) in exec_results {
            by_idx.insert(idx, result);
        }

        for idx in indices {
            let call = &outcome.tool_calls[idx];
            let Some(exec) = by_idx.remove(&idx) else {
                continue;
            };
            match exec {
                Ok(value) => {
                    let applied_mutation =
                        value.get("applied").and_then(|v| v.as_bool()) == Some(true);
                    if call.name == "glob" && !st.context_load_nudge_sent {
                        if let Some(snap) =
                            snapshot_from_glob_value(&value, st.ctx.workspace_root.as_str())
                        {
                            st.pending_context_load = Some(snap);
                        }
                    }
                    let task_telem = if call.name == "task" {
                        let telem = task_outcome_telemetry(&value);
                        let empty_fail = explore_deliverable_empty(&value);
                        // C2 / D3 : paths_read même si truncated (merge ;
                        // ne jamais clear — conserve couverture précédente).
                        if telem.0 {
                            st.explore_covered_paths.merge_from_task_outcome(
                                &value,
                                st.ctx.workspace_root.as_std_path(),
                            );
                        } else {
                            st.explore_covered_paths.ingest_from_task_outcome(
                                &value,
                                st.ctx.workspace_root.as_std_path(),
                            );
                        }
                        st.explore_covered_reread_nudge_sent = false;
                        st.pending_explore_covered_reread_nudge = false;
                        Some((telem, empty_fail))
                    } else {
                        None
                    };
                    if !self
                        .apply_read_only_tool_success(
                            &st.ctx,
                            call,
                            value,
                            &mut st.memory_tracker,
                            &tx,
                            &mut st.messages,
                            &mut st.round_tool_outputs,
                        )
                        .await
                    {
                        return Turn::Stop;
                    }
                    if let Some(((truncated, used, max_it), empty_fail)) = task_telem {
                        note_task_tool_success(
                            truncated,
                            used,
                            max_it,
                            &mut st.parent_heavy_read_streak,
                            &mut st.pending_explore_incomplete,
                            &mut st.explore_rescue_active,
                            &mut st.explore_rescue_nudge_sent,
                        );
                        // D2 : Explore vide (`partial`) ≠ step-complete.
                        if st.last_in_progress_todo_id.is_some() && !empty_fail {
                            st.step_had_task_success = true;
                            st.step_parent_activity_count = 0;
                        }
                        if !truncated {
                            st.pending_post_merge_closure_nudge = true;
                            st.micro_act_write_nudge_sent = false;
                            // E2 — ouvrir fenêtre stall-act.
                            st.post_explore_window = true;
                            st.post_explore_read_streak = 0;
                            st.pending_post_explore_stall_nudge = false;
                            st.post_explore_stall_nudge_sent = false;
                        } else {
                            st.post_explore_window = false;
                            st.post_explore_read_streak = 0;
                            st.pending_post_explore_stall_nudge = false;
                        }
                        clear_rotating_file_read_window(&mut st.recent_file_reads);
                        st.rotating_file_read_nudge_sent = false;
                        st.rotating_last_nudge_at = 0;
                    } else if counts_as_parent_heavy_read(&call.name, &call.arguments) {
                        if st.edit_repair_pending {
                            st.edit_repair_pending = false;
                        } else {
                            st.parent_heavy_read_streak =
                                st.parent_heavy_read_streak.saturating_add(1);
                            if st.post_explore_window {
                                st.post_explore_read_streak =
                                    st.post_explore_read_streak.saturating_add(1);
                                if st.post_explore_read_streak >= POST_EXPLORE_STALL_READ_THRESHOLD
                                    && !st.post_explore_stall_nudge_sent
                                {
                                    st.pending_post_explore_stall_nudge = true;
                                }
                            }
                        }
                    }
                    if !st.saw_successful_todo_write_in_run
                        && counts_as_pre_plan_activity(&call.name)
                    {
                        st.pre_plan_activity_count = st.pre_plan_activity_count.saturating_add(1);
                    }
                    if st.last_in_progress_todo_id.is_some()
                        && !st.step_had_task_success
                        && counts_as_pre_plan_activity(&call.name)
                    {
                        st.step_parent_activity_count =
                            st.step_parent_activity_count.saturating_add(1);
                    }
                    let _ = note_successful_file_read(
                        &mut st.file_read_success_counts,
                        &call.name,
                        &call.arguments,
                    );
                    if applied_mutation {
                        forget_file_read_after_mutation(
                            &mut st.file_read_success_counts,
                            &call.name,
                            &call.arguments,
                        );
                    }
                    let _ = note_rotating_file_read(
                        &mut st.recent_file_reads,
                        &call.name,
                        &call.arguments,
                    );
                    if let Some(hit) = st
                        .explore_covered_paths
                        .hit_by_file_read(&call.name, &call.arguments)
                    {
                        let is_kind = hit.is_kind();
                        debug!(
                            marker = "c2.explore_covered_hit",
                            path = %hit.path(),
                            is_kind,
                            "dogfood: parent file_read hits Explore-covered path"
                        );
                        if !st.explore_covered_reread_nudge_sent {
                            st.pending_explore_covered_reread_nudge = true;
                        }
                        // E2b — hit kind → Prefer act immédiatement.
                        if is_kind && !st.post_explore_stall_nudge_sent {
                            st.pending_post_explore_stall_nudge = true;
                            st.post_explore_read_streak = st
                                .post_explore_read_streak
                                .max(POST_EXPLORE_STALL_READ_THRESHOLD);
                        }
                    }
                }
                Err(err) => {
                    if matches!(
                        call.name.as_str(),
                        "file_edit" | "file_write" | "notebook_edit"
                    ) {
                        st.edit_repair_pending = true;
                    }
                    if matches!(&err, ToolError::InvalidArgs(_)) {
                        // Reset OK : feedback args nouveau ≠ boucle.
                        st.loop_detector.reset();
                    }
                    if call.name == "explore_artifact_read" {
                        st.pending_explore_artifact_read_fail_nudge = true;
                    }
                    let err_s = err.to_string();
                    st.last_tool_error = Some(err_s.chars().take(200).collect::<String>());
                    if push_tool_error_tracked(
                        &tx,
                        &mut st.messages,
                        call,
                        err_s,
                        &mut st.consecutive_ask_user_question_failures,
                    )
                    .await
                    .is_err()
                    {
                        return Turn::Stop;
                    }
                }
            }
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
