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
mod error;
mod path_util;
pub mod git_worktree;
pub mod skills;
pub mod registry;
pub mod scope_deferred;
pub mod session_notes;
mod simple;
mod tool;

pub use agent_output::{
    agent_output_deliverable_path, agent_output_dir_for_plan_task, agent_output_dir_for_segment,
    new_orchestration_plan_id, sanitize_deliverable_filename, sanitize_output_segment,
    DEFAULT_DELIVERABLE_FILENAME, AGENT_OUTPUT_DIR,
};
pub use asker::{UserAnswer, UserAsker, UserQuestion};
pub use context::ToolContext;
pub use error::ToolError;
pub use registry::ToolRegistry;
pub use skills::{format_skills_listing_for_prompt, load_skills_catalog};
pub use scope_deferred::{ScopeDeferredHandle, ScopeDeferredItem};
pub use session_notes::{SessionNote, SessionNotesHandle};
pub use simple::{
    ArchitectHelpSnapshot, ArchitectHelpTodoItem, ArchitectHelpTool, AskUserQuestionTool,
    BashTool, CANONICAL_ASK_JSON_EXAMPLE, ExitPlanModeTool, FileEditTool, FileReadTool, FileWriteTool,
    GlobTool, GrepTool, LspTool, MemoryListTool, MemoryReadTool,
    NotebookEditTool, ScopeDeferTool, SessionNoteTool, SkillListTool, SkillReadTool,
    normalize_todo_write_payload, TodoWriteTool,
    WebFetchTool, WebSearchTool, WorkspaceMapNoteTool, WorkspaceMapReadTool, register_mcp_tools,
};
pub use tool::{DynTool, Tool};
