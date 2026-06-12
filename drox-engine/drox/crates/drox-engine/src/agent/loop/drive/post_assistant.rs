impl Agent {
    /// Gates post-stream, exécution outils, nudges. `true` = arrêter `drive_inner`.
    async fn drive_post_assistant(
        &self,
        session: &mut DriveSession,
        outcome: &mut crate::agent::stream::TurnOutcome,
        tx: &tokio::sync::mpsc::Sender<Result<crate::event::AgentEvent, crate::error::EngineError>>,
    ) -> bool {
        if outcome.saw_answering {
            session.seen_answering_in_run = true;
            if !outcome.text.trim().is_empty() {
                session.final_answer_guard.mark_user_facing_answer_seen();
            }
        }

        match self
            .drive_post_llm_outcome(
                outcome,
                &mut session.messages,
                &mut session.transcript_cursor,
                tx,
                &mut session.seen_answering_in_run,
                &mut session.final_answer_guard,
                &mut session.architect_state,
                session.saw_successful_todo_write_in_run,
                session.last_todo_pending,
                session.last_todo_in_progress,
                session.effective_run_objective.as_deref(),
                session.mutation_expected,
                session.memory_tracker.mutation_count(),
            )
            .await
        {
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
                &mut session.saw_successful_todo_write_in_run,
                &mut session.last_todo_pending,
                &mut session.last_todo_in_progress,
                &mut session.consecutive_todo_completion_gate_failures,
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
            session.messages.push(Message::system(
                crate::agent::nudges::ask_user_question_loop_nudge(),
            ));
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
