impl Agent {
    /// Stream LLM + rail post-assistant. `None` = arrêter `drive_inner`.
    async fn drive_llm_turn(
        &self,
        session: &mut DriveSession,
        tx: &tokio::sync::mpsc::Sender<Result<crate::event::AgentEvent, crate::error::EngineError>>,
    ) -> Option<crate::agent::stream::TurnOutcome> {
        let rail_active = crate::agent::rail::run_rail_active(
            &self.config.engine_tuning,
            self.config.run_spec.role_id,
        );
        let mut tour_tool_specs = session.base_tool_specs.clone();
        if rail_active {
            tour_tool_specs = crate::agent::rail::filter_tool_specs_for_station(
                tour_tool_specs,
                session.architect_state.rail.station,
            );
        }

        let options = self
            .config
            .chat_options
            .clone()
            .with_tools(tour_tool_specs);

        let stream = match self
            .llm
            .stream_chat(session.messages.clone(), options)
            .await
        {
            Ok(s) => s,
            Err(err) => {
                let _ = tx.send(Err(err.into())).await;
                return None;
            }
        };

        let native_thinking_ui = self.config.chat_options.think == Some(true);

        let Ok(mut outcome) = crate::agent::stream::consume_stream(
            stream,
            tx,
            native_thinking_ui,
            rail_active,
        )
        .await
        else {
            return None;
        };

        crate::agent::stream::enforce_max_tools_per_turn(
            &mut outcome.tool_calls,
            &self.config.run_spec,
        );

        crate::agent::stream::push_assistant_message(&mut session.messages, &outcome);

        if self.config.run_spec.role_id == crate::run_spec::RoleId::Architect && rail_active {
            let focus = session
                .architect_state
                .current_focus_task_line()
                .map(|(id, label, _)| (id, label));
            let tool_names: Vec<&str> = outcome
                .tool_calls
                .iter()
                .map(|c| c.name.as_str())
                .collect();
            let open_todos = crate::agent::rail::OpenTodoCounts {
                pending: session.last_todo_pending,
                in_progress: session.last_todo_in_progress,
            };
            let rail_ctx = crate::agent::rail::RailTransitionContext {
                open_todos,
                mutation_expected: session.mutation_expected,
                mutation_count: session.memory_tracker.mutation_count(),
            };
            let rail_turn = crate::agent::rail::after_assistant_turn(
                &mut session.architect_state.rail,
                &outcome.text,
                &tool_names,
                focus.clone(),
                rail_ctx,
            );
            let snapshot_focus = focus
                .as_ref()
                .map(|(id, label)| (id.as_str(), label.as_str()));
            crate::agent::rail::refresh_snapshot(
                &mut session.messages,
                &session.architect_state.rail,
                snapshot_focus,
                open_todos,
            );
            for ev in &rail_turn.station_events {
                let _ = tx
                    .send(Ok(crate::agent::rail::to_agent_event(ev)))
                    .await;
            }
            if rail_turn.action == crate::agent::rail::AfterAssistantAction::PauseForUser
                && outcome.tool_calls.is_empty()
            {
                debug!("[run_rail] PROPOSE hold — pause for user reply");
                let _ = tx
                    .send(Ok(crate::event::AgentEvent::Stop {
                        reason: outcome.reason,
                        usage: outcome.usage.clone(),
                    }))
                    .await;
                return None;
            }
        }

        session.last_stop_reason = outcome.reason;
        session.last_usage = outcome.usage.clone();

        if self.emit_context_usage(&session.messages, tx).await.is_err() {
            return None;
        }

        if let Some(obj) = &outcome.run_objective {
            if session.effective_run_objective.is_none() {
                session.effective_run_objective = Some(obj.clone());
                if self.config.run_spec.role_id != crate::run_spec::RoleId::Architect {
                    session.messages.push(Message::system(
                        crate::agent::nudges::run_objective_system_block(obj),
                    ));
                }
            }
            if self.config.run_spec.role_id == crate::run_spec::RoleId::Architect {
                let rail_active = crate::agent::rail::run_rail_active(
                    &self.config.engine_tuning,
                    self.config.run_spec.role_id,
                );
                let rail_station = rail_active.then_some(session.architect_state.rail.station);
                session.architect_state.anchor_run_objective(obj);
                crate::agent::state::refresh_architect_run_snapshot(
                    &mut session.messages,
                    &crate::orchestration::architect_run_context_block_per_turn(
                        &session.architect_state,
                        session.effective_run_objective.as_deref(),
                        rail_station,
                    ),
                );
            }
        }

        if let Err(e) = self
            .flush_transcript(&session.messages, &mut session.transcript_cursor)
            .await
        {
            let _ = tx.send(Err(e)).await;
            return None;
        }

        Some(outcome)
    }
}
