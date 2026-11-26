//! État mutable d'un `drive_inner`. Les champs portent les locaux de l'ancienne fonction.

use std::collections::{HashMap, HashSet, VecDeque};

use drox_llm::ToolSpec;
use drox_tools::ToolContext;
use drox_types::Message;

use super::super::super::config::EngineProfile;
use super::super::super::context_load::ContextLoadSnapshot;
use super::super::super::loop_detect::{LoopDecision, LoopDetector};
use super::super::super::session_intent::SessionFrames;
use super::super::super::situation::ExploreCoveredPaths;
use crate::memory::MemoryTracker;

pub(super) struct DriveState {
    pub(super) profile: EngineProfile,
    pub(super) engine_closure: bool,
    pub(super) plan_nudges: bool,
    pub(super) same_message_tools: bool,
    pub(super) tool_specs: Vec<ToolSpec>,
    pub(super) ctx: ToolContext,
    pub(super) memory_tracker: MemoryTracker,
    pub(super) messages: Vec<Message>,
    pub(super) session_frames: SessionFrames,
    pub(super) transcript_cursor: usize,
    pub(super) seen_answering_in_run: bool,
    pub(super) saw_successful_todo_write_in_run: bool,
    pub(super) last_todo_pending: u64,
    pub(super) last_todo_in_progress: u64,
    pub(super) last_todo_ids: HashSet<String>,
    pub(super) last_todo_was_all_completed: bool,
    pub(super) mutating_tools_since_last_todo: u32,
    pub(super) loop_detector: LoopDetector,
    pub(super) loop_tools_disabled: bool,
    pub(super) final_answer_forced: bool,
    pub(super) local_empty_turn_nudge_sent: bool,
    pub(super) local_textual_tool_nudge_sent: bool,
    pub(super) local_soft_close_check_sent: bool,
    pub(super) done_only_nudge_sent: bool,
    pub(super) consecutive_ask_user_question_failures: u32,
    pub(super) live_compaction_seq: u32,
    pub(super) run_objective_reminder_sent: bool,
    pub(super) consecutive_intent_only_write_nudges: u32,
    pub(super) files_touched_in_run: Vec<String>,
    pub(super) last_tool_error: Option<String>,
    pub(super) last_todo_next: Option<String>,
    pub(super) last_todo_completed_hint: u64,
    pub(super) parent_heavy_read_streak: u32,
    pub(super) edit_repair_pending: bool,
    pub(super) parent_heavy_read_nudge_sent: bool,
    pub(super) doc_ingestion_annex_sent: bool,
    pub(super) work_plan_frame_nudge_sent: bool,
    pub(super) local_explore_kickoff_sent: bool,
    pub(super) pre_plan_activity_count: u32,
    pub(super) work_without_plan_nudge_sent: bool,
    pub(super) last_in_progress_todo_id: Option<String>,
    pub(super) pending_step_explore_nudge: Option<(String, Option<String>)>,
    pub(super) step_parent_activity_count: u32,
    pub(super) step_had_task_success: bool,
    pub(super) step_without_explore_nudge_sent: bool,
    pub(super) pending_context_load: Option<ContextLoadSnapshot>,
    pub(super) context_load_nudge_sent: bool,
    pub(super) last_context_load_recommended_n: u32,
    pub(super) pending_explore_incomplete: Option<(u64, u64)>,
    pub(super) explore_rescue_active: bool,
    pub(super) explore_rescue_nudge_sent: bool,
    pub(super) file_read_success_counts: HashMap<String, u32>,
    pub(super) repeated_file_read_nudge_sent: bool,
    pub(super) recent_file_reads: VecDeque<String>,
    pub(super) rotating_file_read_nudge_sent: bool,
    pub(super) rotating_last_nudge_at: usize,
    pub(super) pending_post_merge_closure_nudge: bool,
    pub(super) pending_micro_act_write_nudge: bool,
    pub(super) micro_act_write_nudge_sent: bool,
    pub(super) explore_covered_paths: ExploreCoveredPaths,
    pub(super) pending_explore_covered_reread_nudge: bool,
    pub(super) explore_covered_reread_nudge_sent: bool,
    pub(super) post_explore_window: bool,
    pub(super) post_explore_read_streak: u32,
    pub(super) pending_post_explore_stall_nudge: bool,
    pub(super) post_explore_stall_nudge_sent: bool,
    pub(super) pending_explore_artifact_read_fail_nudge: bool,
    pub(super) pending_post_ask_acting_nudge: bool,
    pub(super) task_tool_available: bool,
    pub(super) leading_injected_systems: usize,
    pub(super) permission_mode_label: Option<String>,
    pub(super) capture_loop: &'static str,
    pub(super) deferred_pre_tool_loop: Option<LoopDecision>,
    pub(super) round_tool_outputs: String,
    /// Derniers `input_tokens` remontés par le provider (ancrage compaction).
    pub(super) last_turn_input_tokens: usize,
    /// Une récupération basic après overflow provider par tour LLM.
    pub(super) context_overflow_retry_used: bool,
}
