//! Boucle principale `drive_inner` — tours LLM, tools, gates et clôture.

use std::collections::{HashMap, VecDeque};

use drox_hooks::{PostHookOutcome, PreHookOutcome, ToolHookContext};
use drox_tools::ToolError;
use drox_types::{Content, Message, StopReason, ToolUseId, Usage};
use futures::{stream, StreamExt};
use serde_json::Value;
use tokio::sync::mpsc;
use tracing::debug;

use crate::error::EngineError;
use crate::event::{AgentEvent, Phase};
use crate::memory::MemoryTracker;
use crate::tool_orchestration::{partition_tool_calls, ToolCallBatch};
use crate::tool_progress::ToolProgressBridge;

use super::super::dispatch::{
    build_tool_specs, format_tool_result_for_llm_with_profile, mirror_workspace_map_from_tool,
    push_tool_error_tracked,
};
use super::super::config::EngineProfile;
use super::super::gates::{
    counts_as_mutating_for_step_tracking, is_professor_run, plan_write_gate_satisfied,
    record_counts_as_code_mutation, PROFESSOR_DONE_WITHOUT_PLAN,
};
use super::super::loop_close::{
    emit_engine_closure, emit_synthetic_done, ENGINE_CLOSURE_EMPTY_REPLY,
};
use super::super::loop_detect::{LoopDecision, LoopDetector, PendingToolCall};
use super::super::nudges::{
    ask_user_question_loop_nudge, context_load_nudge, explore_incomplete_nudge,
    run_objective_done_nudge, run_objective_system_block, step_by_step_todo_nudge,
    unfinished_course_plan_prompt, unfinished_todos_prompt, ANALYZING_PHASE_NUDGE,
    CODE_MUTATION_TESTING_NUDGE, DONE_ONLY_NUDGE_PROMPT, DOC_INGESTION_EXPLORE_ANNEX,
    EXPLORE_RESCUE_PARENT_READ_NUDGE, INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT,
    INTENT_ONLY_WRITE_MAX_NUDGES, INTENT_ONLY_WRITE_NUDGE_PROMPT, LOOP_DETECTED_NUDGE_PROMPT,
    LOOP_FORCE_CONCLUDE_PROMPT, LOOP_TOOL_FAMILY_NUDGE_PROMPT,
    MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
    EXPLORE_ARTIFACT_READ_FAIL_NUDGE, EXPLORE_COVERED_REREAD_NUDGE, MICRO_ACT_WRITE_NUDGE,
    MISSING_ANSWERING_PROMPT, NUDGE_PROMPT, PARENT_HEAVY_READ_NUDGE,
    PARENT_HEAVY_READ_NUDGE_THRESHOLD, POST_ASK_ACTING_NUDGE, POST_EXPLORE_STALL_ACT_NUDGE,
    POST_EXPLORE_STALL_READ_THRESHOLD, POST_MERGE_CLOSURE_NUDGE,
    REPEATED_FILE_READ_NUDGE,
    REPEATED_FILE_READ_NUDGE_THRESHOLD, ROTATING_FILE_READ_NUDGE,
    ROTATING_FILE_READ_REINJECT_EVERY, WORK_PLAN_FRAME_NUDGE,
    WORK_WITHOUT_PLAN_NUDGE, WORK_WITHOUT_PLAN_NUDGE_THRESHOLD, STEP_WITHOUT_EXPLORE_NUDGE_THRESHOLD,
    step_explore_kickoff_nudge, step_without_explore_nudge, LOCAL_EMPTY_TURN_NUDGE,
    LOCAL_EXPLORE_KICKOFF_NUDGE, LOCAL_FINAL_ANSWER_PROMPT, LOCAL_SOFT_CLOSE_CHECK_NUDGE,
};
use super::super::session_intent::{classify_session_user_intent, SessionFrames};
use super::super::context_load::{
    score as score_context_load, should_inject as should_inject_context_load,
    snapshot_from_glob_value, ContextLoadSnapshot,
};
use super::super::phase::{
    counts_as_pre_plan_activity, is_workspace_exploration_tool, user_blocks_plain_text,
};
use super::super::situation::{
    clear_rotating_file_read_window, completed_todos_hint, counts_as_parent_heavy_read,
    explore_deliverable_empty, first_in_progress_todo_id, next_todo_from_output,
    note_rotating_file_read, note_successful_file_read, note_task_tool_success,
    path_from_file_tool, repeated_file_read_stub_value, rotating_file_read_should_nudge,
    should_stub_repeated_file_read, task_outcome_telemetry,
    upsert_situation_card,
    ExploreCoveredPaths, SituationSnapshot,
};
use super::super::consume_llm_stream::{consume_stream, push_assistant_message};
use super::super::todo_text_salvage::salvage_inline_todo_write;
use super::Agent;

