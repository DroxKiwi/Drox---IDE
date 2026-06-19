impl Agent {
    async fn drive_execute_tool_batches(
        &self,
        outcome: &mut crate::agent::stream::TurnOutcome,
        ctx: &mut drox_tools::ToolContext,
        memory_tracker: &mut crate::memory::MemoryTracker,
        architect_state: &mut crate::agent::ArchitectRunState,
        messages: &mut Vec<drox_types::Message>,
        transcript_cursor: &mut usize,
        tx: &tokio::sync::mpsc::Sender<Result<crate::event::AgentEvent, crate::error::EngineError>>,
        consecutive_ask_user_question_failures: &mut u32,
        effective_run_objective: &Option<String>,
        rail_active: bool,
        last_usage: &drox_types::Usage,
    ) -> bool {
        // true = caller should return from drive_inner

            let tool_calls: Vec<(&str, &Value)> = outcome
                .tool_calls
                .iter()
                .map(|c| (c.name.as_str(), &c.arguments))
                .collect();
            let batches = partition_tool_calls(&tool_calls, &self.registry);

            for batch in batches {
                match batch {
                    ToolCallBatch::Parallel(indices) => {
                        let max_parallel = self.config.max_parallel_tool_calls.max(1);
                        let mut to_execute: Vec<usize> = Vec::new();
                        for idx in &indices {
                            let call = &outcome.tool_calls[*idx];
                            if self
                                .try_recover_hallucinated_phase_tool(&tx, messages, call)
                                .await
                            {
                                if let Err(e) = self
                                    .flush_transcript(&messages, transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return true;
                                }
                                continue;
                            }
                            if let Some(msg) = self.run_tool_pre_gates(
                                call,
                                &ctx,
                                architect_state,
                            ) {
                                if push_tool_error_tracked(
                                    &tx,
                                    messages,
                                    call,
                                    msg,
                                    consecutive_ask_user_question_failures,
                                    Some(architect_state),
                                )
                                .await
                                .is_err()
                                {
                                    return true;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return true;
                                }
                                continue;
                            }
                            if let Some(stop) = self
                                .try_execute_virtual_tool_call(
                                    call,
                                    architect_state,
                                    rail_active,
                                    &tx,
                                    messages,
                                    memory_tracker,
                                    consecutive_ask_user_question_failures,
                                )
                                .await
                            {
                                if stop {
                                    return true;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return true;
                                }
                                continue;
                            }
                            if let Some(denial) = self.check_permission(call).await {
                                if push_tool_error_tracked(
                                    &tx,
                                    messages,
                                    call,
                                    denial,
                                    consecutive_ask_user_question_failures,
                                    Some(architect_state),
                                )
                                    .await
                                    .is_err()
                                {
                                    return true;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return true;
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
                                    let ctx_parallel = ctx_parallel.clone();
                                    async move {
                                        let exec_name = resolve_tool_name_alias(
                                            &call.name,
                                            &call.arguments,
                                        );
                                        let result = registry
                                            .execute_named(
                                                exec_name,
                                                &ctx_parallel,
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
                                            memory_tracker,
                                            architect_state,
                                            &tx,
                                            messages,
                                        )
                                        .await
                                    {
                                        return true;
                                    }
                                }
                                Err(err) => {
                                    if push_tool_error_tracked(
                                        &tx,
                                        messages,
                                        call,
                                        err.to_string(),
                                        consecutive_ask_user_question_failures,
                                        Some(architect_state),
                                    )
                                    .await
                                    .is_err()
                                    {
                                        return true;
                                    }
                                }
                            }
                            if let Err(e) = self
                                .flush_transcript(&messages, transcript_cursor)
                                .await
                            {
                                let _ = tx.send(Err(e)).await;
                                return true;
                            }
                        }
                    }
                    ToolCallBatch::Serial(indices) => {
                        for idx in indices {
                            let call = &outcome.tool_calls[idx];
                            if self
                                .try_recover_hallucinated_phase_tool(&tx, messages, call)
                                .await
                            {
                                if let Err(e) = self
                                    .flush_transcript(&messages, transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return true;
                                }
                                continue;
                            }
                            if let Some(msg) = self.run_tool_pre_gates(
                                call,
                                &ctx,
                                architect_state,
                            ) {
                                if push_tool_error_tracked(
                                    &tx,
                                    messages,
                                    call,
                                    msg,
                                    consecutive_ask_user_question_failures,
                                    Some(architect_state),
                                )
                                .await
                                .is_err()
                                {
                                    return true;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return true;
                                }
                                continue;
                            }

                            if let Some(stop) = self
                                .try_execute_virtual_tool_call(
                                    call,
                                    architect_state,
                                    rail_active,
                                    &tx,
                                    messages,
                                    memory_tracker,
                                    consecutive_ask_user_question_failures,
                                )
                                .await
                            {
                                if stop {
                                    return true;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return true;
                                }
                                continue;
                            }

                            if let Some(denial) = self.check_permission(call).await {
                                if push_tool_error_tracked(
                                    &tx,
                                    messages,
                                    call,
                                    denial,
                                    consecutive_ask_user_question_failures,
                                    Some(architect_state),
                                )
                                .await
                                .is_err()
                                {
                                    return true;
                                }
                                if let Err(e) = self
                                    .flush_transcript(&messages, transcript_cursor)
                                    .await
                                {
                                    let _ = tx.send(Err(e)).await;
                                    return true;
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
                                if let PreHookOutcome::Block { message } = hooks
                                    .run_pre(hook_ctx, &ctx.workspace_root)
                                    .await
                                {
                                    if push_tool_error_tracked(
                                        &tx,
                                        messages,
                                        call,
                                        message,
                                        consecutive_ask_user_question_failures,
                                        Some(architect_state),
                                    )
                                    .await
                                    .is_err()
                                    {
                                        return true;
                                    }
                                    if let Err(e) = self
                                        .flush_transcript(&messages, transcript_cursor)
                                        .await
                                    {
                                        let _ = tx.send(Err(e)).await;
                                        return true;
                                    }
                                    continue;
                                }
                            }

                            if self.config.run_spec.role_id == RoleId::Architect {
                                ctx.orchestration_run_closable =
                                    crate::agent::state::internal_plan::OpenWorkCounts::work_closed(
                                        architect_state,
                                    );
                                *ctx = ctx.clone().with_architect_help_snapshot(
                                    architect_state.architect_help_snapshot(
                                        effective_run_objective.as_deref(),
                                    ),
                                );
                            }

                            let exec_name = resolve_tool_name_alias(&call.name, &call.arguments);
                            let exec = self
                                .registry
                                .execute_named(exec_name, &ctx, call.arguments.clone())
                                .await;
                            match exec {
                                Ok(mut value) => {
                                    if rail_active {
                                        rail::on_tool_success(
                                            &mut architect_state.rail,
                                            &call.name,
                                        );
                                        if let Some(nudge) = rail::on_act_mutation_success(
                                            &mut architect_state.rail,
                                            &call.name,
                                            &call.arguments,
                                        ) {
                                            append_gate_nudge(
                                                messages,
                                                NudgeId::ActMutationSuccess,
                                                nudge.to_string(),
                                            );
                                        }
                                        let _ = rail::on_verify_tool_result(
                                            &mut architect_state.rail,
                                            &call.name,
                                            &value,
                                            false,
                                        );
                                        let open_work =
                                            crate::agent::state::internal_plan::OpenWorkCounts::from_state(
                                                architect_state,
                                            );
                                        let rail_focus = architect_state
                                            .current_focus_step_line()
                                            .map(|(id, action, _)| (id, action));
                                        let focus = rail_focus.as_ref().map(|(id, action)| {
                                            (id.as_str(), action.as_str())
                                        });
                                        rail::refresh_snapshot(
                                            messages,
                                            &architect_state.rail,
                                            focus,
                                            open_work,
                                        );
                                    }
                                    memory_tracker.record_tool(&call.name);
                                    if call.name == "ask_user_question" {
                                        *consecutive_ask_user_question_failures = 0;
                                    }
                                    if call.name == "workspace_map_read" {
                                        architect_state.ingest_workspace_map_output(&value);
                                        crate::agent::diagnostic_target::refresh_diagnostic_resolution(
                                            architect_state,
                                            ctx.effective_workspace().as_path(),
                                        );
                                    }
                                    if self.config.run_spec.role_id == RoleId::Architect {
                                        architect_orchestration_record_successful_tool(
                                            self.config.run_spec.role_id,
                                            &call.name,
                                            &call.arguments,
                                            architect_state,
                                        );
                                    }
                                    let mut hook_appendix: Option<String> = None;
                                    if let Some(hooks) = self
                                        .config
                                        .tool_hooks
                                        .as_ref()
                                        .filter(|h| h.is_enabled())
                                    {
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
                                                return true;
                                            }
                                        }
                                    }
                                    if tx
                                        .send(Ok(AgentEvent::ToolFinish {
                                            id: call.id.clone(),
                                            output: value.clone(),
                                            is_error: false,
                                        }))
                                        .await
                                        .is_err()
                                    {
                                        return true;
                                    }
                                    messages.push(Message::tool_result(call.id.clone(), for_llm, false));
                                    // Pas d'archive automatique au jalon todo â€” voir `maybe_snip`
                                    // (compaction contexte plein) ou `/session_end` utilisateur.
                                }
                                Err(err) => {
                                    let msg = err.to_string();
                                    let rail_active = self.config.run_spec.role_id
                                        == RoleId::Architect
                                        && rail::run_rail_active(
                                            &self.config.engine_tuning,
                                            self.config.run_spec.role_id,
                                        );
                                    let mut verify_regressed = false;
                                    if rail_active {
                                        verify_regressed = rail::on_verify_tool_result(
                                            &mut architect_state.rail,
                                            &call.name,
                                            &serde_json::json!({ "error": &msg }),
                                            true,
                                        );
                                    }
                                    if push_tool_error_tracked(
                                        &tx,
                                        messages,
                                        call,
                                        msg,
                                        consecutive_ask_user_question_failures,
                                        Some(architect_state),
                                    )
                                    .await
                                    .is_err()
                                    {
                                        return true;
                                    }
                                    if rail_active && verify_regressed {
                                        if call.name == "bash" {
                                            append_gate_nudge(
                                                messages,
                                                NudgeId::VerifyBashRetry,
                                                crate::agent::nudges::VERIFY_BASH_RETRY_NUDGE_PROMPT
                                                    .to_string(),
                                            );
                                        }
                                        let open_work =
                                            crate::agent::state::internal_plan::OpenWorkCounts::from_state(
                                                architect_state,
                                            );
                                        let rail_focus = architect_state
                                            .current_focus_step_line()
                                            .map(|(id, action, _)| (id, action));
                                        let focus = rail_focus.as_ref().map(|(id, action)| {
                                            (id.as_str(), action.as_str())
                                        });
                                        rail::refresh_snapshot(
                                            messages,
                                            &architect_state.rail,
                                            focus,
                                            open_work,
                                        );
                                    }
                                    if rail_active {
                                        if let Some(action) = rail::on_act_tool_failure(
                                            &mut architect_state.rail,
                                            &call.name,
                                            &call.arguments,
                                        ) {
                                            let (nudge, stop) = match action {
                                                rail::ActRailNudge::InjectContinue(n) => (n, false),
                                                rail::ActRailNudge::InjectStop(n) => (n, true),
                                            };
                                            let nudge_id = if stop {
                                                NudgeId::ActToolFailureStop
                                            } else {
                                                NudgeId::ActToolFailureContinue
                                            };
                                            append_gate_nudge(
                                                messages,
                                                nudge_id,
                                                nudge.to_string(),
                                            );
                                            let open_work =
                                                crate::agent::state::internal_plan::OpenWorkCounts::from_state(
                                                    architect_state,
                                                );
                                            let rail_focus = architect_state
                                                .current_focus_step_line()
                                                .map(|(id, action, _)| (id, action));
                                            let focus = rail_focus.as_ref().map(|(id, action)| {
                                                (id.as_str(), action.as_str())
                                            });
                                            rail::refresh_snapshot(
                                                messages,
                                                &architect_state.rail,
                                                focus,
                                                open_work,
                                            );
                                            if stop {
                                                debug!("[run_rail] ACT circuit breaker — stop run");
                                                let _ = tx
                                                    .send(Ok(AgentEvent::Stop {
                                                        reason: StopReason::EndTurn,
                                                        usage: last_usage.clone(),
                                                    }))
                                                    .await;
                                                return true;
                                            }
                                        }
                                    }
                                }
                            }
                            if let Err(e) = self
                                .flush_transcript(&messages, transcript_cursor)
                                .await
                            {
                                let _ = tx.send(Err(e)).await;
                                return true;
                            }
                        }
                    }
            }
        }
        if self.config.run_spec.role_id == crate::run_spec::RoleId::Architect
            && let Some(nudge) = crate::agent::stale_internal_plan_nudge(
                architect_state,
                self.config.engine_tuning.internal_plan_stale_nudge_after_tools,
            )
        {
            use crate::orchestration::{append_gate_nudge, NudgeId};
            append_gate_nudge(messages, NudgeId::InternalPlanStale, nudge);
            if let Err(e) = self
                .flush_transcript(messages, transcript_cursor)
                .await
            {
                let _ = tx.send(Err(e)).await;
                return true;
            }
        }
        false
    }
}
