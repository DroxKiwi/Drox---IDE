//! Boucle principale agent (`drive_inner` et exÃ©cution des tools).


use drox_hooks::{PostHookOutcome, PreHookOutcome, ToolHookContext};
use drox_permissions::PermissionDecision;
use drox_types::{Content, Message, Role};
use std::sync::Arc;
use futures::{stream, StreamExt};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::error::EngineError;
use crate::event::{AgentEvent, Phase};
use crate::orchestration::{
    architect_run_context_block_compaction, architect_run_context_block_per_turn,
};
use crate::run_spec::RoleId;
use crate::long_memory::ContextChunkSummaryV1;
use crate::memory::{MemoryTracker, persist_compaction_result, persist_run};
use crate::tool_orchestration::{ToolCallBatch, partition_tool_calls};

use super::architect_state::{
    inject_architect_run_snapshot_after_checkpoint, refresh_architect_run_snapshot,
    ArchitectRunState,
};
use super::gates::{
    done_gate_missing_answering, done_gate_professor_without_plan,
    done_gate_testing_required, done_gate_unfinished_course_plan, done_gate_unfinished_todos,
    explore_running_mutation_block, explore_second_task_block,
    is_todo_recreation_from_scratch,
    parse_hallucinated_phase_from_tool_call,
    plan_write_gate_satisfied, record_counts_as_code_mutation, tool_pre_gate_block,
    architect_delegate_cap_nudge, architect_orchestration_record_successful_tool,
    architect_record_read_only_tool_success,
};
use super::nudges::{
    ask_user_question_loop_nudge, explore_jobs_pending_nudge, run_objective_system_block,
    step_by_step_todo_nudge, ANALYZING_PHASE_NUDGE, ARCHITECT_NO_WORK_NUDGE_PROMPT,
    done_only_nudge_prompt, loop_intervention_level, loop_intervention_ui_message,
    loop_recenter_user_message, LOOP_DETECTED_SYSTEM_NUDGE,
    MUTATING_TOOL_BEFORE_TODO_WRITE_NUDGE, MUTATING_TOOLS_FOR_STEP_TRACKING,
    NATIVE_THINKING_UI_SUPPLEMENT, nudge_prompt,
};
use crate::orchestration::{
    deliverable_path_from_tool_success, executor_deliverable_closure_notice,
    executor_delegated_task_block, extract_discussion_done_from_text,
    EXECUTOR_NATIVE_THINKING_SUPPLEMENT, EXECUTOR_ROLE_SUPPLEMENT,
};
use drox_types::{StopReason, Usage};
use crate::subagent_jobs::RunningSubagentJob;
use super::phases::is_workspace_exploration_tool;
use super::agent_stream::{
    consume_stream, enforce_max_tools_per_turn, push_assistant_message,
    run_has_promotable_user_facing_text, LoopDecision,
    LoopDetector, PendingToolCall,
};
use super::final_answer_guard::FinalAnswerGuard;
use super::subagent_report_gate::should_drain_subagent_reports;
use super::{
    build_tool_specs, confirm_with_user, first_user_text,
    format_tool_result_for_llm,
    is_professor_run, last_user_text, mirror_workspace_map_from_tool, push_tool_error_tracked,
    Agent,
};
use drox_tools::{structure_task_async_completed, ToolContext};

