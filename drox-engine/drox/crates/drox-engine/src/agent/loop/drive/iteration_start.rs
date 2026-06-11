impl Agent {
    /// Préparation d'un tour avant appel LLM. `true` = arrêter `drive_inner`.
    async fn drive_iteration_start(
        &self,
        session: &mut DriveSession,
        tx: &tokio::sync::mpsc::Sender<Result<crate::event::AgentEvent, crate::error::EngineError>>,
    ) -> bool {
        if self.config.run_spec.role_id == crate::run_spec::RoleId::Architect {
            crate::agent::state::refresh_architect_run_snapshot(
                &mut session.messages,
                &crate::orchestration::architect_run_context_block_per_turn(
                    &session.architect_state,
                    session.effective_run_objective.as_deref(),
                ),
            );
            if crate::agent::rail::run_rail_active(
                &self.config.engine_tuning,
                self.config.run_spec.role_id,
            ) {
                let open_todos = crate::agent::rail::OpenTodoCounts {
                    pending: session.last_todo_pending,
                    in_progress: session.last_todo_in_progress,
                };
                crate::agent::rail::on_turn_start(
                    &mut session.architect_state.rail,
                    &session.messages,
                    false,
                    open_todos,
                );
                let rail_focus = session
                    .architect_state
                    .current_focus_task_line()
                    .map(|(id, label, _)| (id, label));
                let focus = rail_focus
                    .as_ref()
                    .map(|(id, label)| (id.as_str(), label.as_str()));
                crate::agent::rail::refresh_snapshot(
                    &mut session.messages,
                    &session.architect_state.rail,
                    focus,
                    open_todos,
                );
            }
        }

        if self
            .maybe_snip(
                &mut session.messages,
                tx,
                &mut session.live_compaction_seq,
                &session.memory_tracker,
                &mut session.architect_state,
                session.effective_run_objective.as_deref(),
            )
            .await
            .is_err()
        {
            return true;
        }

        if self.emit_context_usage(&session.messages, tx).await.is_err() {
            return true;
        }

        false
    }
}
