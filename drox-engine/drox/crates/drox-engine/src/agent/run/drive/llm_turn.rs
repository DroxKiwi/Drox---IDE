//! Appel LLM, consommation du stream, message assistant.

#![allow(unused_imports)]
#![allow(clippy::too_many_lines)]

use super::super::super::loop_detect::TurnOutcome;
use super::super::Agent;
use super::Turn;
use super::helpers::{bash_stopped_if_requested, history_probe_snapshot, tool_apply_failed};
use super::state::DriveState;

pub(super) enum LlmStep {
    Stop,
    RetryAfterCompact,
    Ready(TurnOutcome),
}

use std::collections::{HashMap, VecDeque};

use drox_hooks::{PostHookOutcome, PreHookOutcome, ToolHookContext};
use drox_tools::ToolError;
use drox_types::{Content, Message, Role, StopReason, ToolUseId, Usage};
use futures::{StreamExt, stream};
use serde_json::Value;
use tokio::sync::mpsc;
use tracing::debug;

use crate::error::EngineError;
use crate::event::{AgentEvent, HistoryProbeEntry, Phase};
use crate::memory::MemoryTracker;
use crate::tool_orchestration::{ToolCallBatch, partition_tool_calls, serial_tool_call_batches};
use crate::tool_progress::ToolProgressBridge;

use super::super::super::config::EngineProfile;
use super::super::super::consume_llm_stream::{consume_stream, push_assistant_message};
use super::super::super::context_load::{
    ContextLoadSnapshot, score as score_context_load, should_inject as should_inject_context_load,
    snapshot_from_glob_value,
};
use super::super::super::dispatch::{
    build_tool_specs, format_tool_result_for_llm_with_profile, mirror_workspace_map_from_tool,
    push_tool_error_tracked,
};
use super::super::super::gates::{
    counts_as_mutating_for_step_tracking, plan_write_gate_satisfied, record_counts_as_code_mutation,
};
use super::super::super::loop_close::{
    ENGINE_CLOSURE_EMPTY_REPLY, ENGINE_CLOSURE_TEXTUAL_TOOL_REPLY, emit_engine_closure,
    emit_synthetic_done,
};
use super::super::super::loop_detect::{LoopDecision, LoopDetector, PendingToolCall};
use super::super::super::nudges::{
    DOC_INGESTION_EXPLORE_ANNEX, DONE_ONLY_NUDGE_PROMPT, EXPLORE_ARTIFACT_READ_FAIL_NUDGE,
    EXPLORE_COVERED_REREAD_NUDGE, EXPLORE_RESCUE_PARENT_READ_NUDGE,
    INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT, INTENT_ONLY_WRITE_MAX_NUDGES,
    INTENT_ONLY_WRITE_NUDGE_PROMPT, LOCAL_EMPTY_TURN_NUDGE, LOCAL_EXPLORE_KICKOFF_NUDGE,
    LOCAL_FINAL_ANSWER_PROMPT, LOCAL_SOFT_CLOSE_CHECK_NUDGE, LOCAL_TEXTUAL_TOOL_NUDGE,
    LOCAL_TEXTUAL_TOOL_TOOLS_OFF_NUDGE, LOOP_DETECTED_NUDGE_PROMPT, LOOP_FORCE_CONCLUDE_PROMPT,
    LOOP_TOOL_FAMILY_NUDGE_PROMPT, MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
    MICRO_ACT_WRITE_NUDGE, MISSING_ANSWERING_PROMPT, NUDGE_PROMPT, PARENT_HEAVY_READ_NUDGE,
    PARENT_HEAVY_READ_NUDGE_THRESHOLD, PARENT_HEAVY_READ_PREFIX, POST_ASK_ACTING_NUDGE,
    POST_EXPLORE_STALL_ACT_NUDGE, POST_EXPLORE_STALL_READ_THRESHOLD, POST_MERGE_CLOSURE_NUDGE,
    REPEATED_FILE_READ_NUDGE, REPEATED_FILE_READ_NUDGE_THRESHOLD, ROTATING_FILE_READ_NUDGE,
    ROTATING_FILE_READ_REINJECT_EVERY, STEP_WITHOUT_EXPLORE_NUDGE_THRESHOLD, WORK_PLAN_FRAME_NUDGE,
    WORK_WITHOUT_PLAN_NUDGE, WORK_WITHOUT_PLAN_NUDGE_THRESHOLD, WORK_WITHOUT_PLAN_PREFIX,
    ask_user_question_loop_nudge, context_load_nudge, drop_stale_step_explore_reminders,
    drop_step_by_step_heads_up, drop_system_with_prefix, explore_incomplete_nudge,
    reply_has_textual_tool_call, run_objective_done_nudge, run_objective_system_block,
    step_by_step_todo_nudge, step_explore_kickoff_nudge, step_skips_explore_kickoff,
    step_without_explore_nudge, unfinished_todos_prompt,
};
use super::super::super::phase::{counts_as_pre_plan_activity, user_blocks_plain_text};
use super::super::super::session_intent::{SessionFrames, classify_session_user_intent};
use super::super::super::situation::{
    ExploreCoveredPaths, SituationSnapshot, advance_transcript_cursor_for_insert,
    clear_rotating_file_read_window, completed_todos_hint, counts_as_parent_heavy_read,
    explore_deliverable_empty, first_in_progress_todo_id, forget_file_read_after_mutation,
    next_todo_from_output, note_rotating_file_read, note_successful_file_read,
    note_task_tool_success, path_from_file_tool, repeated_file_read_stub_value,
    rotating_file_read_should_nudge, should_stub_repeated_file_read, task_outcome_telemetry,
    upsert_situation_card,
};
use super::super::super::prepare_turn::estimate_request_load;
use super::super::super::todo_text_salvage::salvage_inline_todo_write;

