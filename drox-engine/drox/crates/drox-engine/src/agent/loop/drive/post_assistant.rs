impl Agent {
    /// Gates post-stream, exécution outils, nudges. `true` = arrêter `drive_inner`.
    async fn drive_post_assistant(
        &self,
        session: &mut DriveSession,
        outcome: &mut crate::agent::stream::TurnOutcome,
        tx: &tokio::sync::mpsc::Sender<Result<crate::event::AgentEvent, crate::error::EngineError>>,
    ) -> bool {
        rail::apply_verify_waived_marker(&mut session.architect_state.rail, &outcome.text);
        rail::apply_verify_passed_marker(&mut session.architect_state.rail, &outcome.text);

        if outcome.saw_answering {
            session.seen_answering_in_run = true;
            rail::reset_post_work_idle(&mut session.architect_state.rail);
            if !outcome.text.trim().is_empty() {
                session.final_answer_guard.mark_user_facing_answer_seen();
            }
        }

        let post_step = self
            .drive_post_llm_outcome(
                outcome,
                &mut session.messages,
                &mut session.transcript_cursor,
                tx,
                &mut session.seen_answering_in_run,
                &mut session.final_answer_guard,
                &mut session.architect_state,
                session.effective_run_objective.as_deref(),
                session.memory_tracker.mutation_count(),
                &mut session.schema_error_continue_count,
            )
            .await;

        match post_step {
            PostLlmStep::Stop => return true,
            PostLlmStep::Continue => return false,
            PostLlmStep::Tools => {}
        }

        let rail_active = crate::agent::rail::run_rail_active(
            &self.config.engine_tuning,
            self.config.run_spec.role_id,
        );

        if self
            .drive_execute_tool_batches(
                outcome,
                &mut session.ctx,
                &mut session.memory_tracker,
                &mut session.architect_state,
                &mut session.messages,
                &mut session.transcript_cursor,
                tx,
                &mut session.consecutive_ask_user_question_failures,
                &session.effective_run_objective,
                rail_active,
                &session.last_usage,
            )
            .await
        {
            return true;
        }

        if self.emit_context_usage(&session.messages, tx).await.is_err() {
            return true;
        }

        if session.consecutive_ask_user_question_failures
            >= self.config.engine_tuning.max_consecutive_ask_user_failures
        {
            debug!(
                consecutive_ask_user_question_failures =
                    session.consecutive_ask_user_question_failures,
                "ask_user_question — anti-boucle JSON"
            );
            append_gate_nudge(
                &mut session.messages,
                NudgeId::AskUserQuestionLoop,
                crate::agent::nudges::ask_user_question_loop_nudge(),
            );
            session.consecutive_ask_user_question_failures = 0;
            if let Err(e) = self
                .flush_transcript(&session.messages, &mut session.transcript_cursor)
                .await
            {
                let _ = tx.send(Err(e)).await;
                return true;
            }
        }

        false
    }
}
