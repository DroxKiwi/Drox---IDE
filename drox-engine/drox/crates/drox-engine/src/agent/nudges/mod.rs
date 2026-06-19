//! Engine system nudges — distinct from blocking gates.

mod answering_too_early;
mod done_only;
mod helpers;
mod internal_plan;
mod post_verify;
mod schema_error;
mod text_tool_marker;
mod thinking_supplement;

pub(crate) use answering_too_early::{
    is_premature_answering_turn, ANSWERING_TOO_EARLY_NUDGE,
};
pub(crate) use done_only::done_only_nudge_prompt;
pub(crate) use helpers::{ask_user_question_loop_nudge, run_objective_system_block};
pub(crate) use internal_plan::{pre_answering_plan_nudge, stale_plan_nudge};
pub(crate) use schema_error::{
    schema_error_continue_nudge, schema_error_forced_answering_nudge, SchemaErrorNudgeContext,
    SCHEMA_ERROR_CONTINUE_MAX,
};
pub(crate) use text_tool_marker::{
    assistant_text_has_tool_markers, has_tool_results_since_user, text_tool_marker_nudge,
};
pub(crate) use post_verify::VERIFY_BASH_RETRY_NUDGE_PROMPT;
pub(crate) use thinking_supplement::NATIVE_THINKING_UI_SUPPLEMENT;
