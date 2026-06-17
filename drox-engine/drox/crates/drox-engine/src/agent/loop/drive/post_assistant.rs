impl Agent {
    async fn maybe_inject_read_stall_nudge(
        &self,
        session: &mut DriveSession,
        outcome: &crate::agent::stream::TurnOutcome,
        tx: &tokio::sync::mpsc::Sender<Result<crate::event::AgentEvent, crate::error::EngineError>>,
    ) -> bool {
        let rail_active = crate::agent::rail::run_rail_active(
            &self.config.engine_tuning,
            self.config.run_spec.role_id,
        );
        if !rail_active || !session.mutation_expected {
            return false;
        }
        let tool_names: Vec<&str> = outcome
            .tool_calls
            .iter()
            .map(|call| call.name.as_str())
            .collect();
        let Some(nudge) = rail::on_read_idle_turn(
            &mut session.architect_state.rail,
            session.mutation_expected,
            &tool_names,
            session.architect_state.internal_plan.as_ref(),
        ) else {
            return false;
        };
        debug!("[run_rail] READ stall — nudge advance to ACT");
        append_gate_nudge(
            &mut session.messages,
            NudgeId::ReadStall,
            nudge.to_string(),
        );
        let open_todos = rail::OpenTodoCounts {
            pending: session.last_todo_pending,
            in_progress: session.last_todo_in_progress,
        };
        let rail_focus = session
            .architect_state
            .current_focus_task_line()
            .map(|(id, label, _)| (id, label));
        let focus = rail_focus
            .as_ref()
            .map(|(id, label)| (id.as_str(), label.as_str()));
        rail::refresh_snapshot(
            &mut session.messages,
            &session.architect_state.rail,
            focus,
            open_todos,
        );
        if let Err(e) = self
            .flush_transcript(&mut session.messages, &mut session.transcript_cursor)
            .await
        {
            let _ = tx.send(Err(e)).await;
            return true;
        }
        false
    }

    /// Gates post-stream, exécution outils, nudges. `true` = arrêter `drive_inner`.
    async fn drive_post_assistant(
        &self,
        session: &mut DriveSession,
        outcome: &mut crate::agent::stream::TurnOutcome,
        tx: &tokio::sync::mpsc::Sender<Result<crate::event::AgentEvent, crate::error::EngineError>>,
    ) -> bool {
        let premature_answering = outcome.saw_answering
            && crate::agent::nudges::is_premature_answering_turn(
                self.config.run_spec.role_id,
                session.mutation_expected,
                session.memory_tracker.mutation_count(),
                &session.messages,
                outcome,
            );

        if outcome.saw_answering && !premature_answering {
            session.seen_answering_in_run = true;
            rail::reset_post_todos_idle(&mut session.architect_state.rail);
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
                session.saw_successful_todo_write_in_run,
                session.last_todo_pending,
                session.last_todo_in_progress,
                session.effective_run_objective.as_deref(),
                session.mutation_expected,
                session.memory_tracker.mutation_count(),
                &mut session.schema_error_continue_count,
            )
            .await;

        match post_step {
            PostLlmStep::Stop => return true,
            PostLlmStep::Continue => {
                // READ stall only on tool-less turns (schema_error / thinking). Do not
                // double-count after a tool batch on the same iteration.
                if outcome.tool_calls.is_empty()
                    && self.maybe_inject_read_stall_nudge(session, outcome, tx).await
                {
                    return true;
                }
                return false;
            }
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

        if self.maybe_inject_read_stall_nudge(session, outcome, tx).await {
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
