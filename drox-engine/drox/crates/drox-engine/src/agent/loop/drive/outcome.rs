/// Suite du tour après stream LLM : gates done, discussion, nudges sans outil.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PostLlmStep {
    Stop,
    Continue,
    Tools,
}

impl Agent {
    async fn drive_post_llm_outcome(
        &self,
        outcome: &crate::agent::stream::TurnOutcome,
        messages: &mut Vec<Message>,
        transcript_cursor: &mut usize,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        seen_answering_in_run: &mut bool,
        final_answer_guard: &mut crate::agent::final_answer_guard::FinalAnswerGuard,
        architect_state: &mut ArchitectRunState,
        _effective_run_objective: Option<&str>,
        mutation_count: u32,
        schema_error_continue_count: &mut u32,
    ) -> PostLlmStep {
            let work_closed = crate::agent::OpenWorkCounts::work_closed(architect_state);
            let open_work = crate::agent::OpenWorkCounts::from_state(architect_state);
            if is_premature_answering_turn(
                self.config.run_spec.role_id,
                mutation_count,
                messages,
                outcome,
            ) {
                debug!("answering prématuré — aucun tool_result depuis le user, nudge explore");
                *seen_answering_in_run = false;
                append_gate_nudge(
                    messages,
                    NudgeId::AnsweringTooEarly,
                    ANSWERING_TOO_EARLY_NUDGE.to_string(),
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
            if self.config.run_spec.role_id == crate::run_spec::RoleId::Architect
                && outcome.final_phase == Some(Phase::Answering)
                && !*seen_answering_in_run
                && crate::agent::has_internal_plan(architect_state)
            {
                let touch = architect_state
                    .internal_plan
                    .as_ref()
                    .map(|p| p.meta.tools_since_touch)
                    .unwrap_or(0);
                append_gate_nudge(
                    messages,
                    NudgeId::InternalPlanPreAnswering,
                    crate::agent::nudges::pre_answering_plan_nudge(touch),
                );
            }
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
                        append_gate_nudge(messages, NudgeId::DoneMissingAnswering, prompt);
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
                if rail::run_rail_active(&self.config.engine_tuning, self.config.run_spec.role_id) {
                    if let Some(prompt) = done_gate_verify_not_passed(
                        &self.config.run_spec,
                        mutation_count,
                        &architect_state.rail.verify_outcome,
                    ) {
                        debug!("[phase: done] verify not passed — nudge");
                        append_gate_nudge(messages, NudgeId::DoneVerifyNotPassed, prompt);
                        let rail_focus = architect_state
                            .current_focus_step_line()
                            .map(|(id, action, _)| (id, action));
                        let focus = rail_focus
                            .as_ref()
                            .map(|(id, action)| (id.as_str(), action.as_str()));
                        rail::refresh_snapshot(
                            messages,
                            &architect_state.rail,
                            focus,
                            open_work,
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
                debug!("[phase: done] après answering + plan clôturé — clôture propre");
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
                if self.config.run_spec.role_id == RoleId::Architect
                    && rail::run_rail_active(
                        &self.config.engine_tuning,
                        self.config.run_spec.role_id,
                    )
                {
                    let closure_ctx = EngineClosureCtx {
                        mutation_count,
                        work_closed,
                        seen_answering_in_run: *seen_answering_in_run,
                        verify_satisfied: architect_state.rail.verify_outcome.satisfied(),
                        verify_gate_required: self
                            .config
                            .run_spec
                            .gate_enabled(crate::run_spec::GateKind::DoneRequiresVerify),
                    };
                    if should_engine_auto_close_with_promotable_reply(
                        &closure_ctx,
                        outcome,
                        &messages,
                        self.config.run_spec.role_id,
                        &self.config.engine_tuning,
                        true,
                    ) {
                        debug!(
                            "architect rail — promotion answering/done sans second tour LLM \
                             (mutation_count={mutation_count})"
                        );
                        return self
                            .engine_promote_user_reply_closure(
                                outcome,
                                messages,
                                transcript_cursor,
                                tx,
                                seen_answering_in_run,
                                final_answer_guard,
                                reply_closure_mode_for_promotion(*seen_answering_in_run),
                            )
                            .await;
                    }
                }
                // Cas typique GLM-4.7-Flash : le modèle a déjà émis sa
                // réponse en `answering` mais a omis le `[phase: done]`
                // final. Le nudge générique le fait ré-écrire toute la
                // réponse (« écris ta réponse finale ») → affichage en
                // double côté UI. On lui demande juste le marqueur.
                if outcome.final_phase == Some(Phase::Answering)
                    && *seen_answering_in_run
                    && work_closed
                {
                    if run_has_promotable_user_facing_text(
                        &outcome,
                        &messages,
                        self.config.run_spec.role_id,
                        &self.config.engine_tuning,
                    ) {
                        debug!(
                            "answering without done, text already published — auto close (done UI)"
                        );
                        return self
                            .engine_promote_user_reply_closure(
                                outcome,
                                messages,
                                transcript_cursor,
                                tx,
                                seen_answering_in_run,
                                final_answer_guard,
                                EngineReplyClosureMode::DoneOnly,
                            )
                            .await;
                    }
                    debug!("answering sans done + todo clÃƒÂ´turÃƒÂ©e Ã¢â‚¬â€ nudge minimal (done seul)");
                    append_gate_nudge(
                        messages,
                        NudgeId::DoneOnlyMarker,
                        done_only_nudge_prompt(&self.config.run_spec),
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

                let text_tool_markers = assistant_text_has_tool_markers(&outcome.text);
                if text_tool_markers {
                    architect_state.text_tool_marker_streak =
                        architect_state.text_tool_marker_streak.saturating_add(1);
                    if architect_state.text_tool_marker_streak >= 12 {
                        warn!(
                            streak = architect_state.text_tool_marker_streak,
                            "text_tool_marker_streak high — model still emitting [tool_use] text tags"
                        );
                    }
                    debug!("tour avec marqueurs [tool_use] texte — nudge protocol.text_tool_marker");
                    append_gate_nudge(
                        messages,
                        NudgeId::TextToolMarker,
                        text_tool_marker_nudge(architect_state.text_tool_marker_streak)
                            .to_string(),
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

                debug!("tour sans tool_call et sans [phase: done] — schema_error continue");
                *schema_error_continue_count = schema_error_continue_count.saturating_add(1);

                if *schema_error_continue_count > SCHEMA_ERROR_CONTINUE_MAX {
                    warn!(
                        count = *schema_error_continue_count,
                        "schema_error_continue max — forced stop"
                    );
                    if self.config.run_spec.role_id == crate::run_spec::RoleId::Architect
                        && run_has_promotable_user_facing_text(
                            outcome,
                            messages,
                            self.config.run_spec.role_id,
                            &self.config.engine_tuning,
                        )
                    {
                        return self
                            .engine_promote_user_reply_closure(
                                outcome,
                                messages,
                                transcript_cursor,
                                tx,
                                seen_answering_in_run,
                                final_answer_guard,
                                reply_closure_mode_for_promotion(*seen_answering_in_run),
                            )
                            .await;
                    }
                    let _ = tx
                        .send(Ok(AgentEvent::Stop {
                            reason: outcome.reason,
                            usage: outcome.usage.clone(),
                        }))
                        .await;
                    return PostLlmStep::Stop;
                }

                if *schema_error_continue_count == SCHEMA_ERROR_CONTINUE_MAX {
                    append_gate_nudge(
                        messages,
                        NudgeId::SchemaErrorForcedAnswering,
                        schema_error_forced_answering_nudge().to_string(),
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

                append_gate_nudge(
                    messages,
                    NudgeId::SchemaErrorContinue,
                    schema_error_continue_nudge(
                        &self.config.run_spec,
                        SchemaErrorNudgeContext {
                            has_tool_results_since_user: has_tool_results_since_user(messages),
                        },
                    )
                    .to_string(),
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

        if !outcome.tool_calls.is_empty() {
            architect_state.text_tool_marker_streak = 0;
        }

        PostLlmStep::Tools
    }
}
