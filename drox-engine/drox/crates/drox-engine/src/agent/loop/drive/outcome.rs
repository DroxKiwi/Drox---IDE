/// Suite du tour après stream LLM : gates done, discussion, nudges sans outil.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PostLlmStep {
    Stop,
    Continue,
    Tools,
}

impl Agent {
    async fn inject_missing_mutation_gate(
        &self,
        outcome: &crate::agent::stream::TurnOutcome,
        messages: &mut Vec<Message>,
        transcript_cursor: &mut usize,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        architect_state: &mut ArchitectRunState,
        mutation_expected: bool,
        mutation_count: u32,
        last_todo_pending: u64,
        last_todo_in_progress: u64,
    ) -> Option<PostLlmStep> {
        if let Some(prompt) = done_gate_missing_mutation_when_expected(
            &self.config.run_spec,
            mutation_expected,
            mutation_count,
            &outcome.text,
        ) {
            debug!("[phase: done] mutation attendue mais aucun outil mutateur — nudge");
            messages.push(Message::system(prompt));
            if rail::run_rail_active(&self.config.engine_tuning, self.config.run_spec.role_id) {
                rail::force_act_for_expected_mutation(&mut architect_state.rail);
                let open_todos = rail::OpenTodoCounts {
                    pending: last_todo_pending,
                    in_progress: last_todo_in_progress,
                };
                let rail_focus = architect_state
                    .current_focus_task_line()
                    .map(|(id, label, _)| (id, label));
                let focus = rail_focus
                    .as_ref()
                    .map(|(id, label)| (id.as_str(), label.as_str()));
                rail::refresh_snapshot(messages, &architect_state.rail, focus, open_todos);
            }
            if let Err(e) = self
                .flush_transcript(messages, transcript_cursor)
                .await
            {
                let _ = tx.send(Err(e)).await;
                return Some(PostLlmStep::Stop);
            }
            return Some(PostLlmStep::Continue);
        }
        None
    }

