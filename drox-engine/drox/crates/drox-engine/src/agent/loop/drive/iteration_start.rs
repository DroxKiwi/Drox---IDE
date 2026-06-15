impl Agent {
    /// Préparation d'un tour avant appel LLM. `true` = arrêter `drive_inner`.
    async fn drive_iteration_start(
        &self,
        session: &mut DriveSession,
        tx: &tokio::sync::mpsc::Sender<Result<crate::event::AgentEvent, crate::error::EngineError>>,
    ) -> bool {
        if self.config.run_spec.role_id == crate::run_spec::RoleId::Architect {
            let rail_active = crate::agent::rail::run_rail_active(
                &self.config.engine_tuning,
                self.config.run_spec.role_id,
            );
            crate::orchestration::apply_architect_iteration_start(
                &mut crate::orchestration::ArchitectIterationInput {
                    messages: &mut session.messages,
                    architect_state: &mut session.architect_state,
                    effective_run_objective: session.effective_run_objective.as_deref(),
                    last_todo_pending: session.last_todo_pending,
                    last_todo_in_progress: session.last_todo_in_progress,
                    engine_tuning: &self.config.engine_tuning,
                    rail_active,
                },
            );
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
