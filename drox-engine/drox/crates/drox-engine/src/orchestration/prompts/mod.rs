//! System prompts and user messages per orchestration role (`role_split`).
//!
//! Arborescence : [`system`] (blocs `.md` + gates) · [`vars`] · [`registry`].

mod architect_discussion;
mod architect_edit;
mod architect_messages;
mod executor;
pub mod registry;
pub mod system;
pub mod vars;

pub use architect_discussion::{
    architect_discussion_system_prompt, architect_discussion_system_prompt_default,
    architect_discussion_system_prompt_for_start_run,
    architect_discussion_user_message, ARCHITECT_DISCUSSION_CORE_PROMPT,
    ARCHITECT_DISCUSSION_SYSTEM_PROMPT,
};
pub use architect_edit::{
    architect_edit_system_prompt_core_for_run, architect_edit_system_prompt_core_for_run_vars,
    architect_parallel_slots_supplement,
};
pub use system::{
    architect_run_context_block, architect_run_context_block_compaction,
    architect_run_context_block_per_turn,
    blocks::tools::{
        architect_tool_short_description, is_architect_read_tool_for_delegate_cap,
        tool_supplements_all_architect,
    },
};
pub use architect_messages::architect_user_message;
pub use executor::{
    executor_delegated_task_block, executor_user_message_from_delegate, EXECUTOR_NATIVE_THINKING_SUPPLEMENT,
    EXECUTOR_ROLE_SUPPLEMENT, EXECUTOR_SYSTEM_PROMPT,
};
pub use registry::PromptBlockId;
pub use vars::{PromptVars, StrictnessPreset};

/// Liste outils affichée dans les rappels architecte (wire ≠ registre complet).
pub(crate) const ARCHITECT_TOOLS: &str =
    "ask_user_question, delegate_executor, file_read, glob, grep, lsp, memory_list, memory_read, todo_write, workspace_map_read";

pub(crate) const EXECUTOR_TOOLS: &str = "bash, file_edit, file_read, file_write, glob, grep, lsp";