    async fn drive_post_llm_outcome(
        &self,
        outcome: &crate::agent::stream::TurnOutcome,
        messages: &mut Vec<Message>,
        transcript_cursor: &mut usize,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        seen_answering_in_run: &mut bool,
        final_answer_guard: &mut crate::agent::final_answer_guard::FinalAnswerGuard,
        architect_state: &mut ArchitectRunState,
        _saw_successful_todo_write_in_run: bool,
        last_todo_pending: u64,
        last_todo_in_progress: u64,
        _effective_run_objective: Option<&str>,
        mutation_expected: bool,
        mutation_count: u32,
    ) -> PostLlmStep {
            if outcome.final_phase == Some(Phase::Done) {
                if !*seen_answering_in_run {
                    if run_has_promotable_user_facing_text(
                        &outcome,
                        &messages,
                        self.config.run_spec.role_id,
                        &self.config.engine_tuning,
                    ) {
                        debug!(
                            "[phase: done] sans answering mais texte dÃƒÂ©jÃƒÂ  prÃƒÂ©sent Ã¢â‚¬â€ promotion UI, pas de second tour LLM"
                        );
                        if tx.send(Ok(AgentEvent::PhaseClose)).await.is_err() {
                            return PostLlmStep::Stop;
                        }
                        if tx
                            .send(Ok(AgentEvent::PhaseEnter {
                                phase: Phase::Answering,
                            }))
                            .await
                            .is_err()
                        {
                            return PostLlmStep::Stop;
                        }
                        *seen_answering_in_run = true;
                        messages.push(Message::assistant(
                            "[phase: answering]\n[phase: done]",
                        ));
                        if let Err(e) = self
                            .flush_transcript(&messages, transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return PostLlmStep::Stop;
                        }
                    } else if let Some(prompt) =
                        done_gate_missing_answering(&self.config.run_spec)
                    {
                        debug!("[phase: done] prÃƒÂ©maturÃƒÂ© (answering absent) Ã¢â‚¬â€ nudge");
                        messages.push(Message::system(prompt));
                        if let Err(e) = self
                            .flush_transcript(&messages, transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return PostLlmStep::Stop;
                        }
                        return PostLlmStep::Continue;
                    }
                }
                if let Some(prompt) = done_gate_unfinished_todos(
                    &self.config.run_spec,
                    last_todo_pending,
                    last_todo_in_progress,
                ) {
                    debug!(
                        last_todo_pending,
                        last_todo_in_progress,
                        "[phase: done] avec to-do ouverte Ã¢â‚¬â€ nudge"
                    );
                    messages.push(Message::system(prompt));
                    if rail::run_rail_active(
                        &self.config.engine_tuning,
                        self.config.run_spec.role_id,
                    ) {
                        let open_todos = rail::OpenTodoCounts {
                            pending: last_todo_pending,
                            in_progress: last_todo_in_progress,
                        };
                        rail::reopen_work_station_if_needed(
                            &mut architect_state.rail,
                            open_todos,
                        );
                        let rail_focus = architect_state
                            .current_focus_task_line()
                            .map(|(id, label, _)| (id, label));
                        let focus = rail_focus
                            .as_ref()
                            .map(|(id, label)| (id.as_str(), label.as_str()));
                        rail::refresh_snapshot(
                            messages,
                            &architect_state.rail,
                            focus,
                            open_todos,
                        );
                    }
                    if let Err(e) = self
                        .flush_transcript(&messages, transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return PostLlmStep::Stop;
                    }
                    return PostLlmStep::Continue;
                }
                if rail::run_rail_active(&self.config.engine_tuning, self.config.run_spec.role_id) {
                    if let Some(prompt) = done_gate_verify_not_passed(
                        &self.config.run_spec,
                        mutation_expected,
                        mutation_count,
                        architect_state.rail.visited_verify,
                        architect_state.rail.verify_outcome.passed(),
                    ) {
                        debug!("[phase: done] verify not passed — nudge");
                        messages.push(Message::system(prompt));
                        rail::force_act_for_expected_mutation(&mut architect_state.rail);
                        let open_todos = rail::OpenTodoCounts {
                            pending: last_todo_pending,
                            in_progress: last_todo_in_progress,
                        };
                        let rail_focus = architect_state
                            .current_focus_task_line()
                            .map(|(id, label, _)| (id, label));
                        let focus = rail_focus
                            .as_ref()
                            .map(|(id, label)| (id.as_str(), label.as_str()));
                        rail::refresh_snapshot(
                            messages,
                            &architect_state.rail,
                            focus,
                            open_todos,
                        );
                        if let Err(e) = self
                            .flush_transcript(&messages, transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return PostLlmStep::Stop;
                        }
                        return PostLlmStep::Continue;
                    }
                }
                if let Some(step) = self
                    .inject_missing_mutation_gate(
                        outcome,
                        messages,
                        transcript_cursor,
                        tx,
                        architect_state,
                        mutation_expected,
                        mutation_count,
                        last_todo_pending,
                        last_todo_in_progress,
                    )
                    .await
                {
                    return step;
                }
                debug!("[phase: done] aprÃƒÂ¨s answering + todo_write clÃƒÂ´turÃƒÂ© Ã¢â‚¬â€ clÃƒÂ´ture propre");
                let _ = tx
                    .send(Ok(AgentEvent::Stop {
                        reason: outcome.reason,
                        usage: outcome.usage,
                    }))
                    .await;
                return PostLlmStep::Stop;
            }

            // Si le modÃƒÂ¨le n'a pas signÃƒÂ© `done` et n'a pas non plus appelÃƒÂ©
            // d'outil ce tour, on l'invite explicitement ÃƒÂ  choisir : conclure
            // (`answering` + `done`) ou continuer (`reading` / `acting` + tool).
            // Aucun compteur sÃƒÂ©parÃƒÂ© : `max_iterations` borne tout.
            if outcome.tool_calls.is_empty() {
                if self.config.run_spec.role_id == RoleId::ArchitectDiscussion
                    && outcome.tool_calls.is_empty()
                    && (extract_discussion_done_from_text(&outcome.text)
                        || outcome.final_phase == Some(Phase::Done))
                {
                    final_answer_guard.mark_user_facing_answer_seen();
                    debug!("architect discussion â€” marqueur de clÃ´ture, fin du run");
                    let _ = tx
                        .send(Ok(AgentEvent::Stop {
                            reason: outcome.reason,
                            usage: outcome.usage.clone(),
                        }))
                        .await;
                    return PostLlmStep::Stop;
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
                    debug!("architect discussion â€” rÃ©ponse directe, fin du run");
                    let _ = tx
                        .send(Ok(AgentEvent::Stop {
                            reason: outcome.reason,
                            usage: outcome.usage.clone(),
                        }))
                        .await;
                    return PostLlmStep::Stop;
                }
                // Cas typique GLM-4.7-Flash : le modÃƒÂ¨le a dÃƒÂ©jÃƒÂ  ÃƒÂ©mis sa
                // rÃƒÂ©ponse en `answering` mais a omis le `[phase: done]`
                // final. Le nudge gÃƒÂ©nÃƒÂ©rique le fait rÃƒÂ©-ÃƒÂ©crire toute la
                // rÃƒÂ©ponse (Ã‚Â« ÃƒÂ©cris ta rÃƒÂ©ponse finale Ã‚Â») Ã¢â€ â€™ affichage en
                // double cÃƒÂ´tÃƒÂ© UI. On lui demande juste le marqueur.
                if outcome.final_phase == Some(Phase::Answering)
                    && *seen_answering_in_run
                    && last_todo_pending == 0
                    && last_todo_in_progress == 0
                {
                    if run_has_promotable_user_facing_text(
                        &outcome,
                        &messages,
                        self.config.run_spec.role_id,
                        &self.config.engine_tuning,
                    ) {
                        debug!(
                            "answering without done, text already published â€” auto close (done UI)"
                        );
                        let _ = tx.send(Ok(AgentEvent::PhaseClose)).await;
                        if tx
                            .send(Ok(AgentEvent::PhaseEnter {
                                phase: Phase::Done,
                            }))
                            .await
                            .is_err()
                        {
                            return PostLlmStep::Stop;
                        }
                        messages.push(Message::assistant("[phase: done]"));
                        if let Err(e) = self
                            .flush_transcript(&messages, transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return PostLlmStep::Stop;
                        }
                        if let Some(step) = self
                            .inject_missing_mutation_gate(
                                outcome,
                                messages,
                                transcript_cursor,
                                tx,
                                architect_state,
                                mutation_expected,
                                mutation_count,
                                last_todo_pending,
                                last_todo_in_progress,
                            )
                            .await
                        {
                            return step;
                        }
                        let _ = tx
                            .send(Ok(AgentEvent::Stop {
                                reason: outcome.reason,
                                usage: outcome.usage,
                            }))
                            .await;
                        return PostLlmStep::Stop;
                    }
                    debug!("answering sans done + todo clÃƒÂ´turÃƒÂ©e Ã¢â‚¬â€ nudge minimal (done seul)");
                    messages.push(Message::system(done_only_nudge_prompt(
                        &self.config.run_spec,
                    )));
                    if let Err(e) = self
                        .flush_transcript(&messages, transcript_cursor)
                        .await
                    {
                        let _ = tx.send(Err(e)).await;
                        return PostLlmStep::Stop;
                    }
                    return PostLlmStep::Continue;
                }

                if self.config.run_spec.role_id == RoleId::Architect
                    && rail::run_rail_active(
                        &self.config.engine_tuning,
                        self.config.run_spec.role_id,
                    )
                {
                    if !*seen_answering_in_run
                        && last_todo_pending == 0
                        && last_todo_in_progress == 0
                        && mutation_count > 0
                    {
                        if let Some(nudge) = rail::on_post_todos_idle_turn(
                            &mut architect_state.rail,
                            true,
                            mutation_count,
                        ) {
                            debug!("[run_rail] post-todos idle — nudge answering");
                            messages.push(Message::system(nudge.to_string()));
                            let rail_focus = architect_state
                                .current_focus_task_line()
                                .map(|(id, label, _)| (id, label));
                            let focus = rail_focus
                                .as_ref()
                                .map(|(id, label)| (id.as_str(), label.as_str()));
                            rail::refresh_snapshot(
                                messages,
                                &architect_state.rail,
                                focus,
                                rail::OpenTodoCounts {
                                    pending: last_todo_pending,
                                    in_progress: last_todo_in_progress,
                                },
                            );
                            if let Err(e) = self
                                .flush_transcript(messages, transcript_cursor)
                                .await
                            {
                                let _ = tx.send(Err(e)).await;
                                return PostLlmStep::Stop;
                            }
                            return PostLlmStep::Continue;
                        }
                    }

                    let has_open_task = last_todo_in_progress > 0
                        || architect_state.current_focus_task_line().is_some();
                    if let Some(nudge) =
                        rail::on_act_idle_turn(&mut architect_state.rail, has_open_task)
                    {
                        debug!("[run_rail] ACT stall — nudge mutation");
                        messages.push(Message::system(nudge.to_string()));
                        let rail_focus = architect_state
                            .current_focus_task_line()
                            .map(|(id, label, _)| (id, label));
                        let focus = rail_focus
                            .as_ref()
                            .map(|(id, label)| (id.as_str(), label.as_str()));
                        rail::refresh_snapshot(
                            messages,
                            &architect_state.rail,
                            focus,
                            rail::OpenTodoCounts {
                                pending: last_todo_pending,
                                in_progress: last_todo_in_progress,
                            },
                        );
                        if let Err(e) = self
                            .flush_transcript(messages, transcript_cursor)
                            .await
                        {
                            let _ = tx.send(Err(e)).await;
                            return PostLlmStep::Stop;
                        }
                        return PostLlmStep::Continue;
                    }
                }

                debug!("tour sans tool_call et sans [phase: done] — schema_error continue");
                messages.push(Message::system(schema_error_continue_nudge(
                    &self.config.run_spec,
                    self.config.run_intent.as_ref(),
                )));
                if let Err(e) = self
                    .flush_transcript(&messages, transcript_cursor)
                    .await
                {
                    let _ = tx.send(Err(e)).await;
                    return PostLlmStep::Stop;
                }
                return PostLlmStep::Continue;
            }

        PostLlmStep::Tools
    }
}
