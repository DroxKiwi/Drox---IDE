//! Clôture, phases, FX-B et détection de boucle sur le texte.

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
use crate::event::{AgentEvent, HistoryProbeEntry, Phase, StatusNoticeLevel};
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
use super::super::super::status_notice::emit_status_notice;
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
    reply_has_textual_tool_call_outside_code_fences, run_objective_done_nudge,
    run_objective_system_block,
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
    pub(super) async fn text_gates(
        &self,
        st: &mut DriveState,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        outcome: &mut TurnOutcome,
    ) -> Turn {
        // Track : answering vu au moins une fois dans le run ?
        if outcome.saw_answering {
            st.seen_answering_in_run = true;
        }
        // O1 — DONE_ONLY déjà parti. Le texte de ce tour n'a pas été affiché.
        // `[phase: done]` retombe sur la clôture normale plus bas. Sinon on
        // s'arrête : la première conclusion reste la seule visible.
        if st.done_only_nudge_sent
            && outcome.tool_calls.is_empty()
            && outcome.final_phase != Some(Phase::Done)
        {
            debug!("DONE_ONLY ignoré — la première réponse reste, Stop");
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

        // Explore child (phase 1) — E2 : answering ou done sans tool = Stop.
        // La phase rapport moteur écrit le compte-rendu ; pas de DONE_ONLY /
        // answering-before-done (évite text_only ×3 après nudges de clôture).
        if self.config.explore_execution
            && outcome.tool_calls.is_empty()
            && matches!(outcome.final_phase, Some(Phase::Answering | Phase::Done))
        {
            debug!(
                phase = ?outcome.final_phase,
                "explore execution — stop (report phase follows)"
            );
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

        // Clôture mécanique (contrat Cline-like) : tour sans tool_call = fin.
        if st.engine_closure && outcome.tool_calls.is_empty() {
            let reply = outcome.text.trim();
            if reply.is_empty() && st.local_soft_close_check_sent && !st.final_answer_forced {
                debug!("local-27b — empty turn after soft close, previous reply stands");
                if let Err(e) = self
                    .flush_transcript(&st.messages, &mut st.transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return Turn::Stop;
                }
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
            // Un tour vide reste vide même si `[phase: done]` est déjà écrit :
            // le marqueur ne remplace pas le texte du message. Une seule relance.
            if reply.is_empty() && !st.final_answer_forced && !st.local_empty_turn_nudge_sent {
                debug!("local profile — empty turn, one-shot nudge");
                st.local_empty_turn_nudge_sent = true;
                st.messages.push(Message::system(LOCAL_EMPTY_TURN_NUDGE));
                if let Err(e) = self
                    .flush_transcript(&st.messages, &mut st.transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return Turn::Stop;
                }
                return Turn::Next;
            }
            if reply_has_textual_tool_call_outside_code_fences(reply).is_some() {
                debug!("textual tool envelope outside fences — notice + deliver reply");
                let _ = emit_status_notice(
                    &tx,
                    "textual_tool_imitation",
                    StatusNoticeLevel::Warn,
                    "Le modèle a imité un appel d'outil dans le texte ; seuls les appels natifs sont exécutés.",
                )
                .await;
            }
            let open_todos = st.last_todo_pending > 0 || st.last_todo_in_progress > 0;
            if open_todos {
                let _ = emit_status_notice(
                    &tx,
                    "open_todos_at_close",
                    StatusNoticeLevel::Info,
                    format!(
                        "Clôture avec {} todo(s) encore ouverte(s) ou en cours — le run se termine quand même.",
                        st.last_todo_pending + st.last_todo_in_progress
                    ),
                )
                .await;
            }
            let _ = emit_status_notice(
                &tx,
                "closure_mechanical",
                StatusNoticeLevel::Info,
                "Tour sans outil — clôture moteur.",
            )
            .await;
            debug!(
                final_answer_forced = st.final_answer_forced,
                reply_chars = reply.len(),
                saw_answering = outcome.saw_answering,
                "local profile — engine closure (turn without tools)"
            );
            if reply.is_empty() {
                emit_engine_closure(
                    &tx,
                    &mut st.messages,
                    ENGINE_CLOSURE_EMPTY_REPLY,
                    true,
                    false,
                )
                .await;
            } else if outcome.final_phase != Some(Phase::Done) || !outcome.saw_answering {
                let surface_reply = !outcome.saw_answering && !outcome.reply_already_visible;
                emit_engine_closure(&tx, &mut st.messages, reply, surface_reply, false).await;
            }
            if let Err(e) = self
                .flush_transcript(&st.messages, &mut st.transcript_cursor)
                .await
            {
                let _ = tx.send(Err(e)).await;
                return Turn::Stop;
            }
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

        // Done-driven completion + answering-before-done. `todo_write`
        // n'est PAS exigé ici : les réponses purement conversationnelles
        // (salutations, questions triviales) et les runs purement
        // exploratoires (lecture sans mutation) ont le droit de clôturer
        // sans liste de tâches. Si le modèle a touché un outil mutateur
        // (file_edit / file_write / notebook_edit / delete_path / bash), la gate
        // `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED` l'aura forcé à passer
        // par `todo_write` AVANT — donc la liste existe forcément quand
        // il y a eu du vrai travail, et la gate `unfinished_todos_prompt`
        // ci-dessous garde la clôture propre.
        // Un tool_call déjà émis doit être exécuté avant tout nouveau tour.
        // Sinon la requête finit sur un assistant qui contient des tool_calls
        // et le fournisseur répond 400 (« Cannot continue an assistant message… »).
        if outcome.final_phase == Some(Phase::Done) && outcome.tool_calls.is_empty() {
            if !st.seen_answering_in_run {
                debug!("[phase: done] prématuré (answering absent) — nudge");
                st.messages.push(Message::system(MISSING_ANSWERING_PROMPT));
                if let Err(e) = self
                    .flush_transcript(&st.messages, &mut st.transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return Turn::Stop;
                }
                return Turn::Next;
            }
            if st.last_todo_pending > 0 || st.last_todo_in_progress > 0 {
                debug!(
                    last_todo_pending = st.last_todo_pending,
                    last_todo_in_progress = st.last_todo_in_progress,
                    "[phase: done] avec to-do ouverte — nudge"
                );
                st.messages.push(Message::system(unfinished_todos_prompt(
                    st.last_todo_pending,
                    st.last_todo_in_progress,
                )));
                // Do NOT reset LoopDetector — repeated identical done attempts must abort.
                if let Err(e) = self
                    .flush_transcript(&st.messages, &mut st.transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return Turn::Stop;
                }
                return Turn::Next;
            }
            if self.config.run_objective.is_some() && !st.run_objective_reminder_sent {
                if let Some(obj) = &self.config.run_objective {
                    debug!("[phase: done] rappel objectif verrouillé (soft)");
                    st.messages
                        .push(Message::system(run_objective_done_nudge(obj)));
                    st.run_objective_reminder_sent = true;
                    if let Err(e) = self
                        .flush_transcript(&st.messages, &mut st.transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return Turn::Stop;
                    }
                    return Turn::Next;
                }
            }
            debug!("[phase: done] après answering + todo_write clôturé — clôture propre");
            self.maybe_persist_session(&st.messages, &st.memory_tracker, &tx)
                .await;
            let _ = tx
                .send(Ok(AgentEvent::Stop {
                    reason: outcome.reason,
                    // `TurnUsage` déjà émis après `consume_stream` pour ce tour.
                    usage: Usage::default(),
                }))
                .await;
            return Turn::Stop;
        }

        // Sprint Hotfix « boucle » — détection d'empreinte répétée.
        // Évalué **après** les gates `[phase: done]` (D1–D7) : un modèle
        // qui répète `[phase: done]` alors que la to-do est encore ouverte
        // doit recevoir `unfinished_todos_prompt` à chaque tour, pas
        // `LOOP_DETECTED_NUDGE` au 2e tour identique (cf. 1.5.14 L1).
        // Escalade 2026-10-15 : Warn → ForceConclude (tools off) → SyntheticDone.
        let loop_decision = st.loop_detector.observe(&outcome);
        if self.config.run_capture {
            st.capture_loop = super::super::run_capture::loop_decision_label(loop_decision);
        }
        st.deferred_pre_tool_loop = if outcome.tool_calls.is_empty() {
            match loop_decision {
                LoopDecision::Ok => None,
                LoopDecision::Warn { kind } => {
                    debug!(kind, "boucle — Warn (nudge soft)");
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
                    debug!(kind, "boucle — ForceConclude (tools off)");
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
                    debug!(kind, turns, "boucle — SyntheticDone (Stop propre)");
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
        } else {
            // Le tour a des tool_calls : on les exécute d'abord.
            // La décision de boucle s'applique une fois les résultats posés.
            Some(loop_decision)
        };

        // Si le modèle n'a pas signé `done` et n'a pas non plus appelé
        // d'outil ce tour, on l'invite explicitement à choisir : conclure
        // (`answering` + `done`) ou continuer (`reading` / `acting` + tool).
        // Aucun compteur séparé : `max_iterations` borne tout.
        if outcome.tool_calls.is_empty() {
            // Cas typique GLM-4.7-Flash : le modèle a déjà émis sa
            // réponse en `answering` mais a omis le `[phase: done]`
            // final.
            let todos_closed = st.last_todo_pending == 0 && st.last_todo_in_progress == 0;
            if outcome.final_phase == Some(Phase::Answering)
                && st.seen_answering_in_run
                && todos_closed
            {
                debug!("answering sans done + todo clôturée — nudge minimal (done seul)");
                st.consecutive_intent_only_write_nudges = 0;
                st.done_only_nudge_sent = true;
                st.messages.push(Message::system(DONE_ONLY_NUDGE_PROMPT));
                // 1.6.0 L-1 : ne PAS reset — même answering sans done doit
                // pouvoir strike / text_only-abort (sinon ×12 jusqu'à max_iter).
                if let Err(e) = self
                    .flush_transcript(&st.messages, &mut st.transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return Turn::Stop;
                }
                return Turn::Next;
            }

            st.consecutive_intent_only_write_nudges = 0;
            debug!("tour sans tool_call et sans [phase: done] — nudge");
            st.messages.push(Message::system(NUDGE_PROMPT));
            // 1.6.0 L-1 : ne PAS reset sur nudge générique.
            if let Err(e) = self
                .flush_transcript(&st.messages, &mut st.transcript_cursor)
                .await
            {
                let _ = tx.send(Err(e)).await;
                return Turn::Stop;
            }
            return Turn::Next;
        }

        st.consecutive_intent_only_write_nudges = 0;
        Turn::Proceed
    }
}
