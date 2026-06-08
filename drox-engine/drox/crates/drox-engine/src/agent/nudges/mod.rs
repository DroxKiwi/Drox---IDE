//! Rappels `system` injectés par le moteur — distincts des **gates** bloquantes.
//!
//! Les nudges ne classifient pas le message utilisateur ; ils rappellent le protocole
//! (`[phase: …]`, `[discussion: done]`, clôture, etc.) selon le rôle.

mod architect;
mod executor;
mod exploration;
mod helpers;
mod loop_intervention;
mod router;
mod templates;
mod standard;

pub(crate) use exploration::ANALYZING_PHASE_NUDGE;
pub(crate) use helpers::{
    ask_user_question_loop_nudge, explore_jobs_pending_nudge, run_objective_system_block,
    step_by_step_todo_nudge,
};
pub(crate) use standard::{
    MUTATING_TOOL_BEFORE_TODO_WRITE_NUDGE, MUTATING_TOOLS_FOR_STEP_TRACKING,
    NATIVE_THINKING_UI_SUPPLEMENT,
};
pub(crate) use architect::{
    architect_cycle_sanity_block_done_prompt, architect_cycle_sanity_nudge_prompt,
    architect_no_work_nudge_prompt, ARCHITECT_DELEGATE_AFTER_MUTATIONS_NUDGE,
    ARCHITECT_DELEGATE_AFTER_READS_NUDGE, ARCHITECT_RUN_CLOSABLE_NUDGE_PROMPT,
};
pub(crate) use loop_intervention::{
    loop_intervention_level, loop_intervention_ui_message, loop_recenter_user_message,
    LOOP_DETECTED_SYSTEM_NUDGE,
};
pub(crate) use router::{done_only_nudge_prompt, nudge_prompt};
