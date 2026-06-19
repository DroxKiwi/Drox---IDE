impl Agent {

    async fn try_recover_hallucinated_phase_tool(

        &self,

        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,

        messages: &mut Vec<Message>,

        call: &PendingToolCall,

    ) -> bool {

        let Some(phase) =

            parse_hallucinated_phase_from_tool_call(&call.name, &call.arguments)

        else {

            return false;

        };

        if tx

            .send(Ok(AgentEvent::PhaseEnter { phase }))

            .await

            .is_err()

        {

            return true;

        }

        let marker = phase.as_marker();

        let hint = format!(
            "(Engine recovered `[phase: {marker}]` from a mistaken tool call — emit that line as **plain text** in your next message, not `tool_calls`.)"
        );

        let value = json!({

            "ok": true,

            "recovered_phase": marker,

            "hint": hint,

        });

        if tx

            .send(Ok(AgentEvent::ToolFinish {

                id: call.id.clone(),

                output: value,

                is_error: false,

            }))

            .await

            .is_err()

        {

            return true;

        }

        messages.push(Message::tool_result(call.id.clone(), hint, false));

        true

    }





    fn run_tool_pre_gates(

        &self,

        call: &PendingToolCall,

        ctx: &ToolContext,

        architect_state: &mut ArchitectRunState,

    ) -> Option<String> {

        tool_pre_gate_block(

            &self.config.run_spec,

            &call.name,

            &call.arguments,

            Some(architect_state),

            Some(&ctx.effective_workspace()),

            ctx.drox_ignore.as_ref(),

            &self.config.engine_tuning,

        )

    }





    async fn apply_read_only_tool_success(

        &self,

        ctx: &ToolContext,

        call: &PendingToolCall,

        value: Value,

        memory_tracker: &mut MemoryTracker,

        architect_state: &mut ArchitectRunState,

        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,

        messages: &mut Vec<Message>,

    ) -> bool {

        memory_tracker.record_tool(&call.name);

        if self.config.run_spec.role_id == RoleId::Architect {

            architect_record_read_only_tool_success(

                self.config.run_spec.role_id,

                &call.name,

                &call.arguments,

                &value,

                architect_state,

            );

        }

        mirror_workspace_map_from_tool(ctx, &call.name, &value).await;

        let for_llm = format_tool_result_for_llm(&call.name, &value);

        if tx

            .send(Ok(AgentEvent::ToolFinish {

                id: call.id.clone(),

                output: value.clone(),

                is_error: false,

            }))

            .await

            .is_err()

        {

            return false;

        }

        messages.push(Message::tool_result(call.id.clone(), for_llm, false));

        true

    }



    /// Évalue la permission pour un tool call. Renvoie `Some(message)` si la
    /// décision finale est un refus (à pousser comme `tool_result` d'erreur),
    /// `None` si le tool peut s'exécuter.
    async fn check_permission(&self, call: &PendingToolCall) -> Option<String> {
        let policy = self.config.permissions.as_ref()?;
        let read_only = crate::permissions::is_read_only_tool(&call.name)
            || self
                .registry
                .get(&call.name)
                .is_some_and(|t| t.is_read_only());
        let decision = policy.evaluate_with_read_only_hint(
            &call.name,
            &call.arguments,
            Some(read_only),
        );
        match decision {
            PermissionDecision::Allow { reason } => {
                debug!(tool = %call.name, ?reason, "tool autorisé");
                None
            }
            PermissionDecision::Deny { reason, message } => {
                warn!(tool = %call.name, ?reason, "tool refusé");
                Some(message)
            }
            PermissionDecision::Ask { reason, message } => {
                debug!(tool = %call.name, ?reason, "tool nécessite confirmation");
                if confirm_with_user(&self.ctx, &call.name, &call.arguments, &message).await {
                    None
                } else {
                    Some(format!("User denied permission for `{}`.", call.name))
                }
            }
        }
    }

    /// Virtual engine tool `internal_plan_write` — no registry wire.
    async fn try_execute_virtual_tool_call(
        &self,
        call: &PendingToolCall,
        architect_state: &mut ArchitectRunState,
        rail_active: bool,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        messages: &mut Vec<Message>,
        memory_tracker: &mut MemoryTracker,
        consecutive_ask_user_question_failures: &mut u32,
    ) -> Option<bool> {
        use crate::orchestration::internal_plan_tool::{
            try_execute_internal_plan_write, TOOL_INTERNAL_PLAN_WRITE,
        };

        if call.name != TOOL_INTERNAL_PLAN_WRITE {
            return None;
        }
        let station = rail_active.then_some(architect_state.rail.station);
        match try_execute_internal_plan_write(architect_state, &call.arguments) {
            Ok(value) => {
                memory_tracker.record_tool(&call.name);
                let for_llm = format_tool_result_for_llm(&call.name, &value);
                if tx
                    .send(Ok(AgentEvent::ToolFinish {
                        id: call.id.clone(),
                        output: value.clone(),
                        is_error: false,
                    }))
                    .await
                    .is_err()
                {
                    return Some(true);
                }
                messages.push(Message::tool_result(call.id.clone(), for_llm, false));
                let snap = internal_plan_snapshot_for_station(architect_state, station);
                refresh_internal_plan_snapshot(messages, snap.as_deref());
                Some(false)
            }
            Err(msg) => {
                if push_tool_error_tracked(
                    tx,
                    messages,
                    call,
                    msg,
                    consecutive_ask_user_question_failures,
                    Some(architect_state),
                )
                .await
                .is_err()
                {
                    return Some(true);
                }
                Some(false)
            }
        }
    }
}

