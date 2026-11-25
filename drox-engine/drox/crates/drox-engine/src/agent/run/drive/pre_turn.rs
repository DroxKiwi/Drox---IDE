//! Nudges et snip avant l'appel LLM.

#![allow(unused_imports)]
#![allow(clippy::too_many_lines)]

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
    pub(super) async fn pre_turn(
        &self,
        iter: usize,
        st: &mut DriveState,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    ) -> Turn {
        debug!(
            iter,
            seen_answering_in_run = st.seen_answering_in_run,
            saw_successful_todo_write_in_run = st.saw_successful_todo_write_in_run,
            last_todo_pending = st.last_todo_pending,
            last_todo_in_progress = st.last_todo_in_progress,
            mutating_tools_since_last_todo = st.mutating_tools_since_last_todo,
            "tour LLM (todo_write obligatoire AVANT tout autre outil, optionnel pour conversation pure)"
        );

        // S-1 — rafraîchir la situation card avant shrink (charge requête inclut la card).
        let situation = SituationSnapshot {
            objective: self.config.run_objective.clone(),
            todos_pending: st.last_todo_pending,
            todos_in_progress: st.last_todo_in_progress,
            todos_completed_hint: st.last_todo_completed_hint,
            next_todo: st.last_todo_next.clone(),
            files_touched: st.files_touched_in_run.clone(),
            last_tool_error: st.last_tool_error.clone(),
            permission_mode: st.permission_mode_label.clone(),
        };
        let len_before_card = st.messages.len();
        let card_insert_at = st.leading_injected_systems;
        if upsert_situation_card(&mut st.messages, &situation, card_insert_at) {
            st.leading_injected_systems = st.leading_injected_systems.saturating_add(1);
            advance_transcript_cursor_for_insert(
                &mut st.transcript_cursor,
                card_insert_at,
                len_before_card,
            );
            debug!(
                marker = "c4.situation_card",
                inserted = true,
                "dogfood: situation card inserted (bounded)"
            );
        } else {
            debug!(
                marker = "c4.situation_card",
                inserted = false,
                "dogfood: situation card refreshed (bounded)"
            );
        }

        let tool_specs_for_load = if st.loop_tools_disabled {
            &[] as &[_]
        } else {
            st.tool_specs.as_slice()
        };
        match self
            .run_shrink_phase(
                &mut st.messages,
                tool_specs_for_load,
                &tx,
                &mut st.live_compaction_seq,
                &mut st.transcript_cursor,
                st.leading_injected_systems,
                st.last_turn_input_tokens,
            )
            .await
        {
            Err(()) => return Turn::Stop,
            Ok(outcome) if outcome.blocked => return Turn::Stop,
            Ok(_) => {}
        }

        if st.plan_nudges
            && !st.same_message_tools
            && iter == 0
            && st.session_frames.work_plan
            && !st.work_plan_frame_nudge_sent
        {
            debug!("work plan frame — soft nudge (turn-0)");
            st.messages.push(Message::system(WORK_PLAN_FRAME_NUDGE));
            st.work_plan_frame_nudge_sent = true;
        }

        // Soft Explore kickoff — local-9b (les plan_nudges 27b/cloud couvrent déjà le kickoff).
        if st.profile == EngineProfile::Local9b
            && st.task_tool_available
            && iter == 0
            && !st.local_explore_kickoff_sent
            && (st.session_frames.work_plan || st.session_frames.doc_ingestion)
        {
            debug!("local-9b — soft Explore kickoff (turn-0)");
            st.messages
                .push(Message::system(LOCAL_EXPLORE_KICKOFF_NUDGE));
            st.local_explore_kickoff_sent = true;
        }

        // Annex turn-0 — ingestion docs multi-fichiers → Explore d'abord.
        if iter == 0
            && st.task_tool_available
            && st.session_frames.doc_ingestion
            && !st.doc_ingestion_annex_sent
            && !st.same_message_tools
        {
            debug!("doc ingestion intent — Explore annex (turn-0)");
            st.messages
                .push(Message::system(DOC_INGESTION_EXPLORE_ANNEX));
            st.doc_ingestion_annex_sent = true;
        }

        // Soft — work/doc sans todo après N outils réussis (toute activité).
        // Tools restent libres (pas de blocked) ; needles / chitchat légitimes OK.
        if st.plan_nudges
            && !st.same_message_tools
            && !st.work_without_plan_nudge_sent
            && !st.saw_successful_todo_write_in_run
            && (st.session_frames.work_plan || st.session_frames.doc_ingestion)
            && st.pre_plan_activity_count >= WORK_WITHOUT_PLAN_NUDGE_THRESHOLD
        {
            debug!(
                pre_plan_activity_count = st.pre_plan_activity_count,
                "work without plan — soft todo nudge"
            );
            st.messages.push(Message::system(WORK_WITHOUT_PLAN_NUDGE));
            st.work_without_plan_nudge_sent = true;
        }
        if st.plan_nudges && st.saw_successful_todo_write_in_run {
            drop_system_with_prefix(
                &mut st.messages,
                &mut st.transcript_cursor,
                WORK_WITHOUT_PLAN_PREFIX,
            );
        }

        // Les rappels d'étape déjà passées (ou déjà explorées) sortent du
        // contexte. `plan_nudges` est faux en `local-9b` : son kickoff
        // tour-0, d'un autre texte, n'est pas touché.
        if st.plan_nudges {
            drop_stale_step_explore_reminders(
                &mut st.messages,
                &mut st.transcript_cursor,
                st.last_in_progress_todo_id.as_deref(),
                !st.step_had_task_success,
            );
        }

        // Soft — kickoff d'une nouvelle étape plan → Explore pour cette étape.
        if st.task_tool_available && st.plan_nudges && !st.same_message_tools {
            if let Some((step_id, step_content)) = st.pending_step_explore_nudge.take() {
                if step_skips_explore_kickoff(step_content.as_deref()) {
                    debug!(%step_id, "step kickoff skipped — single file or execution");
                } else {
                    debug!(
                        marker = "c4.micro_task_kickoff",
                        %step_id,
                        "dogfood: step kickoff — soft Explore micro"
                    );
                    st.messages.push(Message::system(step_explore_kickoff_nudge(
                        &step_id,
                        step_content.as_deref(),
                    )));
                }
            }
        }

        // Soft — étape in_progress, activité parent, toujours pas de task.
        if st.task_tool_available
            && st.plan_nudges
            && !st.same_message_tools
            && !st.step_without_explore_nudge_sent
            && !st.step_had_task_success
            && st.last_in_progress_todo_id.is_some()
            && !step_skips_explore_kickoff(st.last_todo_next.as_deref())
            && st.step_parent_activity_count >= STEP_WITHOUT_EXPLORE_NUDGE_THRESHOLD
        {
            let step_id = st.last_in_progress_todo_id.as_deref().unwrap_or("?");
            debug!(%step_id, step_parent_activity_count = st.step_parent_activity_count, "step without explore — soft nudge");
            st.messages.push(Message::system(step_without_explore_nudge(
                step_id,
                st.last_todo_next.as_deref(),
            )));
            st.step_without_explore_nudge_sent = true;
        }

        // S-5 — trop de lectures massives parent sans Explore.
        // Déjà montré au tour précédent : on le retire et on remet le
        // compteur à zéro. Les lectures de ce tour-là ne le gardent pas.
        // Une salve suivante peut le renvoyer une fois. Tous les profils
        // avec `task`.
        if st.task_tool_available {
            let before = st.messages.len();
            drop_system_with_prefix(
                &mut st.messages,
                &mut st.transcript_cursor,
                PARENT_HEAVY_READ_PREFIX,
            );
            if st.messages.len() != before {
                st.parent_heavy_read_nudge_sent = false;
                st.parent_heavy_read_streak = 0;
            }
        }
        if st.task_tool_available
            && !st.parent_heavy_read_nudge_sent
            && st.parent_heavy_read_streak >= PARENT_HEAVY_READ_NUDGE_THRESHOLD
        {
            debug!(
                streak = st.parent_heavy_read_streak,
                "parent heavy reads — Explore nudge (S-5)"
            );
            st.messages.push(Message::system(PARENT_HEAVY_READ_NUDGE));
            st.parent_heavy_read_nudge_sent = true;
            st.parent_heavy_read_streak = 0;
        }

        // Post-échec Explore — parent lit encore → filet rescue.
        if st.task_tool_available
            && st.explore_rescue_active
            && !st.explore_rescue_nudge_sent
            && st.parent_heavy_read_streak >= 1
        {
            debug!("explore rescue — parent heavy read after truncated task");
            st.messages
                .push(Message::system(EXPLORE_RESCUE_PARENT_READ_NUDGE));
            st.explore_rescue_nudge_sent = true;
            st.parent_heavy_read_streak = 0;
        }

        // Explore truncated — re-split chiffré (one-shot par événement).
        if st.task_tool_available {
            if let Some((used, max_it)) = st.pending_explore_incomplete.take() {
                debug!(
                    iterations_used = used,
                    max_iterations = max_it,
                    "explore incomplete nudge"
                );
                st.messages.push(Message::system(explore_incomplete_nudge(
                    used,
                    max_it,
                    st.last_context_load_recommended_n,
                )));
            }
        }

        // Context-load V1 — soft N Explore après glob (L2 caps, one-shot).
        if st.task_tool_available && self.config.context_load.inject && !st.context_load_nudge_sent
        {
            if let Some(snap) = st.pending_context_load.take() {
                let scored = score_context_load(&snap, &self.config.context_load);
                if should_inject_context_load(&snap, &scored) {
                    debug!(
                        load = scored.load,
                        n = scored.recommended_n,
                        files = scored.files_effective,
                        "context-load soft nudge"
                    );
                    st.last_context_load_recommended_n = scored.recommended_n.max(2);
                    st.messages.push(Message::system(context_load_nudge(
                        scored.files_effective,
                        scored.total_kb,
                        scored.load,
                        scored.recommended_n,
                    )));
                    st.context_load_nudge_sent = true;
                    // Reset OK : one-shot guidance — contenu nouveau.
                    st.loop_detector.reset();
                }
            }
        }

        // Soft — Explore réussi → fusionner / agir (one-shot par succès).
        if st.pending_post_merge_closure_nudge && (!st.plan_nudges || st.same_message_tools) {
            st.pending_post_merge_closure_nudge = false;
        }
        if st.pending_post_merge_closure_nudge {
            debug!(
                marker = "c2.post_merge_closure",
                "dogfood: post-merge Explore — soft closure nudge"
            );
            st.messages.push(Message::system(POST_MERGE_CLOSURE_NUDGE));
            st.pending_post_merge_closure_nudge = false;
            if !st.micro_act_write_nudge_sent {
                st.pending_micro_act_write_nudge = true;
            }
        }

        // Soft C4 — micro acting write juste après post-merge (V6-a).
        if st.pending_micro_act_write_nudge && !st.micro_act_write_nudge_sent {
            debug!(
                marker = "c4.micro_act_write",
                "dogfood: micro act-write prefer after Explore merge"
            );
            st.messages.push(Message::system(MICRO_ACT_WRITE_NUDGE));
            st.pending_micro_act_write_nudge = false;
            st.micro_act_write_nudge_sent = true;
        }

        // Soft C2 / E1 — parent re-lit un path déjà couvert Explore.
        if st.pending_explore_covered_reread_nudge
            && st.plan_nudges
            && !st.explore_covered_reread_nudge_sent
        {
            debug!(
                marker = "c2.explore_covered_reread_prefer",
                covered_n = st.explore_covered_paths.len(),
                "dogfood: Explore-covered path re-read — soft prefer"
            );
            st.messages
                .push(Message::system(EXPLORE_COVERED_REREAD_NUDGE));
            st.pending_explore_covered_reread_nudge = false;
            st.explore_covered_reread_nudge_sent = true;
        }

        // Soft E2 / E2b — post-Explore OK + lectures / hit kind → Prefer act.
        if st.pending_post_explore_stall_nudge
            && st.plan_nudges
            && !st.post_explore_stall_nudge_sent
        {
            debug!(
                marker = "e2.post_explore_stall_act",
                streak = st.post_explore_read_streak,
                "dogfood: post-Explore read stall — soft act prefer"
            );
            st.messages
                .push(Message::system(POST_EXPLORE_STALL_ACT_NUDGE));
            st.pending_post_explore_stall_nudge = false;
            st.post_explore_stall_nudge_sent = true;
        }

        // Soft A — explore_artifact_read failed → don’t file_read kind blobs.
        if st.pending_explore_artifact_read_fail_nudge {
            debug!(
                marker = "a.explore_artifact_read_fail",
                "dogfood: explore_artifact_read error — soft recovery prefer"
            );
            st.messages
                .push(Message::system(EXPLORE_ARTIFACT_READ_FAIL_NUDGE));
            st.pending_explore_artifact_read_fail_nudge = false;
        }

        // Soft D4 — user a répondu → skeleton / mutate (pas re-inventaire).
        if st.pending_post_ask_acting_nudge {
            debug!(
                marker = "d4.post_ask_acting",
                "dogfood: post-ask_user — soft skeleton/mutate prefer"
            );
            st.messages.push(Message::system(POST_ASK_ACTING_NUDGE));
            st.pending_post_ask_acting_nudge = false;
        }

        // Soft R1 — rotation multi-path `file_read` (ré-inject tous les N).
        if rotating_file_read_should_nudge(&st.recent_file_reads) {
            let len = st.recent_file_reads.len();
            let due = !st.rotating_file_read_nudge_sent
                || len
                    >= st
                        .rotating_last_nudge_at
                        .saturating_add(ROTATING_FILE_READ_REINJECT_EVERY);
            if due {
                debug!(
                    marker = "c1.rotating_file_read",
                    window = len,
                    reinject = st.rotating_file_read_nudge_sent,
                    "dogfood: rotating file_read — soft nudge"
                );
                st.messages.push(Message::system(ROTATING_FILE_READ_NUDGE));
                st.rotating_file_read_nudge_sent = true;
                st.rotating_last_nudge_at = len;
            }
        }

        // P1 — même path `file_read` réussi ×N.
        if !st.repeated_file_read_nudge_sent
            && st
                .file_read_success_counts
                .values()
                .any(|&n| n >= REPEATED_FILE_READ_NUDGE_THRESHOLD)
        {
            debug!("repeated file_read path — re-read nudge (P1)");
            st.messages.push(Message::system(REPEATED_FILE_READ_NUDGE));
            st.repeated_file_read_nudge_sent = true;
        }
        Turn::Proceed
    }
}
