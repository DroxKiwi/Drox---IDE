impl Agent {
    async fn emit_context_usage(
        &self,
        messages: &[Message],
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    ) -> Result<(), ()> {
        let Some(policy) = self.config.context.as_ref() else {
            return Ok(());
        };
        let parent_tokens = policy.count_tokens(messages);
        let parent_budget = policy.budget().effective_window();
        tx.send(Ok(AgentEvent::ContextUsage {
            parent_tokens,
            parent_budget: Some(parent_budget),
        }))
        .await
        .map_err(|_| ())
    }

    async fn maybe_snip(
        &self,
        messages: &mut Vec<Message>,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        live_compaction_seq: &mut u32,
        memory_tracker: &MemoryTracker,
        architect_state: &mut ArchitectRunState,
        effective_run_objective: Option<&str>,
    ) -> Result<(), ()> {
        let Some(policy) = self.config.context.as_ref() else {
            return Ok(());
        };
        let mut tokens = policy.count_tokens(messages);
        let mut state = policy.budget().evaluate(tokens);
        if !state.above_autocompact {
            return Ok(());
        }
        if let Some(mc) = policy.maybe_microcompact(messages) {
            tokens = policy.count_tokens(messages);
            debug!(
                tools_cleared = mc.tools_cleared,
                blocks_cleared = mc.blocks_cleared,
                tokens_after = tokens,
                "microcompact applied"
            );
            state = policy.budget().evaluate(tokens);
            if !state.above_autocompact {
                return Ok(());
            }
        }
        if self.config.engine_tuning.context_snip_enabled
            && let Some(report) = policy.maybe_snip(messages)
        {
            let tokens_before_snip = tokens;
            tokens = policy.count_tokens(messages);
            debug!(
                tokens_before = tokens_before_snip,
                tokens_after = tokens,
                tokens_freed = report.tokens_freed,
                blocks_snipped = report.blocks_snipped,
                "context snip applied"
            );
            tx.send(Ok(AgentEvent::ContextSnip {
                tokens_freed: report.tokens_freed,
                blocks_snipped: report.blocks_snipped,
                tokens_used_after: tokens,
            }))
            .await
            .map_err(|_| ())?;
            state = policy.budget().evaluate(tokens);
        }
        if !state.above_autocompact {
            return Ok(());
        }
        let Some(memory) = self.config.memory.as_ref() else {
            return Ok(());
        };
        let live = crate::compaction::LiveCompactSettings::from_tuning(&self.config.engine_tuning);
        if let Some(report) = crate::compaction::compact_until_budget(
            memory.llm.as_ref(),
            memory.compaction_prompt.as_str(),
            messages,
            policy,
            &memory.compaction_config,
            &live,
        )
        .await
        {
            *live_compaction_seq = live_compaction_seq.saturating_add(1);
            let transcript_sid = self
                .config
                .transcript_session_id
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("ses_none");
            let fingerprint = if self.config.workspace_fingerprint.is_empty() {
                self.ctx.workspace_root.as_str().to_string()
            } else {
                self.config.workspace_fingerprint.clone()
            };
            let ccs = ContextChunkSummaryV1 {
                schema_version: 1,
                id: format!("ccs_{}", Uuid::new_v4()),
                workspace_fingerprint: fingerprint,
                transcript_session_id: transcript_sid.to_string(),
                created_at: chrono::Utc::now(),
                compaction_seq: *live_compaction_seq,
                tokens_before: report.tokens_before,
                tokens_after: report.tokens_after,
                summary_text: report.summary_text().to_string(),
                files_touched: report.files_touched().to_vec(),
                tags_suggested: Vec::new(),
                checkpoint_message_id: None,
            };
            tx.send(Ok(AgentEvent::ContextCompacted {
                tokens_before: report.tokens_before,
                tokens_after: report.tokens_after,
                messages_removed: report.messages_removed,
                usage: report.usage,
                context_chunk_summary: Some(ccs),
            }))
            .await
            .map_err(|_| ())?;
            debug!(
                tokens_before = report.tokens_before,
                tokens_after = report.tokens_after,
                "live compaction — persistance session (contexte plein)"
            );
            if self.config.run_spec.role_id == RoleId::Architect {
                inject_architect_run_snapshot_after_checkpoint(
                    messages,
                    &architect_run_context_block_compaction(
                        architect_state,
                        effective_run_objective,
                    ),
                );
            }
            self.maybe_persist_session(
                messages,
                memory_tracker,
                tx,
                true,
                Some(&report.compaction),
            )
            .await;
        }
        Ok(())
    }
}
