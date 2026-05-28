//! `drox-tools` — implémentations des tools de l'agent.
//!
//! Sprint 1.3 : `file_read`, `file_write`, `delete_path`, `grep`, `glob` + registre thread-safe.
//! Sprint 1.5 : `file_edit` (avec diff unifié), `web_fetch`, `ask_user_question`,
//! `exit_plan_mode`, mécanisme `UserAsker`, mode plan.
//!
//! Tous les tools fs respectent `ToolContext::apply_fs_writes` (apply vs propose)
//! et `ToolContext::plan_mode` (interdit toute écriture).
//!
//! Voir `docs/INVENTAIRE-NOYAU-MOTEUR.md` § 2.3.

mod agent_output;
mod asker;
mod context;
mod delegate_scope;
mod error;
mod path_util;
pub mod git_worktree;
pub mod skills;
pub mod registry;
pub mod scope_deferred;
pub mod session_notes;
mod simple;
pub mod orchestration_delegate;
pub mod subagent;
pub mod subagent_report;
mod tool;

pub use agent_output::{
    agent_output_deliverable_path, agent_output_dir_for_plan_task, agent_output_dir_for_segment,
    new_orchestration_plan_id, sanitize_deliverable_filename, sanitize_output_segment,
    DEFAULT_DELIVERABLE_FILENAME, AGENT_OUTPUT_DIR,
};
pub use asker::{UserAnswer, UserAsker, UserQuestion};
pub use context::ToolContext;
pub use delegate_scope::{
    count_files_in_delegate_scope, DELEGATE_SCOPE_MAX_FILES,
};
pub use error::ToolError;
pub use registry::ToolRegistry;
pub use skills::{format_skills_listing_for_prompt, load_skills_catalog};
pub use scope_deferred::{ScopeDeferredHandle, ScopeDeferredItem};
pub use session_notes::{SessionNote, SessionNotesHandle};
pub use orchestration_delegate::{
    ExecutorTaskRequest, OrchestrationDelegateExecutor, OrchestrationDelegateHookEvent,
    OrchestrationDelegateResult, OrchestrationDelegateEventHook,
};
pub use subagent::{
    RunningExploreJobUi, SubagentCompletedJob, SubagentExecutor, SubagentEventHook, SubagentHookEvent,
    SubagentSettings,
};
pub use subagent_report::{
    SubagentExploreResult, structure_task_async_completed, structure_task_async_pending,
    structure_task_output,
};
pub use simple::{
    ArchitectHelpSnapshot, ArchitectHelpTodoItem, ArchitectHelpTool, AskUserQuestionTool,
    BashTool, CANONICAL_ASK_JSON_EXAMPLE, ExitPlanModeTool, FileEditTool, FileReadTool, FileWriteTool,
    DelegateExecutorTool, GlobTool, GrepTool, LspTool, MemoryListTool, MemoryReadTool,
    NotebookEditTool, ScopeDeferTool, SessionNoteTool, SkillListTool, SkillReadTool, TaskTool,
    normalize_todo_write_payload, TodoWriteTool,
    WebFetchTool, WebSearchTool, WorkspaceMapNoteTool, WorkspaceMapReadTool, register_mcp_tools,
};
pub use tool::{DynTool, Tool};