impl Agent {
    #[allow(clippy::too_many_lines)]
    pub(crate) async fn drive_inner(
        self,
        history: Vec<Message>,
        user_blocks: Vec<Content>,
        tx: mpsc::Sender<Result<AgentEvent, EngineError>>,
    ) {
        let professor = is_professor_run(self.config.permissions.as_ref());
        let base_tool_specs =
            build_tool_specs(&self.registry, professor, &self.config.run_spec);
        // Sprint M1 â€” si la mÃ©moire de session est configurÃ©e, on greffe
        // le `SessionNotesHandle` partagÃ© dans le `ToolContext` du run.
        // Les tools `session_note` / `memory_read` / `memory_list` y voient
        // le stock partagÃ© ; sans `memory`, ils renvoient une erreur explicite
        // ("tool unavailable in this context") qui s'affiche au modÃ¨le.
        let mut ctx = match self.config.memory.as_ref() {
            Some(mem) => self.ctx.clone().with_session_notes(mem.notes.clone()),
            None => self.ctx.clone(),
        };
        let mut memory_tracker = MemoryTracker::new();
        let mut messages = Vec::new();
        if let Some(sys) = &self.config.system_prompt {
            messages.push(Message::system(sys));
        }
        if self.config.run_spec.role_id == RoleId::Executor {
            messages.push(Message::system(EXECUTOR_ROLE_SUPPLEMENT));
        }
        if self.config.chat_options.think == Some(true) {
            let thinking_supplement = if self.config.run_spec.role_id == RoleId::Executor {
                EXECUTOR_NATIVE_THINKING_SUPPLEMENT
            } else {
                NATIVE_THINKING_UI_SUPPLEMENT
            };
            messages.push(Message::system(thinking_supplement));
        }
        if let Some(obj) = &self.config.run_objective {
            if self.config.run_spec.role_id == RoleId::Executor {
                let task_id = self
                    .config
                    .delegate_task_id
                    .as_deref()
                    .unwrap_or("task");
                messages.push(Message::system(executor_delegated_task_block(
                    task_id, obj,
                )));
            } else if self.config.run_spec.role_id != RoleId::Architect {
                messages.push(Message::system(run_objective_system_block(obj)));
            }
        }
        messages.extend(history);
        // Garantit qu'il y a toujours au moins un bloc texte pour les
        // providers strictement text-only et pour la cohÃ©rence du transcript.
        let user_blocks = if user_blocks.is_empty() {
            vec![Content::text(String::new())]
        } else {
            user_blocks
        };
        messages.push(Message::user_with_blocks(user_blocks));

        let mut transcript_cursor = self
            .config
            .transcript
            .as_ref()
            .map_or(0, |t| t.append_from_message_index);
        if let Err(e) = self
            .flush_transcript(&messages, &mut transcript_cursor)
            .await
        {
            let _ = tx.send(Err(e)).await;
            return;
        }

        // Sprint A.2 â€” done-driven completion. Plus de heuristique Â« pas
        // d'outil = on s'arrÃªte Â» : la SEULE condition de fin propre est
        // `[phase: done]`. Tant que ce marqueur n'est pas vu, on injecte un
        // nudge et on relance. La borne dure reste `max_iterations`.
        //
        // Sprint A.3 â€” answering-before-done. On ajoute une seconde
        // contrainte : `done` n'est acceptÃ© que si **au moins un**
        // `[phase: answering]` a Ã©tÃ© Ã©mis dans le run. Sinon la rÃ©ponse
        // finale est enfouie dans la trace UI repliÃ©e (invisible) et on
        // demande au modÃ¨le de la re-rÃ©diger dans `answering`, mÃªme au prix
        // d'une rÃ©pÃ©tition. C'est dÃ©libÃ©rÃ© : la phase `answering` est la
        // seule rendue en clair dans la bulle assistant (cf. `chat.js`).
        let mut seen_answering_in_run = false;
        let mut saw_successful_todo_write_in_run = false;
        let mut saw_successful_course_plan_write_in_run = false;
        // Snapshot du dernier `todo_write` rÃ©ussi (compteurs `pending` /
        // `in_progress`). Sert Ã  interdire `[phase: done]` tant que la to-do
        // n'est pas elle-mÃªme clÃ´turÃ©e â€” cf. `unfinished_todos_prompt`.
        let mut last_todo_pending: u64 = 0;
        let mut last_todo_in_progress: u64 = 0;
        let mut last_course_pending: u64 = 0;
        let mut last_course_active: u64 = 0;
        let mut professor_course_state = crate::professor::ProfessorCourseState::default();
        // Sprint Plan Â« un seul plan par run Â» â€” set des ids du dernier
        // `todo_write` rÃ©ussi + flag Â« toutes les Ã©tapes Ã©taient completed Â».
        // Servent Ã  dÃ©tecter une re-crÃ©ation de plan from scratch aprÃ¨s
        // clÃ´ture (cf. `is_todo_recreation_from_scratch`).
        let mut last_todo_ids: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut last_todo_was_all_completed: bool = false;
        // Step-by-step progression tracker : compte le nombre d'outils
        // mutateurs (`file_edit` / `file_write` / `notebook_edit` / `delete_path` / `bash`) exÃ©cutÃ©s depuis le
        // dernier `todo_write` rÃ©ussi. Au-delÃ  de 2, on injecte un nudge soft
        // pour pousser le modÃ¨le Ã  mettre Ã  jour sa todo entre les Ã©tapes.
        // Reset Ã  chaque `todo_write` rÃ©ussi ET Ã  chaque injection de nudge
        // (pour ne pas rÃ©pÃ©ter en boucle).
        let mut mutating_tools_since_last_todo: u32 = 0;
        let mut plan_before_mutation_nudge_sent = false;
        // Sprint Hotfix Â« boucle Ã©dition/lecture Â» â€” dÃ©tecteur strict de
        // rÃ©pÃ©tition d'empreinte (texte assistant + tool_calls). Voir
        // `LoopDetector` ; le `reset` est appelÃ© aprÃ¨s chaque nudge moteur
        // structurel pour ne pas pÃ©naliser une convergence forcÃ©e.
        let mut loop_detector = LoopDetector::new();
        let mut effective_run_objective = self.config.run_objective.clone();
        let mut consecutive_ask_user_question_failures: u32 = 0;
        let mut live_compaction_seq: u32 = 0;
        let mut analyzing_phase_nudge_sent = false;
        let mut saw_analyzing_phase_in_run = false;
        let mut saw_code_mutation_in_run = false;
        let mut saw_testing_phase_in_run = false;
        let mut architect_state =
            ArchitectRunState::with_engine_tuning(&self.config.engine_tuning);
        let mut final_answer_guard = FinalAnswerGuard::default();
        if self.config.run_spec.role_id == RoleId::Architect {
            let req = last_user_text(&messages).or_else(|| first_user_text(&messages));
            let start_outcome = super::edit_start::apply_architect_edit_start(
                req.as_deref(),
                effective_run_objective.as_deref(),
                &mut architect_state,
            );
            if let Some(obj) = start_outcome.run_objective {
                effective_run_objective = Some(obj);
            } else if let Some(req) = req {
                architect_state.anchor_user_request(&req);
                if let Some(obj) = effective_run_objective.as_deref() {
                    architect_state.anchor_run_objective(obj);
                }
            }
        }
        let mut consecutive_todo_completion_gate_failures: u32 = 0;
        let testing_gate_active = !ctx.plan_mode && !professor;
        let mut executor_deliverable_met = false;
        let mut executor_deliverable_path: Option<String> = None;
        let mut last_usage = Usage::default();
        let mut last_stop_reason = StopReason::EndTurn;
        for iter in 0..self.config.max_iterations {
            if executor_deliverable_met
                && self.config.run_spec.role_id == RoleId::Executor
            {
                if let (Some(task_id), Some(path)) = (
                    self.config.executor_deliverable_task_id.as_deref(),
                    executor_deliverable_path.as_deref(),
                ) && self
                    .finish_executor_on_deliverable(
                        &tx,
                        &mut messages,
                        &mut transcript_cursor,
                        task_id,
                        path,
                        last_stop_reason,
                        last_usage.clone(),
                    )
                    .await
                {
                    return;
                }
            }

            debug!(
                iter,
                seen_answering_in_run,
                saw_successful_todo_write_in_run,
                last_todo_pending,
                last_todo_in_progress,
                mutating_tools_since_last_todo,
                "tour LLM (todo_write fortement conseillÃ© avant mutations, non bloquant)"
            );

            let can_drain_subagents = should_drain_subagent_reports(
                self.config.run_spec.role_id,
                seen_answering_in_run,
                architect_state.run_fully_closable(),
            );
            if can_drain_subagents
                && self
                    .drain_subagent_jobs_into_messages(
                        &mut messages,
                        &mut transcript_cursor,
                        &tx,
                    )
                    .await
                    .is_err()
            {
                return;
            }

            if final_answer_guard.should_auto_stop_architect(
                self.config.run_spec.role_id,
                last_todo_pending,
                last_todo_in_progress,
                architect_state.run_fully_closable(),
                self.running_subagent_jobs_count(),
            ) {
                debug!("architect auto-stop after final answer (fully closable)");
                let _ = tx
                    .send(Ok(AgentEvent::Stop {
                        reason: last_stop_reason,
                        usage: last_usage.clone(),
                    }))
                    .await;
                return;
            }

            let running_explore = self.running_explore_jobs();
            if !running_explore.is_empty() {
                messages.push(Message::system(explore_jobs_pending_nudge(
                    &running_explore,
                )));
            }

            if self.config.run_spec.role_id == RoleId::Architect {
                refresh_architect_run_snapshot(
                    &mut messages,
                    &architect_run_context_block_per_turn(
                        &architect_state,
                        effective_run_objective.as_deref(),
                    ),
                );
            }

            if self
                .maybe_snip(
                    &mut messages,
                    &tx,
                    &mut live_compaction_seq,
                    &memory_tracker,
                    &mut architect_state,
                    effective_run_objective.as_deref(),
                )
                .await
                .is_err()
            {
                return;
            }

            if self.emit_context_usage(&messages, &tx).await.is_err() {
                return;
            }

            let tour_tool_specs = base_tool_specs.clone();

            let options = self
                .config
                .chat_options
                .clone()
                .with_tools(tour_tool_specs);

            let stream = match self.llm.stream_chat(messages.clone(), options).await {
                Ok(s) => s,
                Err(err) => {
                    let _ = tx.send(Err(err.into())).await;
                    return;
                }
            };

            let native_thinking_ui = self.config.chat_options.think == Some(true);

            let Ok(mut outcome) = consume_stream(stream, &tx, native_thinking_ui).await else {
                return; // canal consommateur fermÃ©
            };

            enforce_max_tools_per_turn(
                &mut outcome.tool_calls,
                &self.config.run_spec,
                self.subagent_max_concurrent(),
            );

            push_assistant_message(&mut messages, &outcome);
            if self.config.run_spec.role_id == RoleId::Architect {
                let had_work_mode = architect_state.work_mode_anchor.is_some();
                architect_state.try_anchor_work_mode_from_text(&outcome.text);
                if !had_work_mode && architect_state.work_mode_anchor.is_some() {
                    refresh_architect_run_snapshot(
                        &mut messages,
                        &architect_run_context_block_per_turn(
                            &architect_state,
                            effective_run_objective.as_deref(),
                        ),
                    );
                }
            }
            last_stop_reason = outcome.reason;
            last_usage = outcome.usage.clone();
            if self.emit_context_usage(&messages, &tx).await.is_err() {
                return;
            }
            if let Some(obj) = &outcome.run_objective {
                if effective_run_objective.is_none() {
                    effective_run_objective = Some(obj.clone());
                    if self.config.run_spec.role_id != RoleId::Architect {
                        messages.push(Message::system(run_objective_system_block(obj)));
                    }
                }
                if self.config.run_spec.role_id == RoleId::Architect {
                    architect_state.anchor_run_objective(obj);
                    refresh_architect_run_snapshot(
                        &mut messages,
                        &architect_run_context_block_per_turn(
                            &architect_state,
                            effective_run_objective.as_deref(),
                        ),
                    );
                }
            }
            if let Err(e) = self
                .flush_transcript(&messages, &mut transcript_cursor)
                .await
            {
                let _ = tx.send(Err(e)).await;
                return;
            }

            if outcome.saw_answering {
                seen_answering_in_run = true;
                if !outcome.text.trim().is_empty() {
                    final_answer_guard.mark_user_facing_answer_seen();
                }
            }
            if outcome.saw_analyzing {
                saw_analyzing_phase_in_run = true;
            }
            if outcome.saw_testing {
                saw_testing_phase_in_run = true;
            }

            // Sprint Hotfix Â« boucle Â» â€” dÃ©tection d'empreinte rÃ©pÃ©tÃ©e. Ã€
            // Ã©valuer AVANT les gates `Done` / `tool_calls.is_empty` parce
            // que celles-ci injectent leurs propres nudges et pourraient
            // masquer la boucle (le modÃ¨le rÃ©pondrait pareil mais on
            // continuerait Ã  nudger sans jamais stopper).
            match loop_detector.observe(
                &outcome,
                self.config.engine_tuning.loop_strikes_before_abort,
            ) {
                LoopDecision::Ok => {}
                LoopDecision::Warn { kind, strike } => {
                    let max_strikes = self.config.engine_tuning.loop_strikes_before_abort;
                    let level = loop_intervention_level(strike, max_strikes);
                    debug!(
                        kind,
                        strike,
                        level,
                        "boucle détectée — injection recentrage (continue run)"
                    );
                    let ui_message =
                        loop_intervention_ui_message(level, kind, strike, max_strikes);
                    let model_recenter = loop_recenter_user_message(
                        &self.config.run_spec,
                        kind,
                        strike,
                        max_strikes,
                    );
                    let _ = tx
                        .send(Ok(AgentEvent::LoopIntervention {
                            level: level.to_string(),
                            loop_kind: Some(kind.to_string()),
                            turns: Some(strike),
                            user_message: ui_message,
                        }))
                        .await;
                    messages.push(Message::user(model_recenter));
                    messages.push(Message::system(LOOP_DETECTED_SYSTEM_NUDGE));
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                LoopDecision::Abort { kind, turns } => {
                    debug!(
                        kind,
                        turns,
                        "boucle non rÃ©solue — abort"
                    );
                    let max_strikes = self.config.engine_tuning.loop_strikes_before_abort;
                    let ui_message =
                        loop_intervention_ui_message("abort", kind, turns, max_strikes);
                    let _ = tx
                        .send(Ok(AgentEvent::LoopIntervention {
                            level: "abort".into(),
                            loop_kind: Some(kind.to_string()),
                            turns: Some(turns),
                            user_message: ui_message,
                        }))
                        .await;
                    let _ = tx
                        .send(Err(EngineError::LoopDetected { kind, turns }))
                        .await;
                    return;
                }
            }

            // Done-driven completion + answering-before-done. `todo_write`
            // n'est PAS exigÃ© ici : les rÃ©ponses purement conversationnelles
            // (salutations, questions triviales) et les runs purement
            // exploratoires (lecture sans mutation) ont le droit de clÃ´turer
            // sans liste de tÃ¢ches. Si le modÃ¨le a touchÃ© un outil mutateur
            // (file_edit / file_write / notebook_edit / delete_path / bash), la gate
            // `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED` l'aura forcÃ© Ã  passer
            // par `todo_write` AVANT â€” donc la liste existe forcÃ©ment quand
            // il y a eu du vrai travail, et la gate `unfinished_todos_prompt`
            // ci-dessous garde la clÃ´ture propre.
            if outcome.final_phase == Some(Phase::Done) {
                if self.config.run_spec.role_id == RoleId::Architect {
                    if outcome.tool_calls.is_empty() {
                        architect_state.consecutive_done_without_close = architect_state
                            .consecutive_done_without_close
                            .saturating_add(1);
                    } else {
                        architect_state.consecutive_done_without_close = 0;
                    }
                    if architect_state.run_closable() {
                        if !architect_state.cycle_sanity_resolved() {
                            if !architect_state.cycle_sanity_nudge_sent {
                                architect_state.cycle_sanity_nudge_sent = true;
                                debug!("[phase: done] architect cycle sanity — nudge");
                                messages.push(Message::system(
                                    super::nudges::ARCHITECT_CYCLE_SANITY_NUDGE_PROMPT,
                                ));
                                loop_detector.reset();
                                if let Err(e) = self
                                    .flush_transcript(&messages, &mut transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return;
                                }
                                continue;
                            }
                            if outcome.tool_calls.is_empty() {
                                debug!("[phase: done] blocked — cycle sanity pending");
                                messages.push(Message::system(
                                    super::nudges::ARCHITECT_CYCLE_SANITY_BLOCK_DONE_PROMPT,
                                ));
                                loop_detector.reset();
                                if let Err(e) = self
                                    .flush_transcript(&messages, &mut transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return;
                                }
                                continue;
                            }
                        } else {
                            let should_force_stop = architect_state.run_closable_nudge_sent
                                && outcome.tool_calls.is_empty()
                                && (seen_answering_in_run
                                    || architect_state.consecutive_done_without_close >= 2);
                            if should_force_stop {
                                debug!(
                                    consecutive = architect_state.consecutive_done_without_close,
                                    "[phase: done] architect run_fully_closable — force stop"
                                );
                                let _ = tx
                                    .send(Ok(AgentEvent::Stop {
                                        reason: outcome.reason,
                                        usage: outcome.usage.clone(),
                                    }))
                                    .await;
                                return;
                            }
                            if !architect_state.run_closable_nudge_sent {
                                architect_state.run_closable_nudge_sent = true;
                                debug!("[phase: done] architect run_closable — nudge");
                                messages.push(Message::system(
                                    super::nudges::ARCHITECT_RUN_CLOSABLE_NUDGE_PROMPT,
                                ));
                                loop_detector.reset();
                                if let Err(e) = self
                                    .flush_transcript(&messages, &mut transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return;
                                }
                                continue;
                            }
                        }
                    }
                }
                if !seen_answering_in_run {
                    if run_has_promotable_user_facing_text(
                        &outcome,
                        &messages,
                        self.config.run_spec.role_id,
                        &self.config.engine_tuning,
                    ) {
                        debug!(
                            "[phase: done] sans answering mais texte dÃ©jÃ  prÃ©sent â€” promotion UI, pas de second tour LLM"
                        );
                        if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                            return;
                        }
                        if tx
                            .send(Ok(AgentEvent::PhaseEnter {
                                phase: Phase::Answering,
                            }))
                            .await
                            .is_err()
                        {
                            return;
                        }
                        seen_answering_in_run = true;
                        loop_detector.reset();
                        messages.push(Message::assistant(
                            "[phase: answering]\n[phase: done]",
                        ));
                        if let Err(e) = self
                            .flush_transcript(&messages, &mut transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return;
                        }
                    } else if let Some(prompt) =
                        done_gate_missing_answering(&self.config.run_spec)
                    {
                        debug!("[phase: done] prÃ©maturÃ© (answering absent) â€” nudge");
                        messages.push(Message::system(prompt));
                        loop_detector.reset();
                        if let Err(e) = self
                            .flush_transcript(&messages, &mut transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return;
                        }
                        continue;
                    }
                }
                if professor
                    && !saw_successful_course_plan_write_in_run
                    && let Some(prompt) =
                        done_gate_professor_without_plan(&self.config.run_spec)
                {
                    debug!("[phase: done] professor sans course_plan_write â€” nudge");
                    messages.push(Message::system(prompt));
                    loop_detector.reset();
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                if professor {
                    if let Some(prompt) = done_gate_unfinished_course_plan(
                        &self.config.run_spec,
                        last_course_pending,
                        last_course_active,
                    ) {
                        debug!(
                            last_course_pending,
                            last_course_active,
                            "[phase: done] avec plan de cours ouvert â€” nudge"
                        );
                        messages.push(Message::system(prompt));
                        loop_detector.reset();
                        if let Err(e) = self
                            .flush_transcript(&messages, &mut transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return;
                        }
                        continue;
                    }
                } else if let Some(prompt) = done_gate_unfinished_todos(
                    &self.config.run_spec,
                    last_todo_pending,
                    last_todo_in_progress,
                ) {
                    debug!(
                        last_todo_pending,
                        last_todo_in_progress,
                        "[phase: done] avec to-do ouverte â€” nudge"
                    );
                    messages.push(Message::system(prompt));
                    loop_detector.reset();
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                if testing_gate_active
                    && saw_code_mutation_in_run
                    && !saw_testing_phase_in_run
                    && let Some(prompt) = done_gate_testing_required(&self.config.run_spec)
                {
                    debug!(
                        "[phase: done] mutation code sans phase testing â€” nudge"
                    );
                    messages.push(Message::system(prompt));
                    loop_detector.reset();
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                debug!("[phase: done] aprÃ¨s answering + todo_write clÃ´turÃ© â€” clÃ´ture propre");
                let _ = tx
                    .send(Ok(AgentEvent::Stop {
                        reason: outcome.reason,
                        usage: outcome.usage,
                    }))
                    .await;
                return;
            }

            // Si le modÃ¨le n'a pas signÃ© `done` et n'a pas non plus appelÃ©
            // d'outil ce tour, on l'invite explicitement Ã  choisir : conclure
            // (`answering` + `done`) ou continuer (`reading` / `acting` + tool).
            // Aucun compteur sÃ©parÃ© : `max_iterations` borne tout.
            if outcome.tool_calls.is_empty() {
                if self.config.run_spec.role_id == RoleId::ArchitectDiscussion
                    && outcome.tool_calls.is_empty()
                    && (extract_discussion_done_from_text(&outcome.text)
                        || outcome.final_phase == Some(Phase::Done))
                {
                    final_answer_guard.mark_user_facing_answer_seen();
                    debug!("architect discussion — marqueur de clôture, fin du run");
                    let _ = tx
                        .send(Ok(AgentEvent::Stop {
                            reason: outcome.reason,
                            usage: outcome.usage.clone(),
                        }))
                        .await;
                    return;
                }
                if self.config.run_spec.role_id == RoleId::ArchitectDiscussion
                    && self.config.engine_tuning.discussion_auto_stop_on_reply
                    && outcome.tool_calls.is_empty()
                    && run_has_promotable_user_facing_text(
                        &outcome,
                        &messages,
                        RoleId::ArchitectDiscussion,
                        &self.config.engine_tuning,
                    )
                {
                    final_answer_guard.mark_user_facing_answer_seen();
                    debug!("architect discussion — réponse directe, fin du run");
                    let _ = tx
                        .send(Ok(AgentEvent::Stop {
                            reason: outcome.reason,
                            usage: outcome.usage.clone(),
                        }))
                        .await;
                    return;
                }
                // Cas typique GLM-4.7-Flash : le modÃ¨le a dÃ©jÃ  Ã©mis sa
                // rÃ©ponse en `answering` mais a omis le `[phase: done]`
                // final. Le nudge gÃ©nÃ©rique le fait rÃ©-Ã©crire toute la
                // rÃ©ponse (Â« Ã©cris ta rÃ©ponse finale Â») â†’ affichage en
                // double cÃ´tÃ© UI. On lui demande juste le marqueur.
                if outcome.final_phase == Some(Phase::Answering)
                    && seen_answering_in_run
                    && last_todo_pending == 0
                    && last_todo_in_progress == 0
                {
                    // Run edit architect : pas de clôture « réponse seule » sans plan (todo_write).
                    let architect_edit_needs_plan = self.config.run_spec.role_id
                        == RoleId::Architect
                        && !plan_write_gate_satisfied(
                            professor,
                            saw_successful_todo_write_in_run,
                            saw_successful_course_plan_write_in_run,
                        );
                    // Réponse déjà publiée → clôture sans 2e tour LLM (évite bandeau reasoning / double réponse).
                    if !architect_edit_needs_plan
                        && run_has_promotable_user_facing_text(
                        &outcome,
                        &messages,
                        self.config.run_spec.role_id,
                        &self.config.engine_tuning,
                    ) {
                        debug!(
                            "answering without done, text already published — auto close (done UI)"
                        );
                        let _ = tx.send(Ok(AgentEvent::PhaseClose)).await;
                        if tx
                            .send(Ok(AgentEvent::PhaseEnter {
                                phase: Phase::Done,
                            }))
                            .await
                            .is_err()
                        {
                            return;
                        }
                        messages.push(Message::assistant("[phase: done]"));
                        if let Err(e) = self
                            .flush_transcript(&messages, &mut transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return;
                        }
                        let _ = tx
                            .send(Ok(AgentEvent::Stop {
                                reason: outcome.reason,
                                usage: outcome.usage,
                            }))
                            .await;
                        return;
                    }
                    debug!("answering sans done + todo clÃ´turÃ©e â€” nudge minimal (done seul)");
                    messages.push(Message::system(done_only_nudge_prompt(
                        &self.config.run_spec,
                    )));
                    loop_detector.reset();
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }

                debug!("tour sans tool_call et sans [phase: done] â€” nudge");
                let no_work_edit = self.config.run_spec.role_id == RoleId::Architect
                    && architect_state.todo_statuses.is_empty()
                    && !saw_code_mutation_in_run
                    && !saw_successful_todo_write_in_run;
                let nudge = if no_work_edit {
                    ARCHITECT_NO_WORK_NUDGE_PROMPT
                } else if self.config.run_spec.role_id == RoleId::Architect
                    && architect_state.run_fully_closable()
                {
                    super::nudges::ARCHITECT_RUN_CLOSABLE_NUDGE_PROMPT
                } else if self.config.run_spec.role_id == RoleId::Architect
                    && architect_state.run_closable()
                {
                    super::nudges::ARCHITECT_CYCLE_SANITY_NUDGE_PROMPT
                } else {
                    nudge_prompt(&self.config.run_spec)
                };
                messages.push(Message::system(nudge));
                loop_detector.reset();
                if let Err(e) = self
                    .flush_transcript(&messages, &mut transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return;
                }
                continue;
            }

            // GLM-4.7-Flash bat parfois `[file_edit, todo_write]` ou
            // `[bash, todo_write]` dans le mÃªme tour. On respecte l'intention en forÃ§ant l'ordre logique
            // d'exÃ©cution : `todo_write` d'abord, le reste ensuite. Le
            // mapping `tool_use_id â†” tool_result` reste correct (l'API
            // rÃ©-aligne via les ids, pas l'index de liste).
            //
            // Note : depuis la relax de la gate aux read-only (un `glob` ou
            // `file_read` initial passe librement), ce rÃ©ordonnement est
            // surtout utile pour les batchs contenant des mutations. Mais
            // il reste pertinent dans le cas gÃ©nÃ©ral Â« le modÃ¨le a tout
            // planifiÃ© dans une seule volÃ©e Â».
            //
            // Ne s'applique qu'au tout premier `todo_write` du run : une
            // fois la gate satisfaite, les batchs ultÃ©rieurs respectent
            // l'ordre demandÃ© par le modÃ¨le (parfois utile pour mettre Ã 
            // jour la to-do AVANT et le code APRÃˆS).
            if !plan_write_gate_satisfied(
                professor,
                saw_successful_todo_write_in_run,
                saw_successful_course_plan_write_in_run,
            ) {
                let plan_tool = if professor {
                    "course_plan_write"
                } else {
                    "todo_write"
                };
                if let Some(idx) = outcome
                    .tool_calls
                    .iter()
                    .position(|c| c.name == plan_tool)
                {
                    if idx > 0 {
                        let promoted = outcome.tool_calls.remove(idx);
                        outcome.tool_calls.insert(0, promoted);
                        debug!(
                            from_idx = idx,
                            tool = plan_tool,
                            "plan tool promu en tÃªte (batch dÃ©tectÃ© avant gate satisfaite)"
                        );
                    }
                }
            }

            let tool_calls: Vec<(&str, &Value)> = outcome
                .tool_calls
                .iter()
                .map(|c| (c.name.as_str(), &c.arguments))
                .collect();
            let batches = partition_tool_calls(&tool_calls, &self.registry);

            for batch in batches {
                match batch {
                    ToolCallBatch::Parallel(indices) => {
                        let max_parallel = self.config.max_parallel_tool_calls.max(1);
                        let mut to_execute: Vec<usize> = Vec::new();
                        for idx in &indices {
                            let call = &outcome.tool_calls[*idx];
                            if self
                                .try_recover_hallucinated_phase_tool(&tx, &mut messages, call)
                                .await
                            {
                                if let Err(e) = self
                                    .flush_transcript(&messages, &mut transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return;
                                }
                                continue;
                            }
                            if let Some(msg) = self.run_tool_pre_gates(
                                call,
                                &ctx,
                                professor,
                                &professor_course_state,
                                &last_todo_ids,
                                last_todo_was_all_completed,
                                saw_code_mutation_in_run,
                                saw_successful_todo_write_in_run,
                                &mut architect_state,
                                executor_deliverable_met,
                            ) {
                                let gate_message = if call.name == "todo_write" {
                                    escalate_todo_completion_gate_message(
                                        &msg,
                                        &mut consecutive_todo_completion_gate_failures,
                                    )
                                } else {
                                    consecutive_todo_completion_gate_failures = 0;
                                    msg
                                };
                                if push_tool_error_tracked(
                                    &tx,
                                    &mut messages,
                                    call,
                                    gate_message,
                                    &mut consecutive_ask_user_question_failures,
                                )
                                .await
                                .is_err()
                                {
                                    return;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, &mut transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return;
                                }
                                continue;
                            }
                            if let Some(denial) = self.check_permission(call).await {
                                if push_tool_error_tracked(
                                    &tx,
                                    &mut messages,
                                    call,
                                    denial,
                                    &mut consecutive_ask_user_question_failures,
                                )
                                    .await
                                    .is_err()
                                {
                                    return;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, &mut transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return;
                                }
                                continue;
                            }
                            to_execute.push(*idx);
                        }

                        let registry = self.registry.clone();
                        let ctx_parallel = ctx.clone();
                        let exec_results: Vec<(usize, PendingToolCall, Result<Value, drox_tools::ToolError>)> =
                            stream::iter(to_execute)
                                .map(|idx| {
                                    let call = outcome.tool_calls[idx].clone();
                                    let registry = registry.clone();
                                    let ctx_parallel = ctx_parallel.clone();
                                    async move {
                                        let result = registry
                                            .execute_named(
                                                &call.name,
                                                &ctx_parallel,
                                                call.arguments.clone(),
                                            )
                                            .await;
                                        (idx, call, result)
                                    }
                                })
                                .buffer_unordered(max_parallel)
                                .collect()
                                .await;

                        let mut by_idx: std::collections::BTreeMap<
                            usize,
                            Result<Value, drox_tools::ToolError>,
                        > = std::collections::BTreeMap::new();
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
                                    if !self
                                        .apply_read_only_tool_success(
                                            &ctx,
                                            call,
                                            value,
                                            &mut memory_tracker,
                                            &mut architect_state,
                                            &tx,
                                            &mut messages,
                                        )
                                        .await
                                    {
                                        return;
                                    }
                                }
                                Err(err) => {
                                    if push_tool_error_tracked(
                                        &tx,
                                        &mut messages,
                                        call,
                                        err.to_string(),
                                        &mut consecutive_ask_user_question_failures,
                                    )
                                    .await
                                    .is_err()
                                    {
                                        return;
                                    }
                                }
                            }
                            if let Err(e) = self
                                .flush_transcript(&messages, &mut transcript_cursor)
                                .await
                            {
                                let _ = tx.send(Err(e)).await;
                                return;
                            }
                        }
                    }
                    ToolCallBatch::Serial(indices) => {
                        for idx in indices {
                            let call = &outcome.tool_calls[idx];
                            if self
                                .try_recover_hallucinated_phase_tool(&tx, &mut messages, call)
                                .await
                            {
                                if let Err(e) = self
                                    .flush_transcript(&messages, &mut transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return;
                                }
                                continue;
                            }
                            if let Some(msg) = self.run_tool_pre_gates(
                                call,
                                &ctx,
                                professor,
                                &professor_course_state,
                                &last_todo_ids,
                                last_todo_was_all_completed,
                                saw_code_mutation_in_run,
                                saw_successful_todo_write_in_run,
                                &mut architect_state,
                                executor_deliverable_met,
                            ) {
                                let gate_message = if call.name == "todo_write" {
                                    escalate_todo_completion_gate_message(
                                        &msg,
                                        &mut consecutive_todo_completion_gate_failures,
                                    )
                                } else {
                                    consecutive_todo_completion_gate_failures = 0;
                                    msg
                                };
                                if push_tool_error_tracked(
                                    &tx,
                                    &mut messages,
                                    call,
                                    gate_message,
                                    &mut consecutive_ask_user_question_failures,
                                )
                                .await
                                .is_err()
                                {
                                    return;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, &mut transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return;
                                }
                                continue;
                            }

                            if let Some(denial) = self.check_permission(call).await {
                                if push_tool_error_tracked(
                                    &tx,
                                    &mut messages,
                                    call,
                                    denial,
                                    &mut consecutive_ask_user_question_failures,
                                )
                                .await
                                .is_err()
                                {
                                    return;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, &mut transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return;
                                }
                                continue;
                            }

                            if let Some(hooks) = self
                                .config
                                .tool_hooks
                                .as_ref()
                                .filter(|h| h.is_enabled())
                            {
                                let hook_ctx = ToolHookContext {
                                    tool_name: &call.name,
                                    tool_use_id: call.id.as_str(),
                                    tool_input: &call.arguments,
                                    tool_response: None,
                                };
                                if let PreHookOutcome::Block { message } = hooks
                                    .run_pre(hook_ctx, &ctx.workspace_root)
                                    .await
                                {
                                    if push_tool_error_tracked(
                                        &tx,
                                        &mut messages,
                                        call,
                                        message,
                                        &mut consecutive_ask_user_question_failures,
                                    )
                                    .await
                                    .is_err()
                                    {
                                        return;
                                    }
                                    if let Err(e) = self
                                        .flush_transcript(&messages, &mut transcript_cursor)
                                        .await
                                    {
                                        let _ = tx.send(Err(e)).await;
                                        return;
                                    }
                                    continue;
                                }
                            }

                            if self.config.run_spec.role_id == RoleId::Architect {
                                ctx.orchestration_run_closable =
                                    architect_state.run_fully_closable();
                                ctx = ctx.with_architect_help_snapshot(
                                    architect_state.architect_help_snapshot(
                                        effective_run_objective.as_deref(),
                                    ),
                                );
                                ctx.orchestration_delegate_attempt =
                                    if call.name == "delegate_executor" {
                                        call.arguments
                                            .get("task_id")
                                            .and_then(|v| v.as_str())
                                            .map(str::trim)
                                            .filter(|s| !s.is_empty())
                                            .map(|task_id| {
                                                architect_state
                                                    .delegate_counts
                                                    .get(task_id)
                                                    .copied()
                                                    .unwrap_or(0)
                                                    .saturating_add(1)
                                            })
                                    } else {
                                        None
                                    };
                            }

                            let exec = self
                                .registry
                                .execute_named(&call.name, &ctx, call.arguments.clone())
                                .await;
                            match exec {
                                Ok(mut value) => {
                                    memory_tracker.record_tool(&call.name);
                                    let _todo_prev_had_open_items = if call.name == "todo_write" {
                                        last_todo_pending > 0 || last_todo_in_progress > 0
                                    } else {
                                        false
                                    };
                                    if call.name == "todo_write" {
                                        consecutive_todo_completion_gate_failures = 0;
                                        saw_successful_todo_write_in_run = true;
                                        if self.config.run_spec.role_id == RoleId::Architect {
                                            let is_fresh_plan =
                                                architect_state.orchestration_plan_id.is_none()
                                                    || is_todo_recreation_from_scratch(
                                                        &call.arguments,
                                                        &last_todo_ids,
                                                        last_todo_was_all_completed,
                                                    );
                                            architect_state
                                                .ensure_plan_id_on_todo_write(is_fresh_plan);
                                            architect_state.ingest_todo_labels(&value);
                                            inject_architect_run_snapshot_after_checkpoint(
                                                &mut messages,
                                                &architect_run_context_block_compaction(
                                                    &architect_state,
                                                    effective_run_objective.as_deref(),
                                                ),
                                            );
                                            if let Some(ref pid) =
                                                architect_state.orchestration_plan_id
                                            {
                                                ctx = ctx
                                                    .with_orchestration_plan_id(pid.clone())
                                                    .with_orchestration_task_labels(Arc::new(
                                                        architect_state.task_labels.clone(),
                                                    ));
                                            }
                                        }
                                        last_todo_pending =
                                            value["counts"]["pending"].as_u64().unwrap_or(0);
                                        last_todo_in_progress =
                                            value["counts"]["in_progress"].as_u64().unwrap_or(0);
                                        last_todo_ids.clear();
                                        if let Some(todos) = value["todos"].as_array() {
                                            for t in todos {
                                                if let Some(id) =
                                                    t.get("id").and_then(|v| v.as_str())
                                                {
                                                    last_todo_ids.insert(id.to_string());
                                                }
                                            }
                                        }
                                        last_todo_was_all_completed =
                                            last_todo_pending == 0 && last_todo_in_progress == 0;
                                        mutating_tools_since_last_todo = 0;
                                    } else if call.name == "course_plan_write" {
                                        saw_successful_course_plan_write_in_run = true;
                                        professor_course_state =
                                            crate::professor::state_from_course_plan_output(
                                                &value,
                                            );
                                        last_course_pending =
                                            value["counts"]["pending"].as_u64().unwrap_or(0);
                                        last_course_active =
                                            value["counts"]["active"].as_u64().unwrap_or(0);
                                        mutating_tools_since_last_todo = 0;
                                    } else if MUTATING_TOOLS_FOR_STEP_TRACKING
                                        .contains(&call.name.as_str())
                                    {
                                        mutating_tools_since_last_todo =
                                            mutating_tools_since_last_todo.saturating_add(1);
                                    }
                                    if record_counts_as_code_mutation(
                                        &call.name,
                                        &call.arguments,
                                    ) {
                                        saw_code_mutation_in_run = true;
                                    }
                                    if call.name == "ask_user_question" {
                                        consecutive_ask_user_question_failures = 0;
                                    }
                                    if call.name == "workspace_map_read" {
                                        architect_state.ingest_workspace_map_output(&value);
                                    }
                                    let is_delegate_executor =
                                        call.name == "delegate_executor";
                                    if self.config.run_spec.role_id == RoleId::Architect
                                        && is_delegate_executor
                                    {
                                        architect_orchestration_record_successful_tool(
                                            self.config.run_spec.role_id,
                                            &call.name,
                                            &call.arguments,
                                            &mut architect_state,
                                        );
                                    }
                                    if is_delegate_executor {
                                        architect_state.record_delegate_result(
                                            &value,
                                            &ctx.effective_workspace(),
                                        );
                                    }
                                    if self.config.run_spec.role_id == RoleId::Architect {
                                        architect_state.observe_cycle_sanity_tool(
                                            &call.name,
                                            &call.arguments,
                                            &value,
                                        );
                                    }
                                    let mut verify_ack: Option<String> = None;
                                    if self.config.run_spec.role_id == RoleId::Architect {
                                        let mut newly_verified = Vec::new();
                                        if call.name == "grep" {
                                            newly_verified.extend(
                                                architect_state
                                                    .try_mark_verified_from_grep_output(&value),
                                            );
                                        }
                                        newly_verified.extend(architect_state.try_mark_verified(
                                            &call.name,
                                            &call.arguments,
                                        ));
                                        if !newly_verified.is_empty() {
                                            let ids = newly_verified.join("`, `");
                                            verify_ack = Some(format!(
                                                "Verification recorded for task(s) `{ids}`. \
                                                 You may mark those todos `completed` in `todo_write` \
                                                 when delegate status and scope proof are satisfied."
                                            ));
                                        }
                                    }
                                    if self.config.run_spec.role_id == RoleId::Architect
                                        && !is_delegate_executor
                                    {
                                        architect_orchestration_record_successful_tool(
                                            self.config.run_spec.role_id,
                                            &call.name,
                                            &call.arguments,
                                            &mut architect_state,
                                        );
                                    }
                                    let mut delegate_cap_nudge: Option<&str> = None;
                                    if self.config.run_spec.role_id == RoleId::Architect
                                        && !is_delegate_executor
                                    {
                                        delegate_cap_nudge = architect_delegate_cap_nudge(
                                            &self.config.engine_tuning,
                                            &mut architect_state,
                                            &call.name,
                                        );
                                    }
                                    let mut hook_appendix: Option<String> = None;
                                    if let Some(hooks) = self
                                        .config
                                        .tool_hooks
                                        .as_ref()
                                        .filter(|h| h.is_enabled())
                                    {
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
                                                &ctx.workspace_root,
                                                value,
                                            )
                                            .await;
                                        value = tool_response;
                                        hook_appendix = model_appendix;
                                    }
                                    let mut for_llm =
                                        format_tool_result_for_llm(&call.name, &value);
                                    if let Some(app) = hook_appendix {
                                        for_llm.push_str("\n\n");
                                        for_llm.push_str(&app);
                                    }
                                    if let Some(ack) = verify_ack {
                                        for_llm.push_str("\n\n");
                                        for_llm.push_str(&ack);
                                    }
                                    if let Some(nudge) = delegate_cap_nudge {
                                        for_llm.push_str("\n\n");
                                        for_llm.push_str(nudge);
                                    }
                                    if self.config.run_spec.role_id == RoleId::Architect
                                        && call.name == "delegate_executor"
                                    {
                                        for_llm.push_str("\n\n");
                                        for_llm.push_str(&architect_state.cycle_checkpoint_block());
                                    }
                                    mirror_workspace_map_from_tool(&ctx, &call.name, &value)
                                        .await;
                                    if let (Some(plan_id), Some(task_id)) = (
                                        self.config.executor_deliverable_plan_id.as_deref(),
                                        self.config.executor_deliverable_task_id.as_deref(),
                                    ) {
                                        if let Some(path) = deliverable_path_from_tool_success(
                                            &call.name,
                                            &call.arguments,
                                            &value,
                                            plan_id,
                                            task_id,
                                            &ctx.effective_workspace(),
                                            self.config.engine_tuning.min_deliverable_bytes,
                                        ) {
                                            executor_deliverable_met = true;
                                            executor_deliverable_path = Some(path);
                                        }
                                    }
                                    if call.name == "scope_defer" {
                                        if let Some(handle) = ctx.scope_deferred.as_ref() {
                                            let items = handle.snapshot();
                                            if tx
                                                .send(Ok(AgentEvent::ScopeParkingUpdate {
                                                    items,
                                                }))
                                                .await
                                                .is_err()
                                            {
                                                return;
                                            }
                                        }
                                    }
                                    if tx
                                        .send(Ok(AgentEvent::ToolFinish {
                                            id: call.id.clone(),
                                            output: value.clone(),
                                            is_error: false,
                                        }))
                                        .await
                                        .is_err()
                                    {
                                        return;
                                    }
                                    messages.push(Message::tool_result(call.id.clone(), for_llm, false));
                                    // Pas d'archive automatique au jalon todo — voir `maybe_snip`
                                    // (compaction contexte plein) ou `/session_end` utilisateur.
                                }
                                Err(err) => {
                                    let msg = err.to_string();
                                    if push_tool_error_tracked(
                                        &tx,
                                        &mut messages,
                                        call,
                                        msg,
                                        &mut consecutive_ask_user_question_failures,
                                    )
                                    .await
                                    .is_err()
                                    {
                                        return;
                                    }
                                }
                            }
                            if let Err(e) = self
                                .flush_transcript(&messages, &mut transcript_cursor)
                                .await
                            {
                                let _ = tx.send(Err(e)).await;
                                return;
                            }
                        }
                    }
                }
            }

            if executor_deliverable_met
                && self.config.run_spec.role_id == RoleId::Executor
            {
                if let (Some(task_id), Some(path)) = (
                    self.config.executor_deliverable_task_id.as_deref(),
                    executor_deliverable_path.as_deref(),
                ) && self
                    .finish_executor_on_deliverable(
                        &tx,
                        &mut messages,
                        &mut transcript_cursor,
                        task_id,
                        path,
                        last_stop_reason,
                        last_usage.clone(),
                    )
                    .await
                {
                    return;
                }
            }

            if self.emit_context_usage(&messages, &tx).await.is_err() {
                return;
            }

            // S2 — nudge protocolaire : rôle Architecte + exploration sans `[phase: analyzing]`
            // (pas d'heuristique sur le texte utilisateur).
            if self.config.run_spec.role_id == RoleId::Architect
                && !analyzing_phase_nudge_sent
                && !saw_analyzing_phase_in_run
            {
                let exploration_calls = outcome
                    .tool_calls
                    .iter()
                    .filter(|c| is_workspace_exploration_tool(&c.name))
                    .count();
                if exploration_calls >= 2 {
                    debug!(
                        exploration_calls,
                        "analyzing phase nudge — exploration sans marqueur analyzing"
                    );
                    messages.push(Message::system(ANALYZING_PHASE_NUDGE));
                    analyzing_phase_nudge_sent = true;
                    loop_detector.reset();
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
            }

            if consecutive_ask_user_question_failures
                >= self.config.engine_tuning.max_consecutive_ask_user_failures
            {
                debug!(
                    consecutive_ask_user_question_failures,
                    "ask_user_question â€” anti-boucle JSON (Â§2.21)"
                );
                messages.push(Message::system(ask_user_question_loop_nudge()));
                consecutive_ask_user_question_failures = 0;
                loop_detector.reset();
                if let Err(e) = self
                    .flush_transcript(&messages, &mut transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return;
                }
            }

            // Filet "step-by-step" : si le modÃ¨le vient d'exÃ©cuter plusieurs
            // outils mutateurs sans intercaler `todo_write` et qu'il lui
            // reste du travail dans son plan, on lui rappelle de mettre Ã 
            // jour ses Ã©tapes avant le prochain tour. Ne se dÃ©clenche qu'Ã 
            // partir de 2 outils mutateurs sans MAJ (silence en deÃ§Ã ).
            // Reset aprÃ¨s injection pour ne pas rÃ©pÃ©ter en boucle si le
            // modÃ¨le ignore le nudge â€” `max_iterations` reste le garde-fou.
            let plan_still_open = if professor {
                last_course_pending > 0 || last_course_active > 0
            } else {
                last_todo_pending > 0 || last_todo_in_progress > 0
            };
            if !professor
                && !saw_successful_todo_write_in_run
                && !plan_before_mutation_nudge_sent
                && mutating_tools_since_last_todo >= 1
            {
                debug!(
                    mutating_tools_since_last_todo,
                    "plan-before-mutation nudge : mutateur sans todo_write (soft, non bloquant)"
                );
                messages.push(Message::system(MUTATING_TOOL_BEFORE_TODO_WRITE_NUDGE));
                plan_before_mutation_nudge_sent = true;
                loop_detector.reset();
                if let Err(e) = self
                    .flush_transcript(&messages, &mut transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return;
                }
            }

            if mutating_tools_since_last_todo >= 2 && plan_still_open {
                debug!(
                    mutating_tools_since_last_todo,
                    last_todo_pending,
                    last_todo_in_progress,
                    last_course_pending,
                    last_course_active,
                    professor,
                    "step-by-step nudge : outils mutateurs accumulÃ©s sans MAJ plan"
                );
                let nudge = if professor {
                    format!(
                        "Heads-up: you've called {mutating_tools_since_last_todo} mutating tools \
                         since your last `course_plan_write`, and the course plan still has \
                         {last_course_pending} pending + {last_course_active} active step(s). \
                         Update the plan (`mastered` / next `active`) before continuing."
                    )
                } else {
                    step_by_step_todo_nudge(
                        mutating_tools_since_last_todo,
                        last_todo_pending,
                        last_todo_in_progress,
                    )
                };
                messages.push(Message::system(nudge));
                mutating_tools_since_last_todo = 0;
                loop_detector.reset();
                if let Err(e) = self
                    .flush_transcript(&messages, &mut transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return;
                }
            }
        }

        let _ = tx
            .send(Err(EngineError::MaxIterations(self.config.max_iterations)))
            .await;
    }

