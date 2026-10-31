//! Pont nudges : re-exports [`drox_prompts`] + wrapper ask (exemple JSON tools).
//!
//! Les détecteurs prose FR/EN ont été retirés (RULES §6) — intent-write = mécanique
//! `[phase: acting]` sans tool_calls dans `drive.rs`.

use drox_tools::CANONICAL_ASK_JSON_EXAMPLE;

pub(crate) use drox_prompts::{
	context_load_nudge, explore_incomplete_nudge, run_objective_done_nudge,
	run_objective_system_block, step_by_step_todo_nudge, step_explore_kickoff_nudge,
	step_targets_single_file,
	step_without_explore_nudge, unfinished_course_plan_prompt, unfinished_todos_prompt,
	ANALYZING_PHASE_NUDGE, CODE_MUTATION_TESTING_NUDGE, DOC_INGESTION_EXPLORE_ANNEX,
	DONE_ONLY_NUDGE_PROMPT, EXPLORE_RESCUE_PARENT_READ_NUDGE, INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT,
	INTENT_ONLY_WRITE_MAX_NUDGES, INTENT_ONLY_WRITE_NUDGE_PROMPT, LOOP_DETECTED_NUDGE_PROMPT,
	LOOP_FORCE_CONCLUDE_PROMPT, LOOP_TOOL_FAMILY_NUDGE_PROMPT,
	MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
	MISSING_ANSWERING_PROMPT, NUDGE_PROMPT, PARENT_HEAVY_READ_NUDGE,
	EXPLORE_ARTIFACT_READ_FAIL_NUDGE, EXPLORE_COVERED_REREAD_NUDGE, MICRO_ACT_WRITE_NUDGE,
	PARENT_HEAVY_READ_NUDGE_THRESHOLD, POST_ASK_ACTING_NUDGE, POST_EXPLORE_STALL_ACT_NUDGE,
	POST_EXPLORE_STALL_READ_THRESHOLD, POST_MERGE_CLOSURE_NUDGE,
	REPEATED_FILE_READ_NUDGE, REPEATED_FILE_READ_NUDGE_THRESHOLD, ROTATING_FILE_READ_NUDGE,
	ROTATING_FILE_READ_REINJECT_EVERY,
	STEP_WITHOUT_EXPLORE_NUDGE_THRESHOLD,
	WORK_PLAN_FRAME_NUDGE, WORK_WITHOUT_PLAN_NUDGE, WORK_WITHOUT_PLAN_NUDGE_THRESHOLD,
	LOCAL_EMPTY_TURN_NUDGE, LOCAL_EXPLORE_KICKOFF_NUDGE, LOCAL_FINAL_ANSWER_PROMPT,
	LOCAL_SOFT_CLOSE_CHECK_NUDGE, LOCAL_TEXTUAL_TOOL_NUDGE, LOCAL_TEXTUAL_TOOL_TOOLS_OFF_NUDGE,
	reply_has_textual_tool_call,
};

/// Wrapper : injecte l'exemple JSON canonique de `drox-tools` (évite cycle crates).
#[must_use]
pub(crate) fn ask_user_question_loop_nudge() -> String {
	drox_prompts::ask_user_question_loop_nudge(CANONICAL_ASK_JSON_EXAMPLE)
}
