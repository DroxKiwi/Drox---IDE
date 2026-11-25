//! Boucle principale `drive_inner` — tours LLM, tools, gates et clôture.
//!
//! Le corps est réparti par responsabilité :
//! nudges avant l'appel, tour LLM, gates de texte, lots d'outils, suite.

mod after_tools;
mod helpers;
mod llm_turn;
mod pre_turn;
mod state;
mod text_gates;
mod tools;

use std::collections::{HashMap, VecDeque};

use drox_types::{Content, Message};
use tokio::sync::mpsc;

use crate::error::EngineError;
use crate::event::AgentEvent;
use crate::memory::MemoryTracker;

use super::super::config::EngineProfile;
use super::super::context_load::ContextLoadSnapshot;
use super::super::dispatch::build_tool_specs;
use super::super::loop_detect::LoopDetector;
use super::super::nudges::run_objective_system_block;
use super::super::phase::user_blocks_plain_text;
use super::super::session_intent::{SessionFrames, classify_session_user_intent};
use super::super::situation::ExploreCoveredPaths;
use super::Agent;

use llm_turn::LlmStep;
use state::DriveState;

/// Suite d'un tour dans `drive_inner`.
pub(super) enum Turn {
    /// Le run s'arrête (`return` de l'ancienne boucle).
    Stop,
    /// Tour suivant (`continue` de l'ancienne boucle).
    Next,
    /// Enchaîner l'étape suivante du même tour.
    Proceed,
}

