impl Agent {
    async fn drive_boot(
        &self,
        history: Vec<Message>,
        user_blocks: Vec<Content>,
        tx: &tokio::sync::mpsc::Sender<Result<crate::event::AgentEvent, crate::error::EngineError>>,
    ) -> Option<DriveSession> {
        let base_tool_specs =
            crate::agent::build_tool_specs(&self.registry, &self.config.run_spec);
        let ctx = match self.config.memory.as_ref() {
            Some(mem) => self.ctx.clone().with_session_notes(mem.notes.clone()),
            None => self.ctx.clone(),
        };
        let memory_tracker = MemoryTracker::new();
        let mut messages = Vec::new();
        if let Some(sys) = &self.config.system_prompt {
            messages.push(Message::system(sys));
        }
        if self.config.chat_options.think == Some(true) {
            messages.push(Message::system(
                crate::agent::nudges::NATIVE_THINKING_UI_SUPPLEMENT,
            ));
        }
        if let Some(obj) = &self.config.run_objective {
            if self.config.run_spec.role_id != crate::run_spec::RoleId::Architect {
                messages.push(Message::system(
                    crate::agent::nudges::run_objective_system_block(obj),
                ));
            }
        }
        messages.extend(history);
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
            return None;
        }

        let mut effective_run_objective = self.config.run_objective.clone();
        let mut architect_state =
            ArchitectRunState::with_engine_tuning(&self.config.engine_tuning);
        if self.config.run_spec.role_id == crate::run_spec::RoleId::Architect {
            let req = crate::agent::last_user_text(&messages)
                .or_else(|| crate::agent::first_user_text(&messages));
            let start_outcome = crate::agent::edit_start::apply_architect_edit_start(
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
            if crate::agent::rail::run_rail_active(
                &self.config.engine_tuning,
                self.config.run_spec.role_id,
            ) {
                crate::agent::rail::on_turn_start(
                    &mut architect_state.rail,
                    &messages,
                    true,
                    crate::agent::rail::OpenTodoCounts::default(),
                );
            }
        }

        Some(DriveSession {
            ctx,
            memory_tracker,
            messages,
            transcript_cursor,
            seen_answering_in_run: false,
            saw_successful_todo_write_in_run: false,
            last_todo_pending: 0,
            last_todo_in_progress: 0,
            effective_run_objective,
            consecutive_ask_user_question_failures: 0,
            live_compaction_seq: 0,
            architect_state,
            final_answer_guard: FinalAnswerGuard::default(),
            consecutive_todo_completion_gate_failures: 0,
            last_usage: Usage::default(),
            last_stop_reason: StopReason::EndTurn,
            base_tool_specs,
        })
    }
}