impl Agent {
    #[allow(clippy::too_many_lines)]
    pub(super) async fn drive_inner(
        self,
        history: Vec<Message>,
        user_blocks: Vec<Content>,
        tx: mpsc::Sender<Result<AgentEvent, EngineError>>,
        skip_new_user_turn: bool,
    ) {
        let professor = is_professor_run(self.config.permissions.as_ref());
        let profile = self.config.profile();
        // Profils locaux : clôture moteur (tour sans tool = réponse). Child Explore
        // et professeur gardent leur propre contrat.
        let engine_closure = profile.is_local() && !professor && !self.config.explore_execution;
        let plan_nudges = profile.plan_nudges();
        tracing::info!(
            engine_profile = profile.id(),
            engine_closure,
            plan_nudges,
            "agent.run engine profile"
        );
        let tool_specs = build_tool_specs(&self.registry, professor, profile);
        // Sprint M1 — si la mémoire de session est configurée, on greffe
        // le `SessionNotesHandle` partagé dans le `ToolContext` du run.
        // Les tools `session_note` / `memory_read` / `memory_list` y voient
        // le stock partagé ; sans `memory`, ils renvoient une erreur explicite
        // ("tool unavailable in this context") qui s'affiche au modèle.
        let ctx = match self.config.memory.as_ref() {
            Some(mem) => self.ctx.clone().with_session_notes(mem.notes.clone()),
            None => self.ctx.clone(),
        };
        let mut memory_tracker = MemoryTracker::new();
        let mut messages = Vec::new();
        if let Some(sys) = &self.config.system_prompt {
            messages.push(Message::system(sys));
        }
        if let Some(obj) = &self.config.run_objective {
            let block = run_objective_system_block(obj);
            messages.push(Message::system(block));
            let _ = tx
                .send(Ok(AgentEvent::RunObjective {
                    text: obj.clone(),
                }))
                .await;
        }
        messages.extend(history);
        let user_text_for_intent = if skip_new_user_turn {
            use drox_types::Role;
            messages
                .iter()
                .rev()
                .find(|m| m.role == Role::User)
                .map(|m| Content::collapse_text(&m.content))
                .unwrap_or_default()
        } else {
            user_blocks_plain_text(&user_blocks)
        };
        // Boot classif multi-bool (`drox_prompts`) — pas de needles sur le message user.
        let session_frames = if self.config.session_intent_preclassified {
            SessionFrames {
                work_plan: self.config.work_plan_frame,
                analysis: self.config.analysis_frame,
                doc_ingestion: self.config.doc_ingestion_frame,
            }
        } else {
            classify_session_user_intent(
                self.llm.as_ref(),
                &self.config.chat_options,
                &user_text_for_intent,
            )
            .await
            .unwrap_or(SessionFrames {
                work_plan: self.config.work_plan_frame,
                analysis: self.config.analysis_frame,
                doc_ingestion: self.config.doc_ingestion_frame,
            })
        };
        if !skip_new_user_turn {
            // Garantit qu'il y a toujours au moins un bloc texte pour les
            // providers strictement text-only et pour la cohérence du transcript.
            let user_blocks = if user_blocks.is_empty() {
                vec![Content::text(String::new())]
            } else {
                user_blocks
            };
            messages.push(Message::user_with_blocks(user_blocks));
        } else if messages
            .iter()
            .rev()
            .find(|m| m.role == drox_types::Role::User)
            .is_none()
        {
            let _ = tx
                .send(Err(EngineError::Memory(
                    "continue_from_history requires a user message in transcript".into(),
                )))
                .await;
            return;
        }

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

        // Sprint A.2 — done-driven completion. Plus de heuristique « pas
        // d'outil = on s'arrête » : la SEULE condition de fin propre est
        // `[phase: done]`. Tant que ce marqueur n'est pas vu, on injecte un
        // nudge et on relance. La borne dure reste `max_iterations`.
        //
        // Sprint A.3 — answering-before-done. On ajoute une seconde
        // contrainte : `done` n'est accepté que si **au moins un**
        // `[phase: answering]` a été émis dans le run. Sinon la réponse
        // finale est enfouie dans la trace UI repliée (invisible) et on
        // demande au modèle de la re-rédiger dans `answering`, même au prix
        // d'une répétition. C'est délibéré : la phase `answering` est la
        // seule rendue en clair dans la bulle assistant (cf. `chat.js`).
        let mut seen_answering_in_run = false;
        let mut saw_successful_todo_write_in_run = false;
        let mut saw_successful_course_plan_write_in_run = false;
        // Snapshot du dernier `todo_write` réussi (compteurs `pending` /
        // `in_progress`). Sert à interdire `[phase: done]` tant que la to-do
        // n'est pas elle-même clôturée — cf. `unfinished_todos_prompt`.
        let mut last_todo_pending: u64 = 0;
        let mut last_todo_in_progress: u64 = 0;
        let mut last_course_pending: u64 = 0;
        let mut last_course_active: u64 = 0;
        let mut professor_course_state = crate::professor::ProfessorCourseState::default();
        // Sprint Plan « un seul plan par run » — set des ids du dernier
        // `todo_write` réussi + flag « toutes les étapes étaient completed ».
        // Servent à détecter une re-création de plan from scratch après
        // clôture (cf. `is_todo_recreation_from_scratch`).
        let mut last_todo_ids: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut last_todo_was_all_completed: bool = false;
        // Step-by-step progression tracker : compte le nombre d'outils
        // mutateurs (`file_edit` / `file_write` / `notebook_edit` / `delete_path` / `bash`) exécutés depuis le
        // dernier `todo_write` réussi. Au-delà de 2, on injecte un nudge soft
        // pour pousser le modèle à mettre à jour sa todo entre les étapes.
        // Reset à chaque `todo_write` réussi ET à chaque injection de nudge
        // (pour ne pas répéter en boucle).
        let mut mutating_tools_since_last_todo: u32 = 0;
        // Sprint Hotfix « boucle édition/lecture » — détecteur strict de
        // répétition d'empreinte (texte assistant + tool_calls). Voir
        // `LoopDetector`. 1.6.0 : `reset` uniquement sur nudges structurels
        // (pas DONE_ONLY / générique — L-1).
        let mut loop_detector = LoopDetector::new();
        // Après ForceConclude : tours LLM suivants sans tools jusqu'à Done / SyntheticDone.
        let mut loop_tools_disabled = false;
        // Profils locaux : tour final forcé (tools off) + relances one-shot.
        let mut final_answer_forced = false;
        let mut local_empty_turn_nudge_sent = false;
        let mut local_soft_close_check_sent = false;
        // cloud-full : un DONE_ONLY déjà envoyé. Le tour suivant ne réaffiche
        // pas la conclusion ; sans `[phase: done]`, le run s'arrête.
        let mut done_only_nudge_sent = false;
        let mut consecutive_ask_user_question_failures: u32 = 0;
        let mut live_compaction_seq: u32 = 0;
        let mut run_objective_reminder_sent = false;
        let mut analyzing_phase_nudge_sent = false;
        let mut saw_analyzing_phase_in_run = false;
        let mut saw_code_mutation_in_run = false;
        let mut saw_testing_phase_in_run = false;
        // FX-B — compteur de nudges « acting sans tool ».
        let mut consecutive_intent_only_write_nudges: u32 = 0;
        // 1.6.0 Vague 4 / S-1 — situation card (upsert chaque tour).
        let mut files_touched_in_run: Vec<String> = Vec::new();
        let mut last_tool_error: Option<String> = None;
        let mut last_todo_next: Option<String> = None;
        let mut last_todo_completed_hint: u64 = 0;
        let mut parent_heavy_read_streak: u32 = 0;
        let mut parent_heavy_read_nudge_sent = false;
        let mut doc_ingestion_annex_sent = false;
        let mut work_plan_frame_nudge_sent = false;
        let mut local_explore_kickoff_sent = false;
        // Soft — work/doc + activité outils sans todo_write (one-shot).
        let mut pre_plan_activity_count: u32 = 0;
        let mut work_without_plan_nudge_sent = false;
        let mut last_in_progress_todo_id: Option<String> = None;
        // Soft Explore kickoff: (step_id, optional content label).
        let mut pending_step_explore_nudge: Option<(String, Option<String>)> = None;
        // Soft — étape in_progress sans task (compteur parent, one-shot / step).
        let mut step_parent_activity_count: u32 = 0;
        let mut step_had_task_success = false;
        let mut step_without_explore_nudge_sent = false;
        // Context-load V1 — soft nudge one-shot après glob large.
        let mut pending_context_load: Option<ContextLoadSnapshot> = None;
        let mut context_load_nudge_sent = false;
        let mut last_context_load_recommended_n: u32 = 3;
        // Explore truncated → re-split nudge + anti parent-rescue.
        let mut pending_explore_incomplete: Option<(u64, u64)> = None;
        let mut explore_rescue_active = false;
        let mut explore_rescue_nudge_sent = false;
        // P1 — compteur de `file_read` réussis par path normalisé.
        let mut file_read_success_counts: HashMap<String, u32> = HashMap::new();
        let mut repeated_file_read_nudge_sent = false;
        // Soft — rotation multi-path (fenêtre glissante) + clôture post-merge Explore.
        let mut recent_file_reads: VecDeque<String> = VecDeque::new();
        let mut rotating_file_read_nudge_sent = false;
        // R1 — ré-inject Prefer rotating tous les N reads tant que la fenêtre tourne.
        let mut rotating_last_nudge_at: usize = 0;
        let mut pending_post_merge_closure_nudge = false;
        // C4 / V6-a — micro acting write juste après post-merge.
        let mut pending_micro_act_write_nudge = false;
        let mut micro_act_write_nudge_sent = false;
        // C2 / V2-c / E1 — paths Explore couverts → Prefer si parent re-file_read.
        let mut explore_covered_paths = ExploreCoveredPaths::default();
        let mut pending_explore_covered_reread_nudge = false;
        let mut explore_covered_reread_nudge_sent = false;
        // E2 — après Explore OK, lectures parent sans mutation → Prefer act.
        let mut post_explore_window = false;
        let mut post_explore_read_streak: u32 = 0;
        let mut pending_post_explore_stall_nudge = false;
        let mut post_explore_stall_nudge_sent = false;
        // A — explore_artifact_read error → Prefer recovery (pas file_read kind).
        let mut pending_explore_artifact_read_fail_nudge = false;
        // D4 — après ask_user_question réussi → soft skeleton / mutate.
        let mut pending_post_ask_acting_nudge = false;
        let task_tool_available = tool_specs.iter().any(|s| s.name == "task");
        // Systèmes injectés en tête de `messages` (re-poussés à chaque run) —
        // exclus du rewrite JSONL post-compaction (C-1). Inclut la situation
        // card dès qu'elle est insérée.
        let mut leading_injected_systems = usize::from(self.config.system_prompt.is_some())
            + usize::from(self.config.run_objective.is_some());
        let permission_mode_label = self
            .config
            .permissions
            .as_ref()
            .map(|p| match p.mode {
                drox_permissions::PermissionMode::Default => "default",
                drox_permissions::PermissionMode::Plan => "plan",
                drox_permissions::PermissionMode::AcceptEdits => "acceptEdits",
                drox_permissions::PermissionMode::BypassPermissions => "bypassPermissions",
                drox_permissions::PermissionMode::Professor => "professor",
            })
            .map(str::to_string);
        let testing_gate_active = !ctx.plan_mode && !professor;
        for iter in 0..self.config.max_iterations {
            debug!(
                iter,
                seen_answering_in_run,
                saw_successful_todo_write_in_run,
                last_todo_pending,
                last_todo_in_progress,
                mutating_tools_since_last_todo,
                "tour LLM (todo_write obligatoire AVANT tout autre outil, optionnel pour conversation pure)"
            );

            if self
                .maybe_snip(
                    &mut messages,
                    &tx,
                    &mut live_compaction_seq,
                    &mut transcript_cursor,
                    leading_injected_systems,
                )
                .await
                .is_err()
            {
                return;
            }

            // S-1 — rafraîchir la situation card après snip / avant stream_chat.
            let situation = SituationSnapshot {
                objective: self.config.run_objective.clone(),
                todos_pending: last_todo_pending,
                todos_in_progress: last_todo_in_progress,
                todos_completed_hint: last_todo_completed_hint,
                next_todo: last_todo_next.clone(),
                files_touched: files_touched_in_run.clone(),
                last_tool_error: last_tool_error.clone(),
                permission_mode: permission_mode_label.clone(),
            };
            if upsert_situation_card(&mut messages, &situation, leading_injected_systems) {
                leading_injected_systems = leading_injected_systems.saturating_add(1);
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

            // Soft plan-frame (classif isWork) — texte only.
            // Profils locaux : budget presque épuisé → tools off, réponse obligatoire.
            let final_reserve = if self.config.max_iterations >= 4 { 2 } else { 1 };
            if engine_closure
                && !final_answer_forced
                && iter + final_reserve >= self.config.max_iterations
            {
                debug!(iter, "local profile — final answer turn (tools off)");
                messages.push(Message::system(LOCAL_FINAL_ANSWER_PROMPT));
                final_answer_forced = true;
                loop_tools_disabled = true;
            }

            if plan_nudges && iter == 0 && session_frames.work_plan && !work_plan_frame_nudge_sent {
                debug!("work plan frame — soft nudge (turn-0)");
                messages.push(Message::system(WORK_PLAN_FRAME_NUDGE));
                work_plan_frame_nudge_sent = true;
            }

            // Soft Explore kickoff — local-9b (les plan_nudges 27b/cloud couvrent déjà le kickoff).
            if profile == EngineProfile::Local9b
                && task_tool_available
                && iter == 0
                && !local_explore_kickoff_sent
                && (session_frames.work_plan || session_frames.doc_ingestion)
            {
                debug!("local-9b — soft Explore kickoff (turn-0)");
                messages.push(Message::system(LOCAL_EXPLORE_KICKOFF_NUDGE));
                local_explore_kickoff_sent = true;
            }

            // Annex turn-0 — ingestion docs multi-fichiers → Explore d'abord.
            if iter == 0
                && task_tool_available
                && session_frames.doc_ingestion
                && !doc_ingestion_annex_sent
            {
                debug!("doc ingestion intent — Explore annex (turn-0)");
                messages.push(Message::system(DOC_INGESTION_EXPLORE_ANNEX));
                doc_ingestion_annex_sent = true;
            }

            // Soft — work/doc sans todo après N outils réussis (toute activité).
            // Tools restent libres (pas de blocked) ; needles / chitchat légitimes OK.
            if plan_nudges
                && !work_without_plan_nudge_sent
                && !saw_successful_todo_write_in_run
                && (session_frames.work_plan || session_frames.doc_ingestion)
                && pre_plan_activity_count >= WORK_WITHOUT_PLAN_NUDGE_THRESHOLD
            {
                debug!(
                    pre_plan_activity_count,
                    "work without plan — soft todo nudge"
                );
                messages.push(Message::system(WORK_WITHOUT_PLAN_NUDGE));
                work_without_plan_nudge_sent = true;
            }

            // Soft — kickoff d'une nouvelle étape plan → Explore pour cette étape.
            if task_tool_available && plan_nudges {
                if let Some((step_id, step_content)) = pending_step_explore_nudge.take() {
                    debug!(
                        marker = "c4.micro_task_kickoff",
                        %step_id,
                        "dogfood: step kickoff — soft Explore micro"
                    );
                    messages.push(Message::system(step_explore_kickoff_nudge(
                        &step_id,
                        step_content.as_deref(),
                    )));
                }
            }

            // Soft — étape in_progress, activité parent, toujours pas de task.
            if task_tool_available
                && plan_nudges
                && !step_without_explore_nudge_sent
                && !step_had_task_success
                && last_in_progress_todo_id.is_some()
                && step_parent_activity_count >= STEP_WITHOUT_EXPLORE_NUDGE_THRESHOLD
            {
                let step_id = last_in_progress_todo_id.as_deref().unwrap_or("?");
                debug!(%step_id, step_parent_activity_count, "step without explore — soft nudge");
                messages.push(Message::system(step_without_explore_nudge(
                    step_id,
                    last_todo_next.as_deref(),
                )));
                step_without_explore_nudge_sent = true;
            }

            // S-5 — trop de lectures massives parent sans Explore.
            if task_tool_available
                && !parent_heavy_read_nudge_sent
                && parent_heavy_read_streak >= PARENT_HEAVY_READ_NUDGE_THRESHOLD
            {
                debug!(
                    streak = parent_heavy_read_streak,
                    "parent heavy reads — Explore nudge (S-5)"
                );
                messages.push(Message::system(PARENT_HEAVY_READ_NUDGE));
                parent_heavy_read_nudge_sent = true;
                parent_heavy_read_streak = 0;
            }

            // Post-échec Explore — parent lit encore → filet rescue.
            if task_tool_available
                && explore_rescue_active
                && !explore_rescue_nudge_sent
                && parent_heavy_read_streak >= 1
            {
                debug!("explore rescue — parent heavy read after truncated task");
                messages.push(Message::system(EXPLORE_RESCUE_PARENT_READ_NUDGE));
                explore_rescue_nudge_sent = true;
                parent_heavy_read_streak = 0;
            }

            // Explore truncated — re-split chiffré (one-shot par événement).
            if task_tool_available {
                if let Some((used, max_it)) = pending_explore_incomplete.take() {
                    debug!(
                        iterations_used = used,
                        max_iterations = max_it,
                        "explore incomplete nudge"
                    );
                    messages.push(Message::system(explore_incomplete_nudge(
                        used,
                        max_it,
                        last_context_load_recommended_n,
                    )));
                }
            }

            // Context-load V1 — soft N Explore après glob (L2 caps, one-shot).
            if task_tool_available
                && self.config.context_load.inject
                && !context_load_nudge_sent
            {
                if let Some(snap) = pending_context_load.take() {
                    let scored = score_context_load(&snap, &self.config.context_load);
                    if should_inject_context_load(&snap, &scored) {
                        debug!(
                            load = scored.load,
                            n = scored.recommended_n,
                            files = scored.files_effective,
                            "context-load soft nudge"
                        );
                        last_context_load_recommended_n = scored.recommended_n.max(2);
                        messages.push(Message::system(context_load_nudge(
                            scored.files_effective,
                            scored.total_kb,
                            scored.load,
                            scored.recommended_n,
                        )));
                        context_load_nudge_sent = true;
                        // Reset OK : one-shot guidance — contenu nouveau.
                        loop_detector.reset();
                    }
                }
            }

            // Soft — Explore réussi → fusionner / agir (one-shot par succès).
            if pending_post_merge_closure_nudge && !plan_nudges {
                pending_post_merge_closure_nudge = false;
            }
            if pending_post_merge_closure_nudge {
                debug!(
                    marker = "c2.post_merge_closure",
                    "dogfood: post-merge Explore — soft closure nudge"
                );
                messages.push(Message::system(POST_MERGE_CLOSURE_NUDGE));
                pending_post_merge_closure_nudge = false;
                if !micro_act_write_nudge_sent {
                    pending_micro_act_write_nudge = true;
                }
            }

            // Soft C4 — micro acting write juste après post-merge (V6-a).
            if pending_micro_act_write_nudge && !micro_act_write_nudge_sent {
                debug!(
                    marker = "c4.micro_act_write",
                    "dogfood: micro act-write prefer after Explore merge"
                );
                messages.push(Message::system(MICRO_ACT_WRITE_NUDGE));
                pending_micro_act_write_nudge = false;
                micro_act_write_nudge_sent = true;
            }

            // Soft C2 / E1 — parent re-lit un path déjà couvert Explore.
            if pending_explore_covered_reread_nudge
                && plan_nudges
                && !explore_covered_reread_nudge_sent
            {
                debug!(
                    marker = "c2.explore_covered_reread_prefer",
                    covered_n = explore_covered_paths.len(),
                    "dogfood: Explore-covered path re-read — soft prefer"
                );
                messages.push(Message::system(EXPLORE_COVERED_REREAD_NUDGE));
                pending_explore_covered_reread_nudge = false;
                explore_covered_reread_nudge_sent = true;
            }

            // Soft E2 / E2b — post-Explore OK + lectures / hit kind → Prefer act.
            if pending_post_explore_stall_nudge && plan_nudges && !post_explore_stall_nudge_sent {
                debug!(
                    marker = "e2.post_explore_stall_act",
                    streak = post_explore_read_streak,
                    "dogfood: post-Explore read stall — soft act prefer"
                );
                messages.push(Message::system(POST_EXPLORE_STALL_ACT_NUDGE));
                pending_post_explore_stall_nudge = false;
                post_explore_stall_nudge_sent = true;
            }

            // Soft A — explore_artifact_read failed → don’t file_read kind blobs.
            if pending_explore_artifact_read_fail_nudge {
                debug!(
                    marker = "a.explore_artifact_read_fail",
                    "dogfood: explore_artifact_read error — soft recovery prefer"
                );
                messages.push(Message::system(EXPLORE_ARTIFACT_READ_FAIL_NUDGE));
                pending_explore_artifact_read_fail_nudge = false;
            }

            // Soft D4 — user a répondu → skeleton / mutate (pas re-inventaire).
            if pending_post_ask_acting_nudge {
                debug!(
                    marker = "d4.post_ask_acting",
                    "dogfood: post-ask_user — soft skeleton/mutate prefer"
                );
                messages.push(Message::system(POST_ASK_ACTING_NUDGE));
                pending_post_ask_acting_nudge = false;
            }

            // Soft R1 — rotation multi-path `file_read` (ré-inject tous les N).
            if rotating_file_read_should_nudge(&recent_file_reads) {
                let len = recent_file_reads.len();
                let due = !rotating_file_read_nudge_sent
                    || len
                        >= rotating_last_nudge_at
                            .saturating_add(ROTATING_FILE_READ_REINJECT_EVERY);
                if due {
                    debug!(
                        marker = "c1.rotating_file_read",
                        window = len,
                        reinject = rotating_file_read_nudge_sent,
                        "dogfood: rotating file_read — soft nudge"
                    );
                    messages.push(Message::system(ROTATING_FILE_READ_NUDGE));
                    rotating_file_read_nudge_sent = true;
                    rotating_last_nudge_at = len;
                }
            }

            // P1 — même path `file_read` réussi ×N.
            if !repeated_file_read_nudge_sent
                && file_read_success_counts
                    .values()
                    .any(|&n| n >= REPEATED_FILE_READ_NUDGE_THRESHOLD)
            {
                debug!("repeated file_read path — re-read nudge (P1)");
                messages.push(Message::system(REPEATED_FILE_READ_NUDGE));
                repeated_file_read_nudge_sent = true;
            }

            if let Some(policy) = self.config.context.as_ref() {
                let parent_tokens = policy.count_tokens(&messages);
                if parent_tokens > 0
                    && tx
                        .send(Ok(AgentEvent::ContextUsage { parent_tokens }))
                        .await
                        .is_err()
                {
                    return;
                }
            }

            let turn_tools = if loop_tools_disabled {
                Vec::new()
            } else {
                tool_specs.clone()
            };
            let options = self.config.chat_options.clone().with_tools(turn_tools);

            let stream = match self.llm.stream_chat(messages.clone(), options).await {
                Ok(s) => s,
                Err(err) => {
                    let _ = tx.send(Err(err.into())).await;
                    return;
                }
            };

            let native_thinking_ui = self.config.chat_options.think == Some(true);

            let Ok(mut outcome) =
                consume_stream(stream, &tx, native_thinking_ui, &ctx.workspace_root, done_only_nudge_sent).await
            else {
                return; // canal consommateur fermé
            };

            if !professor
                && outcome.tool_calls.is_empty()
                && !loop_tools_disabled
            {
                if let Some(salvaged) = salvage_inline_todo_write(&outcome.text) {
                    debug!(
                        leftover = salvaged.cleaned_text.len(),
                        "salvage inline todo_write JSON from assistant text"
                    );
                    outcome.text = salvaged.cleaned_text;
                    let call = PendingToolCall {
                        id: ToolUseId::new(),
                        name: "todo_write".into(),
                        arguments: salvaged.arguments,
                    };
                    if tx
                        .send(Ok(AgentEvent::ToolStart {
                            id: call.id.clone(),
                            name: call.name.clone(),
                            arguments: call.arguments.clone(),
                        }))
                        .await
                        .is_err()
                    {
                        return;
                    }
                    outcome.tool_calls.push(call);
                    outcome.reason = StopReason::ToolUse;
                }
            }

            if (outcome.usage.input_tokens > 0 || outcome.usage.output_tokens > 0)
                && tx
                    .send(Ok(AgentEvent::TurnUsage {
                        usage: outcome.usage.clone(),
                    }))
                    .await
                    .is_err()
            {
                return;
            }

            push_assistant_message(&mut messages, &outcome);
            if let Err(e) = self
                .flush_transcript(&messages, &mut transcript_cursor)
                .await
            {
                let _ = tx.send(Err(e)).await;
                return;
            }

            // Track : answering vu au moins une fois dans le run ?
            if outcome.saw_answering {
                seen_answering_in_run = true;
            }
            if outcome.saw_analyzing {
                saw_analyzing_phase_in_run = true;
            }
            if outcome.saw_testing {
                saw_testing_phase_in_run = true;
            }

            // O1 — DONE_ONLY déjà parti. Le texte de ce tour n'a pas été affiché.
            // `[phase: done]` retombe sur la clôture normale plus bas. Sinon on
            // s'arrête : la première conclusion reste la seule visible.
            if done_only_nudge_sent
                && outcome.tool_calls.is_empty()
                && outcome.final_phase != Some(Phase::Done)
            {
                debug!("DONE_ONLY ignoré — la première réponse reste, Stop");
                self.maybe_persist_session(&messages, &memory_tracker, &tx)
                    .await;
                let _ = tx
                    .send(Ok(AgentEvent::Stop {
                        reason: outcome.reason,
                        usage: Usage::default(),
                    }))
                    .await;
                return;
            }

            // Explore child (phase 1) — E2 : answering ou done sans tool = Stop.
            // La phase rapport moteur écrit le compte-rendu ; pas de DONE_ONLY /
            // answering-before-done (évite text_only ×3 après nudges de clôture).
            if self.config.explore_execution
                && outcome.tool_calls.is_empty()
                && matches!(
                    outcome.final_phase,
                    Some(Phase::Answering | Phase::Done)
                )
            {
                debug!(
                    phase = ?outcome.final_phase,
                    "explore execution — stop (report phase follows)"
                );
                self.maybe_persist_session(&messages, &memory_tracker, &tx)
                    .await;
                let _ = tx
                    .send(Ok(AgentEvent::Stop {
                        reason: outcome.reason,
                        usage: Usage::default(),
                    }))
                    .await;
                return;
            }

            // Profils locaux (CADRAGE 1.6.1 §3bis) : le moteur porte la clôture.
            // Tour sans tool_call = réponse finale ; `[phase: done]` non requis.
            // `[phase: acting]` sans tool reste traité par FX-B (intention d'écriture),
            // sauf au tour final forcé.
            if engine_closure
                && outcome.tool_calls.is_empty()
                && (final_answer_forced || outcome.final_phase != Some(Phase::Acting))
            {
                let reply = outcome.text.trim();
                if reply.is_empty()
                    && local_soft_close_check_sent
                    && !final_answer_forced
                {
                    debug!("local-27b — empty turn after soft close, previous reply stands");
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    self.maybe_persist_session(&messages, &memory_tracker, &tx)
                        .await;
                    let _ = tx
                        .send(Ok(AgentEvent::Stop {
                            reason: outcome.reason,
                            usage: Usage::default(),
                        }))
                        .await;
                    return;
                }
                if reply.is_empty() && !final_answer_forced && !local_empty_turn_nudge_sent {
                    debug!("local profile — empty turn, one-shot nudge");
                    local_empty_turn_nudge_sent = true;
                    messages.push(Message::system(LOCAL_EMPTY_TURN_NUDGE));
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                let open_todos = last_todo_pending > 0 || last_todo_in_progress > 0;
                let testing_due =
                    testing_gate_active && saw_code_mutation_in_run && !saw_testing_phase_in_run;
                if profile == EngineProfile::Local27b
                    && !reply.is_empty()
                    && !final_answer_forced
                    && !local_soft_close_check_sent
                    && (open_todos || testing_due)
                {
                    debug!(open_todos, testing_due, "local-27b — soft close check (one-shot)");
                    local_soft_close_check_sent = true;
                    messages.push(Message::system(LOCAL_SOFT_CLOSE_CHECK_NUDGE));
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                debug!(
                    final_answer_forced,
                    reply_chars = reply.len(),
                    saw_answering = outcome.saw_answering,
                    "local profile — engine closure (turn without tools)"
                );
                if reply.is_empty() {
                    emit_engine_closure(&tx, &mut messages, ENGINE_CLOSURE_EMPTY_REPLY, true, true)
                        .await;
                } else if outcome.final_phase != Some(Phase::Done) || !outcome.saw_answering {
                    let surface_reply = !outcome.saw_answering && !outcome.reply_already_visible;
                    emit_engine_closure(&tx, &mut messages, reply, surface_reply, false).await;
                }
                if let Err(e) = self
                    .flush_transcript(&messages, &mut transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return;
                }
                self.maybe_persist_session(&messages, &memory_tracker, &tx)
                    .await;
                let _ = tx
                    .send(Ok(AgentEvent::Stop {
                        reason: outcome.reason,
                        usage: Usage::default(),
                    }))
                    .await;
                return;
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
            if outcome.final_phase == Some(Phase::Done) {
                if !seen_answering_in_run {
                    debug!("[phase: done] prématuré (answering absent) — nudge");
                    messages.push(Message::system(MISSING_ANSWERING_PROMPT));
                    // Reset OK : on force answering (contrat de phase différent).
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
                if professor && !saw_successful_course_plan_write_in_run {
                    debug!("[phase: done] professor sans course_plan_write — nudge");
                    messages.push(Message::system(PROFESSOR_DONE_WITHOUT_PLAN));
                    // Reset OK : gate professor — comportement attendu différent.
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
                    if last_course_pending > 0 || last_course_active > 0 {
                        debug!(
                            last_course_pending,
                            last_course_active,
                            "[phase: done] avec plan de cours ouvert — nudge"
                        );
                        messages.push(Message::system(unfinished_course_plan_prompt(
                            last_course_pending,
                            last_course_active,
                        )));
                        // Reset OK : plan cours ouvert — le modèle doit muter le plan.
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
                } else if last_todo_pending > 0 || last_todo_in_progress > 0 {
                    debug!(
                        last_todo_pending,
                        last_todo_in_progress,
                        "[phase: done] avec to-do ouverte — nudge"
                    );
                    messages.push(Message::system(unfinished_todos_prompt(
                        last_todo_pending,
                        last_todo_in_progress,
                    )));
                    // Do NOT reset LoopDetector — repeated identical done attempts must abort.
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
                {
                    debug!(
                        "[phase: done] mutation code sans phase testing — nudge"
                    );
                    messages.push(Message::system(CODE_MUTATION_TESTING_NUDGE));
                    // Do NOT reset LoopDetector — otherwise verify/done nudges loop forever.
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                if self.config.run_objective.is_some() && !run_objective_reminder_sent {
                    if let Some(obj) = &self.config.run_objective {
                        debug!("[phase: done] rappel objectif verrouillé (soft)");
                        messages.push(Message::system(run_objective_done_nudge(obj)));
                        run_objective_reminder_sent = true;
                        // Reset OK : soft reminder one-shot (contenu nouveau).
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
                debug!("[phase: done] après answering + todo_write clôturé — clôture propre");
                self.maybe_persist_session(&messages, &memory_tracker, &tx).await;
                let _ = tx
                    .send(Ok(AgentEvent::Stop {
                        reason: outcome.reason,
                        // `TurnUsage` déjà émis après `consume_stream` pour ce tour.
                        usage: Usage::default(),
                    }))
                    .await;
                return;
            }

            // FX-B — mécanique : `[phase: acting]` sans tool_calls (pas de needles prose).
            // **Avant** le LoopDetector : sinon un 2e tour identique court-circuite les nudges.
            if outcome.tool_calls.is_empty() {
                let write_intent = outcome.final_phase == Some(Phase::Acting)
                    || consecutive_intent_only_write_nudges > 0;
                if write_intent {
                    consecutive_intent_only_write_nudges =
                        consecutive_intent_only_write_nudges.saturating_add(1);
                    let max_nudges = INTENT_ONLY_WRITE_MAX_NUDGES;
                    if consecutive_intent_only_write_nudges > max_nudges && engine_closure {
                        debug!(
                            strikes = consecutive_intent_only_write_nudges,
                            "intent-only write — local profile: final answer turn"
                        );
                        messages.push(Message::system(LOCAL_FINAL_ANSWER_PROMPT));
                        final_answer_forced = true;
                        loop_tools_disabled = true;
                        if let Err(e) = self
                            .flush_transcript(&messages, &mut transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return;
                        }
                        continue;
                    }
                    if consecutive_intent_only_write_nudges > max_nudges {
                        debug!(
                            strikes = consecutive_intent_only_write_nudges,
                            "intent-only write — soft-abort après nudges"
                        );
                        let _ = tx
                            .send(Err(EngineError::LoopDetected {
                                kind: "intent_only_write",
                                turns: consecutive_intent_only_write_nudges,
                            }))
                            .await;
                        return;
                    }
                    let nudge = if consecutive_intent_only_write_nudges >= 2 {
                        INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT
                    } else {
                        INTENT_ONLY_WRITE_NUDGE_PROMPT
                    };
                    debug!(
                        strike = consecutive_intent_only_write_nudges,
                        "acting sans tool_call — nudge intent-only write"
                    );
                    messages.push(Message::system(nudge));
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

            // Sprint Hotfix « boucle » — détection d'empreinte répétée.
            // Évalué **après** les gates `[phase: done]` (D1–D7) : un modèle
            // qui répète `[phase: done]` alors que la to-do est encore ouverte
            // doit recevoir `unfinished_todos_prompt` à chaque tour, pas
            // `LOOP_DETECTED_NUDGE` au 2e tour identique (cf. 1.5.14 L1).
            // Escalade 2026-10-15 : Warn → ForceConclude (tools off) → SyntheticDone.
            match loop_detector.observe(&outcome) {
                LoopDecision::Ok => {}
                LoopDecision::Warn { kind } => {
                    debug!(kind, "boucle — Warn (nudge soft)");
                    let nudge = if kind == "tool_family" {
                        LOOP_TOOL_FAMILY_NUDGE_PROMPT
                    } else {
                        LOOP_DETECTED_NUDGE_PROMPT
                    };
                    messages.push(Message::system(nudge));
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                LoopDecision::ForceConclude { kind } => {
                    debug!(kind, "boucle — ForceConclude (tools off)");
                    messages.push(Message::system(LOOP_FORCE_CONCLUDE_PROMPT));
                    loop_tools_disabled = true;
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                LoopDecision::SyntheticDone { kind, turns } => {
                    debug!(kind, turns, "boucle — SyntheticDone (Stop propre)");
                    emit_synthetic_done(&tx, &mut messages, kind, turns).await;
                    self.maybe_persist_session(&messages, &memory_tracker, &tx)
                        .await;
                    let _ = tx
                        .send(Ok(AgentEvent::Stop {
                            reason: outcome.reason,
                            usage: Usage::default(),
                        }))
                        .await;
                    return;
                }
            }

            // Si le modèle n'a pas signé `done` et n'a pas non plus appelé
            // d'outil ce tour, on l'invite explicitement à choisir : conclure
            // (`answering` + `done`) ou continuer (`reading` / `acting` + tool).
            // Aucun compteur séparé : `max_iterations` borne tout.
            if outcome.tool_calls.is_empty() {
                // Cas typique GLM-4.7-Flash : le modèle a déjà émis sa
                // réponse en `answering` mais a omis le `[phase: done]`
                // final. Si la gate testing est encore due, on envoie CE
                // message (pas « ONLY done » — ce serait un mensonge).
                let todos_closed = last_todo_pending == 0 && last_todo_in_progress == 0;
                let testing_still_due = testing_gate_active
                    && saw_code_mutation_in_run
                    && !saw_testing_phase_in_run;
                if outcome.final_phase == Some(Phase::Answering)
                    && seen_answering_in_run
                    && todos_closed
                {
                    if testing_still_due {
                        debug!(
                            "answering sans done + todo clôturée + testing dû — nudge testing (pas DONE_ONLY)"
                        );
                        consecutive_intent_only_write_nudges = 0;
                        messages.push(Message::system(CODE_MUTATION_TESTING_NUDGE));
                        if let Err(e) = self
                            .flush_transcript(&messages, &mut transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return;
                        }
                        continue;
                    }
                    debug!("answering sans done + todo clôturée + testing OK — nudge minimal (done seul)");
                    consecutive_intent_only_write_nudges = 0;
                    done_only_nudge_sent = true;
                    messages.push(Message::system(DONE_ONLY_NUDGE_PROMPT));
                    // 1.6.0 L-1 : ne PAS reset — même answering sans done doit
                    // pouvoir strike / text_only-abort (sinon ×12 jusqu'à max_iter).
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }

                consecutive_intent_only_write_nudges = 0;
                debug!("tour sans tool_call et sans [phase: done] — nudge");
                messages.push(Message::system(NUDGE_PROMPT));
                // 1.6.0 L-1 : ne PAS reset sur nudge générique.
                if let Err(e) = self
                    .flush_transcript(&messages, &mut transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return;
                }
                continue;
            }

            consecutive_intent_only_write_nudges = 0;
            // GLM-4.7-Flash bat parfois `[file_edit, todo_write]` ou
            // `[bash, todo_write]` dans le même tour. Sans réordonnement, le
            // mutateur rate la gate `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED`,
            // alors que le modèle voulait bien planifier ET muter d'une
            // traite. On respecte l'intention en forçant l'ordre logique
            // d'exécution : `todo_write` d'abord, le reste ensuite. Le
            // mapping `tool_use_id ↔ tool_result` reste correct (l'API
            // ré-aligne via les ids, pas l'index de liste).
            //
            // Note : depuis la relax de la gate aux read-only (un `glob` ou
            // `file_read` initial passe librement), ce réordonnement est
            // surtout utile pour les batchs contenant des mutations. Mais
            // il reste pertinent dans le cas général « le modèle a tout
            // planifié dans une seule volée ».
            //
            // Ne s'applique qu'au tout premier `todo_write` du run : une
            // fois la gate satisfaite, les batchs ultérieurs respectent
            // l'ordre demandé par le modèle (parfois utile pour mettre à
            // jour la to-do AVANT et le code APRÈS).
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
                            "plan tool promu en tête (batch détecté avant gate satisfaite)"
                        );
                    }
                }
            }

            let tool_names: Vec<&str> = outcome
                .tool_calls
                .iter()
                .map(|c| c.name.as_str())
                .collect();
            let batches = partition_tool_calls(&tool_names, &self.registry);
            let mut round_tool_outputs = String::new();

            for batch in batches {
                match batch {
                    ToolCallBatch::Parallel(indices) => {
                        let max_parallel = self.config.max_parallel_tool_calls.max(1);
                        let mut to_execute: Vec<usize> = Vec::new();
                        let mut by_idx: std::collections::BTreeMap<
                            usize,
                            Result<Value, drox_tools::ToolError>,
                        > = std::collections::BTreeMap::new();
                        for idx in &indices {
                            let call = &outcome.tool_calls[*idx];
                            if let Some(msg) = self
                                .run_tool_pre_gates(
                                    call,
                                    professor,
                                    &professor_course_state,
                                    saw_successful_todo_write_in_run,
                                    &last_todo_ids,
                                    last_todo_was_all_completed,
                                )
                                .await
                            {
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
                            // R4 — même path déjà lu ×N → stub (pas de re-IO).
                            if let Some((path, n)) = should_stub_repeated_file_read(
                                &file_read_success_counts,
                                &call.name,
                                &call.arguments,
                            ) {
                                debug!(
                                    marker = "r4.repeated_file_read_stub",
                                    path = %path,
                                    prior_reads = n,
                                    "dogfood: stub repeated file_read"
                                );
                                by_idx.insert(
                                    *idx,
                                    Ok(repeated_file_read_stub_value(&path, n)),
                                );
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
                                    let ctx_exec = ctx_parallel.clone().with_tool_progress(
                                        ToolProgressBridge::new(
                                            tx.clone(),
                                            call.id.clone(),
                                            call.name.clone(),
                                        ),
                                    );
                                    async move {
                                        let result = registry
                                            .execute_named(
                                                &call.name,
                                                &ctx_exec,
                                                call.arguments.clone(),
                                            )
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
                                    if call.name == "glob" && !context_load_nudge_sent {
                                        if let Some(snap) = snapshot_from_glob_value(
                                            &value,
                                            ctx.workspace_root.as_str(),
                                        ) {
                                            pending_context_load = Some(snap);
                                        }
                                    }
                                    let task_telem = if call.name == "task" {
                                        let telem = task_outcome_telemetry(&value);
                                        let empty_fail = explore_deliverable_empty(&value);
                                        // C2 / D3 : paths_read même si truncated (merge ;
                                        // ne jamais clear — conserve couverture précédente).
                                        if telem.0 {
                                            explore_covered_paths.merge_from_task_outcome(
                                                &value,
                                                ctx.workspace_root.as_std_path(),
                                            );
                                        } else {
                                            explore_covered_paths.ingest_from_task_outcome(
                                                &value,
                                                ctx.workspace_root.as_std_path(),
                                            );
                                        }
                                        explore_covered_reread_nudge_sent = false;
                                        pending_explore_covered_reread_nudge = false;
                                        Some((telem, empty_fail))
                                    } else {
                                        None
                                    };
                                    if !self
                                        .apply_read_only_tool_success(
                                            &ctx,
                                            call,
                                            value,
                                            &mut memory_tracker,
                                            &tx,
                                            &mut messages,
                                            &mut round_tool_outputs,
                                        )
                                        .await
                                    {
                                        return;
                                    }
                                    if let Some(((truncated, used, max_it), empty_fail)) = task_telem
                                    {
                                        note_task_tool_success(
                                            truncated,
                                            used,
                                            max_it,
                                            &mut parent_heavy_read_streak,
                                            &mut pending_explore_incomplete,
                                            &mut explore_rescue_active,
                                            &mut explore_rescue_nudge_sent,
                                        );
                                        // D2 : Explore vide (`partial`) ≠ step-complete.
                                        if last_in_progress_todo_id.is_some() && !empty_fail {
                                            step_had_task_success = true;
                                            step_parent_activity_count = 0;
                                        }
                                        if !truncated {
                                            pending_post_merge_closure_nudge = true;
                                            micro_act_write_nudge_sent = false;
                                            // E2 — ouvrir fenêtre stall-act.
                                            post_explore_window = true;
                                            post_explore_read_streak = 0;
                                            pending_post_explore_stall_nudge = false;
                                            post_explore_stall_nudge_sent = false;
                                        } else {
                                            post_explore_window = false;
                                            post_explore_read_streak = 0;
                                            pending_post_explore_stall_nudge = false;
                                        }
                                        clear_rotating_file_read_window(&mut recent_file_reads);
                                        rotating_file_read_nudge_sent = false;
                                        rotating_last_nudge_at = 0;
                                    } else if counts_as_parent_heavy_read(
                                        &call.name,
                                        &call.arguments,
                                    ) {
                                        parent_heavy_read_streak =
                                            parent_heavy_read_streak.saturating_add(1);
                                        // E2 — compter lectures dans la fenêtre post-Explore.
                                        if post_explore_window {
                                            post_explore_read_streak =
                                                post_explore_read_streak.saturating_add(1);
                                            if post_explore_read_streak
                                                >= POST_EXPLORE_STALL_READ_THRESHOLD
                                                && !post_explore_stall_nudge_sent
                                            {
                                                pending_post_explore_stall_nudge = true;
                                            }
                                        }
                                    }
                                    if !saw_successful_todo_write_in_run
                                        && counts_as_pre_plan_activity(&call.name)
                                    {
                                        pre_plan_activity_count =
                                            pre_plan_activity_count.saturating_add(1);
                                    }
                                    if last_in_progress_todo_id.is_some()
                                        && !step_had_task_success
                                        && counts_as_pre_plan_activity(&call.name)
                                    {
                                        step_parent_activity_count =
                                            step_parent_activity_count.saturating_add(1);
                                    }
                                    let _ = note_successful_file_read(
                                        &mut file_read_success_counts,
                                        &call.name,
                                        &call.arguments,
                                    );
                                    let _ = note_rotating_file_read(
                                        &mut recent_file_reads,
                                        &call.name,
                                        &call.arguments,
                                    );
                                    if let Some(hit) = explore_covered_paths
                                        .hit_by_file_read(&call.name, &call.arguments)
                                    {
                                        let is_kind = hit.is_kind();
                                        debug!(
                                            marker = "c2.explore_covered_hit",
                                            path = %hit.path(),
                                            is_kind,
                                            "dogfood: parent file_read hits Explore-covered path"
                                        );
                                        if !explore_covered_reread_nudge_sent {
                                            pending_explore_covered_reread_nudge = true;
                                        }
                                        // E2b — hit kind → Prefer act immédiatement.
                                        if is_kind && !post_explore_stall_nudge_sent {
                                            pending_post_explore_stall_nudge = true;
                                            post_explore_read_streak = post_explore_read_streak
                                                .max(POST_EXPLORE_STALL_READ_THRESHOLD);
                                        }
                                    }
                                }
                                Err(err) => {
                                    if matches!(&err, ToolError::InvalidArgs(_)) {
                                        // Reset OK : feedback args nouveau ≠ boucle.
                                        loop_detector.reset();
                                    }
                                    if call.name == "explore_artifact_read" {
                                        pending_explore_artifact_read_fail_nudge = true;
                                    }
                                    let err_s = err.to_string();
                                    last_tool_error = Some(
                                        err_s.chars().take(200).collect::<String>(),
                                    );
                                    if push_tool_error_tracked(
                                        &tx,
                                        &mut messages,
                                        call,
                                        err_s,
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
                            if let Some(msg) = self
                                .run_tool_pre_gates(
                                    call,
                                    professor,
                                    &professor_course_state,
                                    saw_successful_todo_write_in_run,
                                    &last_todo_ids,
                                    last_todo_was_all_completed,
                                )
                                .await
                            {
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
                                if !hooks.pre_tool_use.is_empty() {
                                    let _ = tx
                                        .send(Ok(AgentEvent::HookProgress {
                                            tool_use_id: call.id.clone(),
                                            hook_event: "PreToolUse".into(),
                                            in_progress: 1,
                                        }))
                                        .await;
                                }
                                let pre_outcome = hooks
                                    .run_pre(hook_ctx, &ctx.workspace_root)
                                    .await;
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

                            // R4 — même path déjà lu ×N → stub (pas de re-IO).
                            let exec = if let Some((path, n)) = should_stub_repeated_file_read(
                                &file_read_success_counts,
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
                                let ctx_exec =
                                    ctx.clone().with_tool_progress(ToolProgressBridge::new(
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
                                    if call.name == "glob" && !context_load_nudge_sent {
                                        if let Some(snap) = snapshot_from_glob_value(
                                            &value,
                                            ctx.workspace_root.as_str(),
                                        ) {
                                            pending_context_load = Some(snap);
                                        }
                                    }
                                    memory_tracker.record_tool(&call.name);
                                    let todo_prev_had_open_items = if call.name == "todo_write" {
                                        last_todo_pending > 0 || last_todo_in_progress > 0
                                    } else {
                                        false
                                    };
                                    if call.name == "todo_write" {
                                        saw_successful_todo_write_in_run = true;
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
                                        last_todo_next = next_todo_from_output(&value);
                                        last_todo_completed_hint = completed_todos_hint(&value);
                                        mutating_tools_since_last_todo = 0;
                                        clear_rotating_file_read_window(&mut recent_file_reads);
                                        rotating_file_read_nudge_sent = false;
                                        rotating_last_nudge_at = 0;
                                        if let Some(step_id) = first_in_progress_todo_id(&value) {
                                            if last_in_progress_todo_id.as_ref() != Some(&step_id)
                                            {
                                                pending_step_explore_nudge =
                                                    Some((step_id.clone(), last_todo_next.clone()));
                                                last_in_progress_todo_id = Some(step_id);
                                                step_parent_activity_count = 0;
                                                step_had_task_success = false;
                                                step_without_explore_nudge_sent = false;
                                            }
                                        } else {
                                            last_in_progress_todo_id = None;
                                            step_parent_activity_count = 0;
                                            step_had_task_success = false;
                                            step_without_explore_nudge_sent = false;
                                        }
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
                                    } else if counts_as_mutating_for_step_tracking(
                                        &call.name,
                                        &call.arguments,
                                        &ctx.workspace_root,
                                    ) {
                                        mutating_tools_since_last_todo =
                                            mutating_tools_since_last_todo.saturating_add(1);
                                    }
                                    if record_counts_as_code_mutation(
                                        &call.name,
                                        &call.arguments,
                                    ) {
                                        saw_code_mutation_in_run = true;
                                        clear_rotating_file_read_window(&mut recent_file_reads);
                                        rotating_file_read_nudge_sent = false;
                                        rotating_last_nudge_at = 0;
                                        // E2 — mutation = fin de la fenêtre stall-act.
                                        post_explore_window = false;
                                        post_explore_read_streak = 0;
                                        pending_post_explore_stall_nudge = false;
                                    }
                                    if let Some(path) =
                                        path_from_file_tool(&call.name, &call.arguments)
                                    {
                                        if !files_touched_in_run.iter().any(|p| p == &path) {
                                            files_touched_in_run.push(path);
                                        }
                                        last_tool_error = None;
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
                                        last_tool_error = None;
                                    }
                                    if call.name == "task" {
                                        let (truncated, used, max_it) =
                                            task_outcome_telemetry(&value);
                                        let empty_fail = explore_deliverable_empty(&value);
                                        note_task_tool_success(
                                            truncated,
                                            used,
                                            max_it,
                                            &mut parent_heavy_read_streak,
                                            &mut pending_explore_incomplete,
                                            &mut explore_rescue_active,
                                            &mut explore_rescue_nudge_sent,
                                        );
                                        // D2 : Explore vide (`partial`) ≠ step-complete.
                                        if last_in_progress_todo_id.is_some() && !empty_fail {
                                            step_had_task_success = true;
                                            step_parent_activity_count = 0;
                                        }
                                        // C2 / D3 : armer / fusionner même si truncated.
                                        if truncated {
                                            explore_covered_paths.merge_from_task_outcome(
                                                &value,
                                                ctx.workspace_root.as_std_path(),
                                            );
                                            post_explore_window = false;
                                            post_explore_read_streak = 0;
                                            pending_post_explore_stall_nudge = false;
                                        } else {
                                            pending_post_merge_closure_nudge = true;
                                            micro_act_write_nudge_sent = false;
                                            explore_covered_paths.ingest_from_task_outcome(
                                                &value,
                                                ctx.workspace_root.as_std_path(),
                                            );
                                            // E2 — ouvrir fenêtre stall-act.
                                            post_explore_window = true;
                                            post_explore_read_streak = 0;
                                            pending_post_explore_stall_nudge = false;
                                            post_explore_stall_nudge_sent = false;
                                        }
                                        explore_covered_reread_nudge_sent = false;
                                        pending_explore_covered_reread_nudge = false;
                                        clear_rotating_file_read_window(&mut recent_file_reads);
                                        rotating_file_read_nudge_sent = false;
                                        rotating_last_nudge_at = 0;
                                    } else if counts_as_parent_heavy_read(
                                        &call.name,
                                        &call.arguments,
                                    ) {
                                        parent_heavy_read_streak =
                                            parent_heavy_read_streak.saturating_add(1);
                                        // E2 — compter lectures dans la fenêtre post-Explore.
                                        if post_explore_window {
                                            post_explore_read_streak =
                                                post_explore_read_streak.saturating_add(1);
                                            if post_explore_read_streak
                                                >= POST_EXPLORE_STALL_READ_THRESHOLD
                                                && !post_explore_stall_nudge_sent
                                            {
                                                pending_post_explore_stall_nudge = true;
                                            }
                                        }
                                    }
                                    if !saw_successful_todo_write_in_run
                                        && counts_as_pre_plan_activity(&call.name)
                                    {
                                        pre_plan_activity_count =
                                            pre_plan_activity_count.saturating_add(1);
                                    }
                                    if last_in_progress_todo_id.is_some()
                                        && !step_had_task_success
                                        && counts_as_pre_plan_activity(&call.name)
                                    {
                                        step_parent_activity_count =
                                            step_parent_activity_count.saturating_add(1);
                                    }
                                    let _ = note_successful_file_read(
                                        &mut file_read_success_counts,
                                        &call.name,
                                        &call.arguments,
                                    );
                                    let _ = note_rotating_file_read(
                                        &mut recent_file_reads,
                                        &call.name,
                                        &call.arguments,
                                    );
                                    if let Some(hit) = explore_covered_paths
                                        .hit_by_file_read(&call.name, &call.arguments)
                                    {
                                        let is_kind = hit.is_kind();
                                        debug!(
                                            marker = "c2.explore_covered_hit",
                                            path = %hit.path(),
                                            is_kind,
                                            "dogfood: parent file_read hits Explore-covered path"
                                        );
                                        if !explore_covered_reread_nudge_sent {
                                            pending_explore_covered_reread_nudge = true;
                                        }
                                        // E2b — hit kind → Prefer act immédiatement.
                                        if is_kind && !post_explore_stall_nudge_sent {
                                            pending_post_explore_stall_nudge = true;
                                            post_explore_read_streak = post_explore_read_streak
                                                .max(POST_EXPLORE_STALL_READ_THRESHOLD);
                                        }
                                    }
                                    if call.name == "ask_user_question" {
                                        consecutive_ask_user_question_failures = 0;
                                        // D4 : transition soft acting au tour suivant.
                                        pending_post_ask_acting_nudge = true;
                                    }
                                    let mut hook_appendix: Option<String> = None;
                                    if let Some(hooks) = self
                                        .config
                                        .tool_hooks
                                        .as_ref()
                                        .filter(|h| h.is_enabled())
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
                                                &ctx.workspace_root,
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
                                        &ctx.workspace_root,
                                        profile,
                                    );
                                    if let Some(app) = hook_appendix {
                                        for_llm.push_str("\n\n");
                                        for_llm.push_str(&app);
                                    }
                                    if !round_tool_outputs.is_empty() {
                                        round_tool_outputs.push('\n');
                                    }
                                    round_tool_outputs.push_str(&for_llm);
                                    mirror_workspace_map_from_tool(&ctx, &call.name, &value)
                                        .await;
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
                                            output: value,
                                            is_error: false,
                                        }))
                                        .await
                                        .is_err()
                                    {
                                        return;
                                    }
                                    messages.push(Message::tool_result(call.id.clone(), for_llm, false));
                                    if call.name == "todo_write"
                                        && todo_prev_had_open_items
                                        && last_todo_pending == 0
                                        && last_todo_in_progress == 0
                                        && memory_tracker.is_non_trivial()
                                    {
                                        self.maybe_persist_session(
                                            &messages,
                                            &memory_tracker,
                                            &tx,
                                        )
                                        .await;
                                    }
                                }
                                Err(err) => {
                                    let is_invalid = matches!(&err, ToolError::InvalidArgs(_));
                                    let msg = err.to_string();
                                    last_tool_error =
                                        Some(msg.chars().take(200).collect::<String>());
                                    // Format / args invalides : le modèle vient
                                    // de recevoir un feedback nouveau — ne pas
                                    // enchaîner tout de suite vers Abort loop.
                                    if is_invalid {
                                        // Reset OK : feedback args nouveau ≠ boucle.
                                        loop_detector.reset();
                                    }
                                    if call.name == "explore_artifact_read" {
                                        pending_explore_artifact_read_fail_nudge = true;
                                    }
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

            // 1.6.0 L-tools — même (tool, args) + même output → escalade clôture.
            match loop_detector.observe_tool_outputs(&outcome.tool_calls, &round_tool_outputs) {
                LoopDecision::Ok => {}
                LoopDecision::Warn { kind } => {
                    debug!(kind, "boucle tools — Warn");
                    messages.push(Message::system(LOOP_DETECTED_NUDGE_PROMPT));
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                LoopDecision::ForceConclude { kind } => {
                    debug!(kind, "boucle tools — ForceConclude");
                    messages.push(Message::system(LOOP_FORCE_CONCLUDE_PROMPT));
                    loop_tools_disabled = true;
                    if let Err(e) = self
                        .flush_transcript(&messages, &mut transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return;
                    }
                    continue;
                }
                LoopDecision::SyntheticDone { kind, turns } => {
                    debug!(kind, turns, "boucle tools — SyntheticDone");
                    emit_synthetic_done(&tx, &mut messages, kind, turns).await;
                    self.maybe_persist_session(&messages, &memory_tracker, &tx)
                        .await;
                    let _ = tx
                        .send(Ok(AgentEvent::Stop {
                            reason: StopReason::EndTurn,
                            usage: Usage::default(),
                        }))
                        .await;
                    return;
                }
            }

            if session_frames.analysis
                && !profile.is_local()
                && !analyzing_phase_nudge_sent
                && !saw_analyzing_phase_in_run
                && iter == 0
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
                    // Reset OK : one-shot analyzing — contrat de phase différent.
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
                >= MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES
            {
                debug!(
                    consecutive_ask_user_question_failures,
                    "ask_user_question — anti-boucle JSON (§2.21)"
                );
                messages.push(Message::system(ask_user_question_loop_nudge()));
                consecutive_ask_user_question_failures = 0;
                // Reset OK : anti-boucle ask_user — message de sortie dédié.
                loop_detector.reset();
                if let Err(e) = self
                    .flush_transcript(&messages, &mut transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return;
                }
            }

            // Filet "step-by-step" : si le modèle vient d'exécuter plusieurs
            // outils mutateurs sans intercaler `todo_write` et qu'il lui
            // reste du travail dans son plan, on lui rappelle de mettre à
            // jour ses étapes avant le prochain tour. Ne se déclenche qu'à
            // partir de 2 outils mutateurs sans MAJ (silence en deçà).
            // Reset après injection pour ne pas répéter en boucle si le
            // modèle ignore le nudge — `max_iterations` reste le garde-fou.
            let plan_still_open = if professor {
                last_course_pending > 0 || last_course_active > 0
            } else {
                last_todo_pending > 0 || last_todo_in_progress > 0
            };
            if plan_nudges && mutating_tools_since_last_todo >= 2 && plan_still_open {
                debug!(
                    mutating_tools_since_last_todo,
                    last_todo_pending,
                    last_todo_in_progress,
                    last_course_pending,
                    last_course_active,
                    professor,
                    "step-by-step nudge : outils mutateurs accumulés sans MAJ plan"
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
                // Reset OK : step-by-step todo — on demande un todo_write.
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
}
