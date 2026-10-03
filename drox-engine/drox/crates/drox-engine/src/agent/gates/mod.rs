//! Gates moteur : mutations code, todo_write, mode professeur, session_end.
//!
//! - [`mutation`] — chemins / bash / gate testing
//! - [`todo`] — planification, professeur, step-tracking, recreation, session_end

mod mutation;
mod todo;

pub(crate) use mutation::record_counts_as_code_mutation;
pub(crate) use todo::{
    counts_as_mutating_for_step_tracking, is_professor_run, is_todo_recreation_from_scratch,
    plan_write_gate_satisfied, requires_todo_write_gate, MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED,
    PROFESSOR_DONE_WITHOUT_PLAN, SESSION_END_FORBIDDEN_FOR_MODEL, TODO_RECREATION_BLOCKED,
    TODO_WRITE_FORBIDDEN_IN_PROFESSOR,
};