impl Agent {
    pub(super) async fn llm_turn(
        &self,
        iter: usize,
        st: &mut DriveState,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    ) -> LlmStep {
        let transport = super::super::super::history_transport::for_model(&st.messages);
        if self.config.history_probe {
            let entries = history_probe_snapshot(&transport);
            if tx
                .send(Ok(AgentEvent::HistoryProbe { entries }))
                .await
                .is_err()
            {
                return LlmStep::Stop;
            }
        }

        if self.config.run_capture {
            if let Some(path) = self.config.run_capture_path.as_ref() {
                super::super::run_capture::append_llm_request(
                    path,
                    iter.saturating_add(1),
                    st.capture_loop,
                    &st.messages,
                    &transport,
                )
                .await;
            }
        }

        let turn_tools = if st.loop_tools_disabled {
            Vec::new()
        } else {
            st.tool_specs.clone()
        };

        if let Some(policy) = self.config.context.as_ref() {
            let load = estimate_request_load(policy, &transport, &turn_tools, None);
            let parent_tokens = load.request_tokens;
            if parent_tokens > 0
                && tx
                    .send(Ok(AgentEvent::ContextUsage { parent_tokens }))
                    .await
                    .is_err()
            {
                return LlmStep::Stop;
            }
        }

        let options = self.config.chat_options.clone().with_tools(turn_tools);

        let stream = match self.llm.stream_chat(transport, options).await {
            Ok(s) => s,
            Err(err) => {
                if err.is_context_length_exceeded() && !st.context_overflow_retry_used {
                    st.context_overflow_retry_used = true;
                    let overflow_tools = if st.loop_tools_disabled {
                        &[] as &[_]
                    } else {
                        st.tool_specs.as_slice()
                    };
                    if self
                        .try_context_overflow_recovery(
                            &mut st.messages,
                            overflow_tools,
                            &tx,
                            &mut st.transcript_cursor,
                            st.leading_injected_systems,
                            st.last_turn_input_tokens,
                        )
                        .await
                    {
                        return LlmStep::RetryAfterCompact;
                    }
                }
                let _ = tx.send(Err(EngineError::Llm(err))).await;
                return LlmStep::Stop;
            }
        };

        let native_thinking_ui = self.config.chat_options.think == Some(true);

        let Ok(mut outcome) = consume_stream(
            stream,
            &tx,
            native_thinking_ui,
            &st.ctx.workspace_root,
            st.done_only_nudge_sent,
        )
        .await
        else {
            return LlmStep::Stop; // canal consommateur fermé
        };

        if outcome.tool_calls.is_empty() && !st.loop_tools_disabled {
            if let Some(salvaged) = salvage_inline_todo_write(&outcome.text) {
                debug!(
                    leftover = salvaged.cleaned_text.len(),
                    "salvage inline todo_write JSON from assistant text"
                );
                outcome.text = salvaged.cleaned_text;
                let call = PendingToolCall {
                    id: ToolUseId::new(),
                    name: "todo_write".into(),
                    arguments: salvaged.arguments,
                };
                if tx
                    .send(Ok(AgentEvent::ToolStart {
                        id: call.id.clone(),
                        name: call.name.clone(),
                        arguments: call.arguments.clone(),
                    }))
                    .await
                    .is_err()
                {
                    return LlmStep::Stop;
                }
                outcome.tool_calls.push(call);
                outcome.reason = StopReason::ToolUse;
            }
        }

        if outcome.usage.input_tokens > 0 {
            st.last_turn_input_tokens = outcome.usage.input_tokens as usize;
        }
        if (outcome.usage.input_tokens > 0 || outcome.usage.output_tokens > 0)
            && tx
                .send(Ok(AgentEvent::TurnUsage {
                    usage: outcome.usage.clone(),
                }))
                .await
                .is_err()
        {
            return LlmStep::Stop;
        }

        if self.config.run_capture {
            if let Some(path) = self.config.run_capture_path.as_ref() {
                super::super::run_capture::append_llm_result(
                    path,
                    iter.saturating_add(1),
                    &outcome,
                )
                .await;
            }
        }

        push_assistant_message(&mut st.messages, &outcome);
        if let Err(e) = self
            .flush_transcript(&st.messages, &mut st.transcript_cursor)
            .await
        {
            let _ = tx.send(Err(e)).await;
            return LlmStep::Stop;
        }
        LlmStep::Ready(outcome)
    }
}