impl Agent {
    #[allow(clippy::too_many_lines)]
    pub(super) async fn drive_inner(
        self,
        history: Vec<Message>,
        user_blocks: Vec<Content>,
        tx: mpsc::Sender<Result<AgentEvent, EngineError>>,
        skip_new_user_turn: bool,
    ) {
        let profile = self.config.profile();
        // Tour sans outil = fin de run (local capable et full protocol).
        // `[phase: done]` reste accepté quand le modèle l'écrit. Child Explore
        // garde son propre contrat.
        let engine_closure = !self.config.explore_execution;
        let plan_nudges = profile.plan_nudges();
        // Parent full protocol : la consigne « same message » dirige.
        // Les rappels « un plan, puis un seul Explore » ne s'y ajoutent pas.
        let same_message_tools = profile == EngineProfile::CloudFull;
        tracing::info!(
            engine_profile = profile.id(),
            engine_closure,
            plan_nudges,
            "agent.run engine profile"
        );
        let tool_specs = build_tool_specs(&self.registry, profile);
        // Sprint M1 — si la mémoire de session est configurée, on greffe
        // le `SessionNotesHandle` partagé dans le `ToolContext` du run.
        // Les tools `session_note` / `memory_read` / `memory_list` y voient
        // le stock partagé ; sans `memory`, ils renvoient une erreur explicite
        // ("tool unavailable in this context") qui s'affiche au modèle.
        let ctx = match self.config.memory.as_ref() {
            Some(mem) => self.ctx.clone().with_session_notes(mem.notes.clone()),
            None => self.ctx.clone(),
        };
        let memory_tracker = MemoryTracker::new();
        let mut messages = Vec::new();
        if let Some(sys) = &self.config.system_prompt {
            messages.push(Message::system(sys));
        }
        if let Some(obj) = &self.config.run_objective {
            let block = run_objective_system_block(obj);
            messages.push(Message::system(block));
            let _ = tx
                .send(Ok(AgentEvent::RunObjective { text: obj.clone() }))
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

        // Clôture : un tour sans outil ferme le run (local et full protocol).
        // `[phase: done]` reste accepté quand le modèle l'écrit. Il n'est pas requis.
        let seen_answering_in_run = false;
        let saw_successful_todo_write_in_run = false;
        // Snapshot du dernier `todo_write` réussi (compteurs `pending` /
        // `in_progress`). Sert à interdire `[phase: done]` tant que la to-do
        // n'est pas elle-même clôturée — cf. `unfinished_todos_prompt`.
        let last_todo_pending: u64 = 0;
        let last_todo_in_progress: u64 = 0;
        // Sprint Plan « un seul plan par run » — set des ids du dernier
        // `todo_write` réussi + flag « toutes les étapes étaient completed ».
        // Servent à détecter une re-création de plan from scratch après
        // clôture (cf. `is_todo_recreation_from_scratch`).
        let last_todo_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
        let last_todo_was_all_completed: bool = false;
        // Step-by-step progression tracker : compte le nombre d'outils
        // mutateurs (`file_edit` / `file_write` / `notebook_edit` / `delete_path` / `bash`) exécutés depuis le
        // dernier `todo_write` réussi. Au-delà de 2, on injecte un nudge soft
        // pour pousser le modèle à mettre à jour sa todo entre les étapes.
        // Reset à chaque `todo_write` réussi ET à chaque injection de nudge
        // (pour ne pas répéter en boucle).
        let mutating_tools_since_last_todo: u32 = 0;
        // Sprint Hotfix « boucle édition/lecture » — détecteur strict de
        // répétition d'empreinte (texte assistant + tool_calls). Voir
        // `LoopDetector`. 1.6.0 : `reset` uniquement sur nudges structurels
        // (pas DONE_ONLY / générique — L-1).
        let loop_detector = LoopDetector::new();
        // Après ForceConclude : tours LLM suivants sans tools jusqu'à Done / SyntheticDone.
        let loop_tools_disabled = false;
        // Profils locaux : tour final forcé (tools off) + relances one-shot.
        let final_answer_forced = false;
        let local_empty_turn_nudge_sent = false;
        let local_textual_tool_nudge_sent = false;
        let local_soft_close_check_sent = false;
        // cloud-full : un DONE_ONLY déjà envoyé. Le tour suivant ne réaffiche
        // pas la conclusion ; sans `[phase: done]`, le run s'arrête.
        let done_only_nudge_sent = false;
        let consecutive_ask_user_question_failures: u32 = 0;
        let live_compaction_seq: u32 = 0;
        let run_objective_reminder_sent = false;
        // FX-B — compteur de nudges « acting sans tool ».
        let consecutive_intent_only_write_nudges: u32 = 0;
        // 1.6.0 Vague 4 / S-1 — situation card (upsert chaque tour).
        let files_touched_in_run: Vec<String> = Vec::new();
        let last_tool_error: Option<String> = None;
        let last_todo_next: Option<String> = None;
        let last_todo_completed_hint: u64 = 0;
        let parent_heavy_read_streak: u32 = 0;
        // La lecture qui suit un `file_edit` non appliqué sert à corriger l'ancre.
        let edit_repair_pending = false;
        let parent_heavy_read_nudge_sent = false;
        let doc_ingestion_annex_sent = false;
        let work_plan_frame_nudge_sent = false;
        let local_explore_kickoff_sent = false;
        // Soft — work/doc + activité outils sans todo_write (one-shot).
        let pre_plan_activity_count: u32 = 0;
        let work_without_plan_nudge_sent = false;
        let last_in_progress_todo_id: Option<String> = None;
        // Soft Explore kickoff: (step_id, optional content label).
        let pending_step_explore_nudge: Option<(String, Option<String>)> = None;
        // Soft — étape in_progress sans task (compteur parent, one-shot / step).
        let step_parent_activity_count: u32 = 0;
        let step_had_task_success = false;
        let step_without_explore_nudge_sent = false;
        // Context-load V1 — soft nudge one-shot après glob large.
        let pending_context_load: Option<ContextLoadSnapshot> = None;
        let context_load_nudge_sent = false;
        let last_context_load_recommended_n: u32 = 3;
        // Explore truncated → re-split nudge + anti parent-rescue.
        let pending_explore_incomplete: Option<(u64, u64)> = None;
        let explore_rescue_active = false;
        let explore_rescue_nudge_sent = false;
        // P1 — compteur de `file_read` réussis par path normalisé.
        let file_read_success_counts: HashMap<String, u32> = HashMap::new();
        let repeated_file_read_nudge_sent = false;
        // Soft — rotation multi-path (fenêtre glissante) + clôture post-merge Explore.
        let recent_file_reads: VecDeque<String> = VecDeque::new();
        let rotating_file_read_nudge_sent = false;
        // R1 — ré-inject Prefer rotating tous les N reads tant que la fenêtre tourne.
        let rotating_last_nudge_at: usize = 0;
        let pending_post_merge_closure_nudge = false;
        // C4 / V6-a — micro acting write juste après post-merge.
        let pending_micro_act_write_nudge = false;
        let micro_act_write_nudge_sent = false;
        // C2 / V2-c / E1 — paths Explore couverts → Prefer si parent re-file_read.
        let explore_covered_paths = ExploreCoveredPaths::default();
        let pending_explore_covered_reread_nudge = false;
        let explore_covered_reread_nudge_sent = false;
        // E2 — après Explore OK, lectures parent sans mutation → Prefer act.
        let post_explore_window = false;
        let post_explore_read_streak: u32 = 0;
        let pending_post_explore_stall_nudge = false;
        let post_explore_stall_nudge_sent = false;
        // A — explore_artifact_read error → Prefer recovery (pas file_read kind).
        let pending_explore_artifact_read_fail_nudge = false;
        // D4 — après ask_user_question réussi → soft skeleton / mutate.
        let pending_post_ask_acting_nudge = false;
        let task_tool_available = tool_specs.iter().any(|s| s.name == "task");
        // Systèmes injectés en tête de `messages` (re-poussés à chaque run) —
        // exclus du rewrite JSONL post-compaction (C-1). Inclut la situation
        // card dès qu'elle est insérée.
        let leading_injected_systems = usize::from(self.config.system_prompt.is_some())
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
            })
            .map(str::to_string);
        let capture_loop = "none";
        let mut st = DriveState {
            profile,
            engine_closure,
            plan_nudges,
            same_message_tools,
            tool_specs,
            ctx,
            memory_tracker,
            messages,
            session_frames,
            transcript_cursor,
            seen_answering_in_run,
            saw_successful_todo_write_in_run,
            last_todo_pending,
            last_todo_in_progress,
            last_todo_ids,
            last_todo_was_all_completed,
            mutating_tools_since_last_todo,
            loop_detector,
            loop_tools_disabled,
            final_answer_forced,
            local_empty_turn_nudge_sent,
            local_textual_tool_nudge_sent,
            local_soft_close_check_sent,
            done_only_nudge_sent,
            consecutive_ask_user_question_failures,
            live_compaction_seq,
            run_objective_reminder_sent,
            consecutive_intent_only_write_nudges,
            files_touched_in_run,
            last_tool_error,
            last_todo_next,
            last_todo_completed_hint,
            parent_heavy_read_streak,
            edit_repair_pending,
            parent_heavy_read_nudge_sent,
            doc_ingestion_annex_sent,
            work_plan_frame_nudge_sent,
            local_explore_kickoff_sent,
            pre_plan_activity_count,
            work_without_plan_nudge_sent,
            last_in_progress_todo_id,
            pending_step_explore_nudge,
            step_parent_activity_count,
            step_had_task_success,
            step_without_explore_nudge_sent,
            pending_context_load,
            context_load_nudge_sent,
            last_context_load_recommended_n,
            pending_explore_incomplete,
            explore_rescue_active,
            explore_rescue_nudge_sent,
            file_read_success_counts,
            repeated_file_read_nudge_sent,
            recent_file_reads,
            rotating_file_read_nudge_sent,
            rotating_last_nudge_at,
            pending_post_merge_closure_nudge,
            pending_micro_act_write_nudge,
            micro_act_write_nudge_sent,
            explore_covered_paths,
            pending_explore_covered_reread_nudge,
            explore_covered_reread_nudge_sent,
            post_explore_window,
            post_explore_read_streak,
            pending_post_explore_stall_nudge,
            post_explore_stall_nudge_sent,
            pending_explore_artifact_read_fail_nudge,
            pending_post_ask_acting_nudge,
            task_tool_available,
            leading_injected_systems,
            permission_mode_label,
            capture_loop,
            deferred_pre_tool_loop: None,
            round_tool_outputs: String::new(),
            last_turn_input_tokens: 0,
            context_overflow_retry_used: false,
        };
        for iter in 0..self.config.max_iterations {
            st.context_overflow_retry_used = false;
            match self.pre_turn(iter, &mut st, &tx).await {
                Turn::Stop => return,
                Turn::Next => continue,
                Turn::Proceed => {}
            }
            let mut outcome = match self.llm_turn(iter, &mut st, &tx).await {
                LlmStep::Stop => return,
                LlmStep::RetryAfterCompact => continue,
                LlmStep::Ready(outcome) => outcome,
            };
            match self.text_gates(&mut st, &tx, &mut outcome).await {
                Turn::Stop => return,
                Turn::Next => continue,
                Turn::Proceed => {}
            }
            match self.run_tool_batches(&mut st, &tx, &mut outcome).await {
                Turn::Stop => return,
                Turn::Next => continue,
                Turn::Proceed => {}
            }
            match self.after_tools(&mut st, &tx, &outcome).await {
                Turn::Stop => return,
                Turn::Next => continue,
                Turn::Proceed => {}
            }
        }

        let _ = tx
            .send(Err(EngineError::MaxIterations(self.config.max_iterations)))
            .await;
    }
}
