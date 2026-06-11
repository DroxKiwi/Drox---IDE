impl Agent {
    async fn flush_transcript(
        &self,
        messages: &[Message],
        cursor: &mut usize,
    ) -> Result<(), EngineError> {
        let Some(ts) = self.config.transcript.as_ref() else {
            return Ok(());
        };
        let start = (*cursor).min(messages.len());
        for m in &messages[start..] {
            if matches!(m.role, Role::System) {
                continue;
            }
            let rec = drox_session::ChatMessageRecord::new(m);
            ts.sink.append_record(&rec).await?;
        }
        *cursor = messages.len();
        Ok(())
    }


    async fn maybe_persist_session(
        &self,
        messages: &[Message],
        tracker: &MemoryTracker,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        after_live_compaction: bool,
        live_compaction: Option<&crate::compaction::CompactionResult>,
    ) {
        let Some(memory) = self.config.memory.as_ref() else {
            return;
        };
        if !after_live_compaction && !tracker.is_non_trivial() {
            debug!("memory: run trivial, no persistence");
            return;
        }
        let fallback = first_user_text(messages).unwrap_or_else(|| "session".to_string());
        let persisted = if let Some(comp) = live_compaction {
            persist_compaction_result(memory, comp, &fallback).await
        } else {
            persist_run(memory, messages, &fallback).await
        };
        match persisted {
            Ok(persisted) => {
                debug!(
                    slug = %persisted.slug,
                    path = %persisted.path,
                    "memory: session persisted (emitting MemoryPersisted)"
                );
                let _ = tx
                    .send(Ok(AgentEvent::MemoryPersisted {
                        slug: persisted.slug,
                        path: persisted.path.to_string(),
                        objective: persisted.result.objective,
                        usage: persisted.result.usage,
                    }))
                    .await;
            }
            Err(e) => {
                warn!(
                    error = %e,
                    "memory: persistence failed Ã¢â‚¬â€ run still closes cleanly"
                );
            }
        }
    }

}
