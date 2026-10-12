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

mod user_ask;
mod tool_progress;
mod tool_context;
mod diff_util;
mod error;
mod path_util;
pub mod git_worktree;
pub mod skills;
pub mod registry;
pub mod scope_deferred;
pub mod session_notes;
mod simple;
pub mod subagent;
mod tool;

pub use user_ask::{UserAnswer, UserAsker, UserQuestion};
pub use tool_progress::{ShellProgressUpdate, TextProgressUpdate, ToolProgressSink};
pub use tool_context::ToolContext;
pub use error::ToolError;
pub use registry::ToolRegistry;
pub use skills::{format_skills_listing_for_prompt, load_skills_catalog};
pub use scope_deferred::{ScopeDeferredHandle, ScopeDeferredItem};
pub use session_notes::{SessionNote, SessionNotesHandle};
pub use subagent::{
	append_index_entry, build_blurb, find_index_entry, format_kinds_contract,
	format_kinds_json_contract, kinds_as_strings, list_index_entries, parse_return_kinds,
	record_tool_evidence, sanitize_path_segment, session_subagents_dir, EvidencePath,
	ExploreCommitHandle, ExploreCommitSnapshot, ExploreIndexEntry, ExploreOutcome, ExploreRequest,
	ExploreReturnKind, ExploreReturnOptions, SubagentExecutor, SubagentSettings,
	EXPLORE_BLURB_MAX_CHARS, MAX_COMMIT_BODY_CHARS,
};
pub use simple::{
    AskUserQuestionTool, BashTool, CANONICAL_ASK_JSON_EXAMPLE, ExitPlanModeTool, FileEditTool,
    FileReadTool, FileWriteTool, preview_file_edit_diff, preview_file_write_diff,
    GlobTool, GrepTool, LspTool, MemoryListTool, MemoryReadTool, NotebookEditTool,
    ExploreArtifactReadTool, ExploreCommitTool, ExploreIndexListTool, ScopeDeferTool,
    SessionNoteTool, SkillListTool, SkillReadTool, TaskTool, TodoWriteTool,
    WebFetchTool, WebSearchTool, WorkspaceMapNoteTool, WorkspaceMapReadTool, register_mcp_tools,
    preview_notebook_edit_diff,
};
pub use tool::{DynTool, Tool};
