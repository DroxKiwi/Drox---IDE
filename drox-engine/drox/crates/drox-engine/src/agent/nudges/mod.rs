//! Engine system nudges — distinct from blocking gates.
//!
//! ≤ 3 active paths in the drive loop: `stall_act`, `schema_error`, `done_only`.

mod done_only;
mod helpers;
mod post_todos_answer;
mod schema_error;
mod stall_act;
mod thinking_supplement;

pub(crate) use done_only::done_only_nudge_prompt;
pub(crate) use helpers::{ask_user_question_loop_nudge, run_objective_system_block};
pub(crate) use schema_error::{
    schema_error_continue_nudge, TODO_WRITE_EMPTY_TODOS, TODO_WRITE_MISSING_TODOS,
};
pub(crate) use stall_act::ACT_STALL_NUDGE_PROMPT;
pub(crate) use post_todos_answer::POST_TODOS_ANSWER_NUDGE_PROMPT;
pub(crate) use thinking_supplement::NATIVE_THINKING_UI_SUPPLEMENT;
