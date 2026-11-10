//! Exécution des lots d'outils (série ou parallèle), sans fusion des deux chemins.

#![allow(unused_imports)]
#![allow(clippy::too_many_lines)]

use super::super::super::loop_detect::TurnOutcome;
use super::super::Agent;
use super::Turn;
use super::helpers::{bash_stopped_if_requested, history_probe_snapshot, tool_apply_failed};
use super::state::DriveState;

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
use super::super::super::todo_text_salvage::salvage_inline_todo_write;

mod parallel;
mod serial;

impl Agent {
    pub(super) async fn run_tool_batches(
        &self,
        st: &mut DriveState,
        tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
        outcome: &mut TurnOutcome,
    ) -> Turn {
        // GLM-4.7-Flash bat parfois `[file_edit, todo_write]` ou
        // `[bash, todo_write]` dans le même tour. Sans réordonnement, le
        // mutateur rate la gate `MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED`,
        // alors que le modèle voulait bien planifier ET muter d'une
        // traite. On respecte l'intention en forçant l'ordre logique
        // d'exécution : `todo_write` d'abord, le reste ensuite. Le
        // mapping `tool_use_id ↔ tool_result` reste correct (l'API
        // ré-aligne via les ids, pas l'index de liste).
        //
        // Note : depuis la relax de la gate aux read-only (un `glob` ou
        // `file_read` initial passe librement), ce réordonnement est
        // surtout utile pour les batchs contenant des mutations. Mais
        // il reste pertinent dans le cas général « le modèle a tout
        // planifié dans une seule volée ».
        //
        // Ne s'applique qu'au tout premier `todo_write` du run : une
        // fois la gate satisfaite, les batchs ultérieurs respectent
        // l'ordre demandé par le modèle (parfois utile pour mettre à
        // jour la to-do AVANT et le code APRÈS).
        if !plan_write_gate_satisfied(st.saw_successful_todo_write_in_run) {
            let plan_tool = "todo_write";
            if let Some(idx) = outcome.tool_calls.iter().position(|c| c.name == plan_tool) {
                if idx > 0 {
                    let promoted = outcome.tool_calls.remove(idx);
                    outcome.tool_calls.insert(0, promoted);
                    debug!(
                        from_idx = idx,
                        tool = plan_tool,
                        "plan tool promu en tête (batch détecté avant gate satisfaite)"
                    );
                }
            }
        }

        let tool_names: Vec<&str> = outcome.tool_calls.iter().map(|c| c.name.as_str()).collect();
        // Small local et local capable : un outil après l'autre.
        // Le full protocol garde les lots parallèles.
        let batches = if st.profile.is_local() {
            serial_tool_call_batches(tool_names.len())
        } else {
            partition_tool_calls(&tool_names, &self.registry)
        };
        st.round_tool_outputs = String::new();

        for batch in batches {
            let step = match batch {
                ToolCallBatch::Parallel(indices) => {
                    self.run_parallel_batch(st, tx, outcome, indices).await
                }
                ToolCallBatch::Serial(indices) => {
                    self.run_serial_batch(st, tx, outcome, indices).await
                }
            };
            if matches!(step, Turn::Stop) {
                return Turn::Stop;
            }
        }
        Turn::Proceed
    }
}
