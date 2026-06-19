//! `drox-session` — persistance des sessions.
//!
//! - Répertoire par défaut `~/.drox/sessions/` ([`paths::default_sessions_dir`]).
//! - Transcript append-only JSONL : [`ChatMessageRecord`], [`read_transcript`],
//!   [`JsonlTranscriptSink`] + trait [`TranscriptSink`] pour le moteur.
//! - Listing : [`list_sessions`].
//! - Memdir : [`load_memdir`] + [`memdir_system_prefix`] pour `DROX.md` à la racine du workspace.
//!
//! Voir `docs/INVENTAIRE-NOYAU-MOTEUR.md` § 2.8.

pub mod drox_ignore;
pub mod engine_trace;
pub mod error;
pub mod list;
pub mod memdir;
pub mod memory_budget;
pub mod memory_sessions;
pub mod paths;
pub mod record;
pub mod transcript;
pub mod title;
pub mod ui_stats;
pub mod workspace_layout;
pub mod workspace_map;
pub mod workspace_reset;

pub use drox_ignore::{
    DroxIgnoreMatcher, DROXIGNORE_FILENAME, DEFAULT_DROXIGNORE_TEMPLATE,
};
pub use error::SessionError;
pub use list::{SessionListEntry, list_sessions};
pub use title::peek_session_display_title;
pub use memdir::{MemdirFiles, load_memdir, memdir_system_prefix};
pub use memory_budget::{
    apply_prompt_memory_budget, estimate_tokens, truncate_to_token_budget,
};
pub use memory_sessions::{
    DEFAULT_LISTING_LIMIT, MemorySessionEntry, SessionFrontMatter,
    compute_session_path, format_sessions_listing_for_prompt, load_sessions_listing,
    memory_tools_boot_teaser,
    read_session, reserve_session_path, slugify, write_session,
};
pub use paths::{
    default_sessions_dir, engine_trace_path, session_ui_stats_path, transcript_path,
    workspace_sessions_dir,
};
pub use workspace_layout::{
    agent_output_task_dir, agent_output_task_dir_legacy, agent_output_task_has_markdown,
    ensure_agent_output_task_dir, ensure_workspace_layout, sanitize_task_segment,
    WorkspaceLayoutBootstrap, AGENT_OUTPUT_SUBDIR, DROX_DIR,
};
pub use workspace_reset::{WorkspaceResetStats, reset_workspace_drox_data};
pub use record::{ChatMessageRecord, TRANSCRIPT_SCHEMA_VERSION};
pub use engine_trace::{
    EngineSystemBlock, EngineTracePayload, EngineTraceRecord, EngineTraceSessionConfig,
    EngineTraceSink, JsonlEngineTraceSink, LlmTurnPreparedTrace, RunRoutingTrace, RunSummaryTrace,
    append_engine_trace_record, read_engine_trace, ENGINE_TRACE_SCHEMA_VERSION,
};
pub use transcript::{
    JsonlTranscriptSink, TranscriptSessionConfig, TranscriptSink, read_transcript,
};
pub use ui_stats::{SessionUiStats, read_session_ui_stats, write_session_ui_stats};
pub use workspace_map::{
    WorkspaceMapStore, WorkspaceMapV1, format_workspace_map_for_prompt,
    initial_snapshot, is_excluded_from_workspace_map,
};