    async fn flush_transcript(
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

    /// Persistance `.drox/memory/sessions/` — **uniquement** après compaction live
    /// (contexte au-dessus du seuil `autocompact`). La clôture `[phase: done]` et
    /// les jalons `todo_write` ne déclenchent plus d'archive. `/session_end` reste
    /// côté IDE (commande utilisateur).
    ///
    /// Best-effort : un échec d'archivage ne casse pas le run. `MemoryPersisted`
    /// n'est émis qu'en cas de succès complet (compaction + écriture).
    ///
    /// L'`objective_fallback` est extrait de la premiÃ¨re ligne non vide du
    /// premier message `user` du run â€” utilisÃ© pour le slug si la
    /// compaction n'a pas livrÃ© de section `## Objective`.
    async fn maybe_persist_session(
        &self,
        messages: &[Message],
        tracker: &MemoryTracker,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        after_live_compaction: bool,
        live_compaction: Option<&crate::compaction::CompactionResult>,
    ) {
        let Some(memory) = self.config.memory.as_ref() else {
            return;
        };
        if !after_live_compaction && !tracker.is_non_trivial() {
            debug!("memory: run trivial, no persistence");
            return;
        }
        let fallback = first_user_text(messages).unwrap_or_else(|| "session".to_string());
        let persisted = if let Some(comp) = live_compaction {
            persist_compaction_result(memory, comp, &fallback).await
        } else {
            persist_run(memory, messages, &fallback).await
        };
        match persisted {
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
                    "memory: persistence failed â€” run still closes cleanly"
                );
            }
        }
    }

    /// Émet l'estimation courante de jetons parent (`count_tokens`) pour la jauge IDE.
    async fn emit_context_usage(
        &self,
        messages: &[Message],
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    ) -> Result<(), ()> {
        let Some(policy) = self.config.context.as_ref() else {
            return Ok(());
        };
        let parent_tokens = policy.count_tokens(messages);
        let parent_budget = policy.budget().effective_window();
        tx.send(Ok(AgentEvent::ContextUsage {
            parent_tokens,
            parent_budget: Some(parent_budget),
        }))
        .await
        .map_err(|_| ())
    }

    /// Si la `ContextPolicy` est dÃ©finie et que l'historique dÃ©passe le seuil
    /// `autocompact` : (1) passe de **snip** synchrone sur les gros
    /// `tool_result` ; (2) si toujours au-dessus du seuil **et** que
    /// `memory` est configurÃ©, **compaction LLM live** (checkpoint `system`)
    /// via [`crate::compaction::try_live_compact`]. Ã‰met `ContextSnip` et/ou
    /// `ContextCompacted`.
    ///
    /// Retourne `Err(())` si le canal de sortie est fermÃ© (cas oÃ¹ l'agent
    /// doit s'arrÃªter sans bruit).
    async fn maybe_snip(
        &self,
        messages: &mut Vec<Message>,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        live_compaction_seq: &mut u32,
        memory_tracker: &MemoryTracker,
        architect_state: &mut ArchitectRunState,
        effective_run_objective: Option<&str>,
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
        if self.config.engine_tuning.context_snip_enabled
            && let Some(report) = policy.maybe_snip(messages)
        {
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
        let live = crate::compaction::LiveCompactSettings::from_tuning(&self.config.engine_tuning);
        if let Some(report) = crate::compaction::compact_until_budget(
            memory.llm.as_ref(),
            memory.compaction_prompt.as_str(),
            messages,
            policy,
            &memory.compaction_config,
            &live,
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
                summary_text: report.summary_text().to_string(),
                files_touched: report.files_touched().to_vec(),
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
            debug!(
                tokens_before = report.tokens_before,
                tokens_after = report.tokens_after,
                "live compaction — persistance session (contexte plein)"
            );
            if self.config.run_spec.role_id == RoleId::Architect {
                inject_architect_run_snapshot_after_checkpoint(
                    messages,
                    &architect_run_context_block_compaction(
                        architect_state,
                        effective_run_objective,
                    ),
                );
            }
            self.maybe_persist_session(
                messages,
                memory_tracker,
                tx,
                true,
                Some(&report.compaction),
            )
            .await;
        }
        Ok(())
    }

    /// Récupère un pseudo-outil `phase` / `reading` / … : applique la transition sans erreur UI.
    async fn try_recover_hallucinated_phase_tool(
        &self,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        messages: &mut Vec<Message>,
        call: &PendingToolCall,
    ) -> bool {
        let Some(phase) =
            parse_hallucinated_phase_from_tool_call(&call.name, &call.arguments)
        else {
            return false;
        };
        if tx
            .send(Ok(AgentEvent::PhaseEnter { phase }))
            .await
            .is_err()
        {
            return true;
        }
        let marker = phase.as_marker();
        let hint = format!(
            "(Engine recovered `[phase: {marker}]` from a mistaken tool call — emit that line as \
             **plain text** in your next message, not `tool_calls`.)"
        );
        let value = json!({
            "ok": true,
            "recovered_phase": marker,
            "hint": hint,
        });
        if tx
            .send(Ok(AgentEvent::ToolFinish {
                id: call.id.clone(),
                output: value,
                is_error: false,
            }))
            .await
            .is_err()
        {
            return true;
        }
        messages.push(Message::tool_result(call.id.clone(), hint, false));
        true
    }

    fn running_subagent_jobs_count(&self) -> usize {
        self.ctx
            .subagent_executor
            .as_ref()
            .map(|e| e.running_jobs_count())
            .unwrap_or(0)
    }

    fn running_explore_jobs(&self) -> Vec<RunningSubagentJob> {
        self.ctx
            .subagent_executor
            .as_ref()
            .map(|e| {
                e.running_explore_jobs()
                    .into_iter()
                    .map(|j| RunningSubagentJob {
                        job_id: j.job_id,
                        description: j.description,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn subagent_max_concurrent(&self) -> usize {
        self.ctx
            .subagent_settings
            .as_ref()
            .map(|s| s.max_concurrent)
            .unwrap_or(1)
            .max(1)
    }

    /// Injecte les rapports des jobs explore terminés (M5c) avant le tour LLM.
    async fn drain_subagent_jobs_into_messages(
        &self,
        messages: &mut Vec<Message>,
        transcript_cursor: &mut usize,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    ) -> Result<usize, ()> {
        let Some(exec) = self.ctx.subagent_executor.as_ref() else {
            return Ok(0);
        };
        let completed = exec.drain_completed_jobs();
        if completed.is_empty() {
            return Ok(0);
        }
        let n = completed.len();
        for job in completed {
            let body = match &job.result {
                Ok(ok) => {
                    let v = structure_task_async_completed(&job.job_id, ok);
                    format!(
                        "[drox: explore subagent completed — report injected, job_id={}]\n{}",
                        job.job_id,
                        serde_json::to_string(&v).unwrap_or_default()
                    )
                }
                Err(e) => format!(
                    "[drox: explore subagent failed — job_id={}]\n{e}",
                    job.job_id
                ),
            };
            messages.push(Message::system(body));
        }
        if let Err(e) = self.flush_transcript(messages, transcript_cursor).await {
            let _ = tx.send(Err(e)).await;
            return Err(());
        }
        if self.emit_context_usage(messages, tx).await.is_err() {
            return Err(());
        }
        Ok(n)
    }

    /// Gates prÃ©-exÃ©cution (hors permissions). `Some(msg)` = bloquer avec erreur.
    fn run_tool_pre_gates(
        &self,
        call: &PendingToolCall,
        ctx: &ToolContext,
        professor: bool,
        professor_course_state: &crate::professor::ProfessorCourseState,
        last_todo_ids: &std::collections::HashSet<String>,
        last_todo_was_all_completed: bool,
        saw_code_mutation_in_run: bool,
        saw_successful_todo_write_in_run: bool,
        architect_state: &mut ArchitectRunState,
        executor_deliverable_met: bool,
    ) -> Option<String> {
        if let Some(msg) = explore_running_mutation_block(
            &self.config.run_spec,
            self.running_subagent_jobs_count(),
            &call.name,
        ) {
            return Some(msg);
        }
        if let Some(msg) = explore_second_task_block(
            &self.config.run_spec,
            &call.name,
            &call.arguments,
            self.running_subagent_jobs_count(),
            self.subagent_max_concurrent(),
        ) {
            return Some(msg);
        }
        tool_pre_gate_block(
            &self.config.run_spec,
            &call.name,
            &call.arguments,
            professor,
            professor_course_state,
            last_todo_ids,
            last_todo_was_all_completed,
            saw_code_mutation_in_run,
            saw_successful_todo_write_in_run,
            Some(architect_state),
            executor_deliverable_met,
            Some(&ctx.effective_workspace()),
            ctx.drox_ignore.as_ref(),
            &self.config.engine_tuning,
        )
    }

    /// Contrat A — clôture déterministe d'un sous-run exécuteur (livrable `.md` sur disque).
    async fn finish_executor_on_deliverable(
        &self,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        messages: &mut Vec<Message>,
        transcript_cursor: &mut usize,
        task_id: &str,
        deliverable_path: &str,
        reason: StopReason,
        usage: Usage,
    ) -> bool {
        debug!(
            task_id,
            deliverable_path,
            "executor deliverable contract — auto stop"
        );
        let notice = executor_deliverable_closure_notice(task_id, deliverable_path);
        if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
            return false;
        }
        if tx
            .send(Ok(AgentEvent::PhaseEnter {
                phase: Phase::Answering,
            }))
            .await
            .is_err()
        {
            return false;
        }
        if tx
            .send(Ok(AgentEvent::TextDelta {
                text: notice.clone(),
            }))
            .await
            .is_err()
        {
            return false;
        }
        if tx
            .send(Ok(AgentEvent::PhaseEnter {
                phase: Phase::Done,
            }))
            .await
            .is_err()
        {
            return false;
        }
        messages.push(Message::assistant(format!(
            "[phase: answering]\n{notice}\n[phase: done]"
        )));
        if self
            .flush_transcript(messages, transcript_cursor)
            .await
            .is_err()
        {
            return false;
        }
        if tx.send(Ok(AgentEvent::Stop { reason, usage })).await.is_err() {
            return false;
        }
        true
    }

    /// Applique le succès d'un tool read-only (lot parallèle §2.29).
    async fn apply_read_only_tool_success(
        &self,
        ctx: &ToolContext,
        call: &PendingToolCall,
        value: Value,
        memory_tracker: &mut MemoryTracker,
        architect_state: &mut ArchitectRunState,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        messages: &mut Vec<Message>,
    ) -> bool {
        memory_tracker.record_tool(&call.name);
        let mut verify_ack = None;
        if self.config.run_spec.role_id == RoleId::Architect {
            verify_ack = architect_record_read_only_tool_success(
                self.config.run_spec.role_id,
                &call.name,
                &call.arguments,
                &value,
                architect_state,
            );
        }
        mirror_workspace_map_from_tool(ctx, &call.name, &value).await;
        let mut for_llm = format_tool_result_for_llm(&call.name, &value);
        if let Some(ack) = verify_ack {
            for_llm.push_str("\n\n");
            for_llm.push_str(&ack);
        }
        if tx
            .send(Ok(AgentEvent::ToolFinish {
                id: call.id.clone(),
                output: value.clone(),
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

    /// Ã‰value la permission pour un tool call. Renvoie `Some(message)` si la
    /// dÃ©cision finale est un refus (Ã  pousser comme `tool_result` d'erreur),
    /// `None` si le tool peut s'exÃ©cuter.
    async fn check_permission(&self, call: &PendingToolCall) -> Option<String> {
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
                debug!(tool = %call.name, ?reason, "tool autorisÃ©");
                None
            }
            PermissionDecision::Deny { reason, message } => {
                warn!(tool = %call.name, ?reason, "tool refusÃ©");
                Some(message)
            }
            PermissionDecision::Ask { reason, message } => {
                debug!(tool = %call.name, ?reason, "tool nÃ©cessite confirmation");
                if confirm_with_user(&self.ctx, &call.name, &call.arguments, &message).await {
                    None
                } else {
                    Some(format!("User denied permission for `{}`.", call.name))
                }
            }
        }
    }
}

fn escalate_todo_completion_gate_message(message: &str, streak: &mut u32) -> String {
    let blocked_completion = message.contains("cannot be `completed` yet")
        || message.contains("[completion_block_reasons]");
    if !blocked_completion {
        *streak = 0;
        return message.to_string();
    }
    *streak = streak.saturating_add(1);
    if *streak < 2 {
        return message.to_string();
    }
    format!(
        "{message}\n\n\
         [anti-repeat escalation]\n\
         You are repeating a blocked `todo_write completed` action.\n\
         Stop retrying `completed` now. Execute the exact \"Next required action\" above first, \
         then come back to `todo_write` once the proof/delegation exists."
    )
}
