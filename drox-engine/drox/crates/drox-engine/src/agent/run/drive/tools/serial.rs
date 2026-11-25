//! Lot série : un outil après l'autre, même télémétrie que le chemin parallèle.

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
    pub(super) async fn run_serial_batch(
        &self,
        st: &mut DriveState,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        outcome: &mut TurnOutcome,
        indices: Vec<usize>,
    ) -> Turn {
        for idx in indices {
            let call = &outcome.tool_calls[idx];
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

            if let Some(hooks) = self.config.tool_hooks.as_ref().filter(|h| h.is_enabled()) {
                let hook_ctx = ToolHookContext {
                    tool_name: &call.name,
                    tool_use_id: call.id.as_str(),
                    tool_input: &call.arguments,
                    tool_response: None,
                };
                if !hooks.pre_tool_use.is_empty() {
                    let _ = tx
                        .send(Ok(AgentEvent::HookProgress {
                            tool_use_id: call.id.clone(),
                            hook_event: "PreToolUse".into(),
                            in_progress: 1,
                        }))
                        .await;
                }
                let pre_outcome = hooks.run_pre(hook_ctx, &st.ctx.workspace_root).await;
                if !hooks.pre_tool_use.is_empty() {
                    let _ = tx
                        .send(Ok(AgentEvent::HookProgress {
                            tool_use_id: call.id.clone(),
                            hook_event: "PreToolUse".into(),
                            in_progress: 0,
                        }))
                        .await;
                }
                if let PreHookOutcome::Block { message } = pre_outcome {
                    if push_tool_error_tracked(
                        &tx,
                        &mut st.messages,
                        call,
                        message,
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
            }

            // R4 — même path déjà lu ×N → stub (pas de re-IO).
            let exec = if let Some(stopped) = bash_stopped_if_requested(call) {
                stopped
            } else if let Some((path, n)) = should_stub_repeated_file_read(
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
                Ok(repeated_file_read_stub_value(&path, n))
            } else {
                let ctx_exec = st.ctx.clone().with_tool_progress(ToolProgressBridge::new(
                    tx.clone(),
                    call.id.clone(),
                    call.name.clone(),
                ));
                self.registry
                    .execute_named(&call.name, &ctx_exec, call.arguments.clone())
                    .await
            };
            match exec {
                Ok(mut value) => {
                    let applied_mutation =
                        value.get("applied").and_then(|v| v.as_bool()) == Some(true);
                    if call.name == "glob" && !st.context_load_nudge_sent {
                        if let Some(snap) =
                            snapshot_from_glob_value(&value, st.ctx.workspace_root.as_str())
                        {
                            st.pending_context_load = Some(snap);
                        }
                    }
                    st.memory_tracker.record_tool(&call.name);
                    let todo_prev_had_open_items = if call.name == "todo_write" {
                        st.last_todo_pending > 0 || st.last_todo_in_progress > 0
                    } else {
                        false
                    };
                    if call.name == "todo_write" {
                        st.saw_successful_todo_write_in_run = true;
                        st.last_todo_pending = value["counts"]["pending"].as_u64().unwrap_or(0);
                        st.last_todo_in_progress =
                            value["counts"]["in_progress"].as_u64().unwrap_or(0);
                        st.last_todo_ids.clear();
                        if let Some(todos) = value["todos"].as_array() {
                            for t in todos {
                                if let Some(id) = t.get("id").and_then(|v| v.as_str()) {
                                    st.last_todo_ids.insert(id.to_string());
                                }
                            }
                        }
                        st.last_todo_was_all_completed =
                            st.last_todo_pending == 0 && st.last_todo_in_progress == 0;
                        st.last_todo_next = next_todo_from_output(&value);
                        st.last_todo_completed_hint = completed_todos_hint(&value);
                        st.mutating_tools_since_last_todo = 0;
                        clear_rotating_file_read_window(&mut st.recent_file_reads);
                        st.rotating_file_read_nudge_sent = false;
                        st.rotating_last_nudge_at = 0;
                        if let Some(step_id) = first_in_progress_todo_id(&value) {
                            if st.last_in_progress_todo_id.as_ref() != Some(&step_id) {
                                st.pending_step_explore_nudge =
                                    Some((step_id.clone(), st.last_todo_next.clone()));
                                st.last_in_progress_todo_id = Some(step_id);
                                st.step_parent_activity_count = 0;
                                st.step_had_task_success = false;
                                st.step_without_explore_nudge_sent = false;
                            }
                        } else {
                            st.last_in_progress_todo_id = None;
                            st.step_parent_activity_count = 0;
                            st.step_had_task_success = false;
                            st.step_without_explore_nudge_sent = false;
                        }
                    } else if counts_as_mutating_for_step_tracking(
                        &call.name,
                        &call.arguments,
                        &st.ctx.workspace_root,
                    ) {
                        if tool_apply_failed(&value) {
                            st.edit_repair_pending = true;
                        } else {
                            st.edit_repair_pending = false;
                            st.mutating_tools_since_last_todo =
                                st.mutating_tools_since_last_todo.saturating_add(1);
                        }
                    }
                    if record_counts_as_code_mutation(&call.name, &call.arguments)
                        && !tool_apply_failed(&value)
                    {
                        clear_rotating_file_read_window(&mut st.recent_file_reads);
                        st.rotating_file_read_nudge_sent = false;
                        st.rotating_last_nudge_at = 0;
                        // E2 — mutation = fin de la fenêtre stall-act.
                        st.post_explore_window = false;
                        st.post_explore_read_streak = 0;
                        st.pending_post_explore_stall_nudge = false;
                    }
                    if let Some(path) = path_from_file_tool(&call.name, &call.arguments) {
                        if !st.files_touched_in_run.iter().any(|p| p == &path) {
                            st.files_touched_in_run.push(path);
                        }
                        st.last_tool_error = None;
                    } else if matches!(
                        call.name.as_str(),
                        "file_write"
                            | "file_edit"
                            | "notebook_edit"
                            | "delete_path"
                            | "copy_path"
                            | "bash"
                    ) {
                        // Succès mutateur / shell — effacer l'erreur précédente.
                        st.last_tool_error = None;
                    }
                    if call.name == "task" {
                        let (truncated, used, max_it) = task_outcome_telemetry(&value);
                        let empty_fail = explore_deliverable_empty(&value);
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
                        // C2 / D3 : armer / fusionner même si truncated.
                        if truncated {
                            st.explore_covered_paths.merge_from_task_outcome(
                                &value,
                                st.ctx.workspace_root.as_std_path(),
                            );
                            st.post_explore_window = false;
                            st.post_explore_read_streak = 0;
                            st.pending_post_explore_stall_nudge = false;
                        } else {
                            st.pending_post_merge_closure_nudge = true;
                            st.micro_act_write_nudge_sent = false;
                            st.explore_covered_paths.ingest_from_task_outcome(
                                &value,
                                st.ctx.workspace_root.as_std_path(),
                            );
                            // E2 — ouvrir fenêtre stall-act.
                            st.post_explore_window = true;
                            st.post_explore_read_streak = 0;
                            st.pending_post_explore_stall_nudge = false;
                            st.post_explore_stall_nudge_sent = false;
                        }
                        st.explore_covered_reread_nudge_sent = false;
                        st.pending_explore_covered_reread_nudge = false;
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
                    if call.name == "ask_user_question" {
                        st.consecutive_ask_user_question_failures = 0;
                        // D4 : transition soft acting au tour suivant.
                        st.pending_post_ask_acting_nudge = true;
                    }
                    let mut hook_appendix: Option<String> = None;
                    if let Some(hooks) = self.config.tool_hooks.as_ref().filter(|h| h.is_enabled())
                    {
                        if !hooks.post_tool_use.is_empty() {
                            let _ = tx
                                .send(Ok(AgentEvent::HookProgress {
                                    tool_use_id: call.id.clone(),
                                    hook_event: "PostToolUse".into(),
                                    in_progress: 1,
                                }))
                                .await;
                        }
                        let PostHookOutcome::Ok {
                            tool_response,
                            model_appendix,
                        } = hooks
                            .run_post(
                                ToolHookContext {
                                    tool_name: &call.name,
                                    tool_use_id: call.id.as_str(),
                                    tool_input: &call.arguments,
                                    tool_response: None,
                                },
                                &st.ctx.workspace_root,
                                value,
                            )
                            .await;
                        if !hooks.post_tool_use.is_empty() {
                            let _ = tx
                                .send(Ok(AgentEvent::HookProgress {
                                    tool_use_id: call.id.clone(),
                                    hook_event: "PostToolUse".into(),
                                    in_progress: 0,
                                }))
                                .await;
                        }
                        value = tool_response;
                        hook_appendix = model_appendix;
                    }
                    let mut for_llm = format_tool_result_for_llm_with_profile(
                        &call.name,
                        &value,
                        &st.ctx.workspace_root,
                        st.profile,
                    );
                    if let Some(app) = hook_appendix {
                        for_llm.push_str("\n\n");
                        for_llm.push_str(&app);
                    }
                    if !st.round_tool_outputs.is_empty() {
                        st.round_tool_outputs.push('\n');
                    }
                    st.round_tool_outputs.push_str(&for_llm);
                    mirror_workspace_map_from_tool(&st.ctx, &call.name, &value).await;
                    if call.name == "scope_defer" {
                        if let Some(handle) = st.ctx.scope_deferred.as_ref() {
                            let items = handle.snapshot();
                            if tx
                                .send(Ok(AgentEvent::ScopeParkingUpdate { items }))
                                .await
                                .is_err()
                            {
                                return Turn::Stop;
                            }
                        }
                    }
                    if tx
                        .send(Ok(AgentEvent::ToolFinish {
                            id: call.id.clone(),
                            output: value,
                            is_error: false,
                        }))
                        .await
                        .is_err()
                    {
                        return Turn::Stop;
                    }
                    st.messages
                        .push(Message::tool_result(call.id.clone(), for_llm, false));
                    if call.name == "todo_write"
                        && todo_prev_had_open_items
                        && st.last_todo_pending == 0
                        && st.last_todo_in_progress == 0
                        && st.memory_tracker.is_non_trivial()
                    {
                        self.maybe_persist_session(&st.messages, &st.memory_tracker, &tx)
                            .await;
                    }
                }
                Err(err) => {
                    if matches!(
                        call.name.as_str(),
                        "file_edit" | "file_write" | "notebook_edit"
                    ) {
                        st.edit_repair_pending = true;
                    }
                    let is_invalid = matches!(&err, ToolError::InvalidArgs(_));
                    let msg = err.to_string();
                    st.last_tool_error = Some(msg.chars().take(200).collect::<String>());
                    // Format / args invalides : le modèle vient
                    // de recevoir un feedback nouveau — ne pas
                    // enchaîner tout de suite vers Abort loop.
                    if is_invalid {
                        // Reset OK : feedback args nouveau ≠ boucle.
                        st.loop_detector.reset();
                    }
                    if call.name == "explore_artifact_read" {
                        st.pending_explore_artifact_read_fail_nudge = true;
                    }
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
