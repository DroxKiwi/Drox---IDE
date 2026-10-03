//! Boucle principale `drive_inner` — tours LLM, tools, gates et clôture.

use drox_hooks::{PostHookOutcome, PreHookOutcome, ToolHookContext};
use drox_tools::ToolError;
use drox_types::{Content, Message, Usage};
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
    build_tool_specs, format_tool_result_for_llm, mirror_workspace_map_from_tool,
    push_tool_error_tracked,
};
use super::super::gates::{
    counts_as_mutating_for_step_tracking, is_professor_run, plan_write_gate_satisfied,
    record_counts_as_code_mutation, PROFESSOR_DONE_WITHOUT_PLAN,
};
use super::super::loop_detect::{LoopDecision, LoopDetector, PendingToolCall};
use super::super::nudges::{
    ask_user_question_loop_nudge, assistant_text_suggests_mutation_intent,
    run_objective_done_nudge, run_objective_system_block, step_by_step_todo_nudge,
    unfinished_course_plan_prompt, unfinished_todos_prompt, ANALYZING_PHASE_NUDGE,
    CODE_MUTATION_TESTING_NUDGE, DONE_ONLY_NUDGE_PROMPT, INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT,
    INTENT_ONLY_WRITE_MAX_NUDGES, INTENT_ONLY_WRITE_NUDGE_PROMPT, LOOP_DETECTED_NUDGE_PROMPT,
    LOOP_TOOL_FAMILY_NUDGE_PROMPT, MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
    MISSING_ANSWERING_PROMPT, NUDGE_PROMPT,
};
use super::super::phase::{
    is_workspace_exploration_tool, user_blocks_plain_text, user_prompt_suggests_workspace_analysis,
};
use super::super::stream::{consume_stream, push_assistant_message};
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
        let tool_specs = build_tool_specs(&self.registry, professor);
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
        let user_analysis_intent = if skip_new_user_turn {
            use drox_types::Role;
            messages
                .iter()
                .rev()
                .find(|m| m.role == Role::User)
                .map(|m| {
                    user_prompt_suggests_workspace_analysis(&Content::collapse_text(&m.content))
                })
                .unwrap_or(false)
        } else {
            user_prompt_suggests_workspace_analysis(&user_blocks_plain_text(&user_blocks))
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
        // `LoopDetector` ; le `reset` est appelé après chaque nudge moteur
        // structurel pour ne pas pénaliser une convergence forcée.
        let mut loop_detector = LoopDetector::new();
        let mut consecutive_ask_user_question_failures: u32 = 0;
        let mut live_compaction_seq: u32 = 0;
        let mut run_objective_reminder_sent = false;
        let mut analyzing_phase_nudge_sent = false;
        let mut saw_analyzing_phase_in_run = false;
        let mut saw_code_mutation_in_run = false;
        let mut saw_testing_phase_in_run = false;
        // FX-B 1.5.16 — compteur de nudges « intention write sans tool ».
        let mut consecutive_intent_only_write_nudges: u32 = 0;
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
                .maybe_snip(&mut messages, &tx, &mut live_compaction_seq)
                .await
                .is_err()
            {
                return;
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

            let options = self
                .config
                .chat_options
                .clone()
                .with_tools(tool_specs.clone());

            let stream = match self.llm.stream_chat(messages.clone(), options).await {
                Ok(s) => s,
                Err(err) => {
                    let _ = tx.send(Err(err.into())).await;
                    return;
                }
            };

            let native_thinking_ui = self.config.chat_options.think == Some(true);

            let Ok(mut outcome) =
                consume_stream(stream, &tx, native_thinking_ui, &ctx.workspace_root).await
            else {
                return; // canal consommateur fermé
            };

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

            // FX-B 1.5.16 — intention de mutation en prose sans tool_calls.
            // **Avant** le LoopDetector : sinon un 2e tour de prose identique
            // déclenche `Warn`/`Abort` générique et court-circuite les nudges
            // « emit file_write NOW » (et le soft-abort `intent_only_write`).
            if outcome.tool_calls.is_empty() {
                let write_intent = assistant_text_suggests_mutation_intent(&outcome.text)
                    || consecutive_intent_only_write_nudges > 0;
                if write_intent {
                    consecutive_intent_only_write_nudges =
                        consecutive_intent_only_write_nudges.saturating_add(1);
                    if consecutive_intent_only_write_nudges > INTENT_ONLY_WRITE_MAX_NUDGES {
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
                        "tour sans tool_call — nudge intent-only write"
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
            match loop_detector.observe(&outcome) {
                LoopDecision::Ok => {}
                LoopDecision::Warn { kind } => {
                    debug!(
                        kind,
                        "boucle détectée (1er strike) — injection nudge anti-boucle"
                    );
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
                LoopDecision::Abort { kind, turns } => {
                    debug!(
                        kind,
                        turns,
                        "boucle non résolue après nudge — abort"
                    );
                    let _ = tx
                        .send(Err(EngineError::LoopDetected { kind, turns }))
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
                    messages.push(Message::system(DONE_ONLY_NUDGE_PROMPT));
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

                consecutive_intent_only_write_nudges = 0;
                debug!("tour sans tool_call et sans [phase: done] — nudge");
                messages.push(Message::system(NUDGE_PROMPT));
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

            for batch in batches {
                match batch {
                    ToolCallBatch::Parallel(indices) => {
                        let max_parallel = self.config.max_parallel_tool_calls.max(1);
                        let mut to_execute: Vec<usize> = Vec::new();
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
                                            &tx,
                                            &mut messages,
                                        )
                                        .await
                                    {
                                        return;
                                    }
                                }
                                Err(err) => {
                                    if matches!(&err, ToolError::InvalidArgs(_)) {
                                        loop_detector.reset();
                                    }
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

                            let ctx_exec = ctx.clone().with_tool_progress(ToolProgressBridge::new(
                                tx.clone(),
                                call.id.clone(),
                                call.name.clone(),
                            ));
                            let exec = self
                                .registry
                                .execute_named(&call.name, &ctx_exec, call.arguments.clone())
                                .await;
                            match exec {
                                Ok(mut value) => {
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
                                    }
                                    if call.name == "ask_user_question" {
                                        consecutive_ask_user_question_failures = 0;
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
                                    let mut for_llm =
                                        format_tool_result_for_llm(&call.name, &value);
                                    if let Some(app) = hook_appendix {
                                        for_llm.push_str("\n\n");
                                        for_llm.push_str(&app);
                                    }
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
                                    // Format / args invalides : le modèle vient
                                    // de recevoir un feedback nouveau — ne pas
                                    // enchaîner tout de suite vers Abort loop.
                                    if is_invalid {
                                        loop_detector.reset();
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

            if user_analysis_intent
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
            if mutating_tools_since_last_todo >= 2 && plan_still_open {
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
