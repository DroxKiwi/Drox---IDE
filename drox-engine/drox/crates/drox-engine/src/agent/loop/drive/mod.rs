// Boucle `drive_inner` — orchestration boot → tour LLM → post-assistant.

use drox_llm::ToolSpec;

/// État mutable partagé sur tout le run `drive_inner`.
pub(super) struct DriveSession {
    pub ctx: ToolContext,
    pub memory_tracker: MemoryTracker,
    pub messages: Vec<Message>,
    pub transcript_cursor: usize,
    /// Index du tour LLM courant (engine-trace).
    pub llm_iter: u32,
    pub seen_answering_in_run: bool,
    pub saw_successful_todo_write_in_run: bool,
    pub last_todo_pending: u64,
    pub last_todo_in_progress: u64,
    pub effective_run_objective: Option<String>,
    /// Brief utilisateur qui exige une mutation (`file_edit` / `file_write`, …).
    pub mutation_expected: bool,
    pub consecutive_ask_user_question_failures: u32,
    pub live_compaction_seq: u32,
    pub architect_state: ArchitectRunState,
    pub final_answer_guard: FinalAnswerGuard,
    pub consecutive_todo_completion_gate_failures: u32,
    pub last_usage: Usage,
    pub last_stop_reason: StopReason,
    pub base_tool_specs: Vec<ToolSpec>,
}

impl Agent {
    pub(crate) async fn drive_inner(
        self,
        history: Vec<Message>,
        user_blocks: Vec<Content>,
        tx: mpsc::Sender<Result<AgentEvent, EngineError>>,
    ) {
        let Some(mut session) = self.drive_boot(history, user_blocks, &tx).await else {
            return;
        };

        for iter in 0..self.config.max_iterations {
            tracing::debug!(
                iter,
                seen_answering_in_run = session.seen_answering_in_run,
                saw_successful_todo_write_in_run = session.saw_successful_todo_write_in_run,
                last_todo_pending = session.last_todo_pending,
                last_todo_in_progress = session.last_todo_in_progress,
                "tour LLM"
            );

            if self.drive_iteration_start(&mut session, &tx).await {
                return;
            }

            let Some(mut outcome) = self.drive_llm_turn(&mut session, &tx).await else {
                return;
            };

            if self
                .drive_post_assistant(&mut session, &mut outcome, &tx)
                .await
            {
                return;
            }
        }

        let _ = tx
            .send(Err(EngineError::MaxIterations(self.config.max_iterations)))
            .await;
    }
}

include!("boot.rs");
include!("iteration_start.rs");
include!("llm_turn.rs");
include!("post_assistant.rs");
