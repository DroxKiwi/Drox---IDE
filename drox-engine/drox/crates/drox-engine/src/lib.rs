//! `drox-engine` — boucle agent.
//!
//! Reçoit un prompt utilisateur, construit le contexte (system prompt +
//! historique + outils dispo), appelle `drox-llm` en streaming, route les
//! tool calls vers `drox-tools`, gère le bilan de tour et le streaming
//! d'événements vers le client.
//!
//! Voir `docs/INVENTAIRE-NOYAU-MOTEUR.md` § 2.9 et
//! `docs/PLAN-MOTEUR-RUST.md` (sprint 1.4).
//!
//! ## Exemple
//!
//! ```no_run
//! # use std::sync::Arc;
//! # use camino::Utf8PathBuf;
//! # async fn demo() -> Result<(), Box<dyn std::error::Error>> {
//! use drox_engine::{Agent, AgentConfig, default_tool_registry};
//! use drox_llm::{LlmConfig, OllamaClient};
//! use drox_tools::ToolContext;
//! use futures::StreamExt;
//!
//! let llm = Arc::new(OllamaClient::new(LlmConfig::try_from_str(
//!     "http://localhost:11434",
//!     "llama3.2",
//! )?)?);
//! let registry = Arc::new(default_tool_registry());
//! let ctx = ToolContext::new(Utf8PathBuf::from("."), false);
//! let agent = Agent::new(llm, registry, ctx, AgentConfig::default());
//!
//! let mut stream = agent.run("lis le fichier README.md");
//! while let Some(event) = stream.next().await {
//!     println!("{event:?}");
//! }
//! # Ok(())
//! # }
//! ```

pub mod agent;
pub mod orchestration;
pub mod run_spec;
pub mod compaction;
pub mod context;
pub mod error;
pub mod event;
pub mod memory;
pub mod long_memory;
pub mod permissions;
pub mod tool_hooks;
pub mod tool_orchestration;
pub use tool_orchestration::{
    partition_tool_calls, ToolCallBatch, DEFAULT_MAX_PARALLEL_TOOL_CALLS,
};

pub use agent::{Agent, AgentConfig, AgentStream, apply_architect_edit_start, ArchitectEditStartOutcome, RunStation};
pub use run_spec::{
    GateKind, RoleId, RunLimits, RunSpec, RUN_SPEC_VERSION, ARCHITECT_TOOL_ALLOWLIST,
};
pub use orchestration::{
    extract_first_json_object, looks_like_gate_json_response, GateChainResult, StartRunKind,
    architect_discussion_user_message,
    architect_edit_system_prompt_core_for_run, architect_edit_system_prompt_core_for_run_vars,
    architect_user_message,
    extract_discussion_done_from_text, extract_discussion_user_facing_reply,
    ArchitectGate,
    EngineTuning, EngineTuningOverrides, OrchestrationConfig, OrchestrationMode, PromptBlockId,
    PromptVars, StrictnessPreset, resolve_engine_tuning,
    architect_discussion_system_prompt, architect_discussion_system_prompt_default,
    architect_discussion_system_prompt_for_start_run,
    architect_tool_short_description,
    tool_supplements_all_architect, tool_supplements_for_station,
    ARCHITECT_DISCUSSION_CORE_PROMPT, ARCHITECT_DISCUSSION_SYSTEM_PROMPT,
    initial_run_objective_for_concrete_edit, sanitize_architect_user_prompt,
    sanitize_transcript_user_messages,
    RunIntentFlags, ResolvedRunIntent, resolve_run_intent, run_intent_probe,
    ProbeSource, parse_run_intent_json,
    DEFAULT_ARCHITECT_MODEL,
};
pub use compaction::{
    choose_live_compact_split_idx, compact_until_budget, format_compact_checkpoint, summarize_run,
    try_live_compact, CompactionConfig, LiveCompactSettings, CHECKPOINT_MAX_CHARS,
    LIVE_COMPACT_MAX_PASSES,
    LIVE_COMPACT_MAX_TAIL_RATIO, LIVE_COMPACT_TAIL_KEEP_MESSAGES,
    CompactionResult, LiveCompactReport, LIVE_COMPACT_MIN_PREFIX_TOKENS,
};
pub use memory::{MemoryRuntime, MemoryTracker, PersistedRun, persist_compaction_result, persist_run};
pub use context::{ContextPolicy, SnipReport};
pub use drox_context::{
    ContextBudget, RoughTokenCounter, SnipConfig, TiktokenCounter, TokenCounter,
};
pub use drox_permissions::{
    LayeredConfig, PermissionBehavior, PermissionDecision, PermissionEngine, PermissionMode,
    PermissionTarget, Rule, RuleSet, RuleSource, RuleValue, SettingsFile, format_rule, parse_rule,
};
pub use drox_session::{
    ChatMessageRecord, DEFAULT_LISTING_LIMIT, JsonlTranscriptSink, MemorySessionEntry,
    SessionError, SessionFrontMatter, SessionListEntry, SessionUiStats, TranscriptSessionConfig,
    TranscriptSink, compute_session_path, default_sessions_dir, format_sessions_listing_for_prompt,
    apply_prompt_memory_budget, estimate_tokens, list_sessions, load_memdir,
    load_sessions_listing, memdir_system_prefix, read_session, truncate_to_token_budget,
    read_session_ui_stats, read_transcript, reserve_session_path, reset_workspace_drox_data,
    session_ui_stats_path, slugify, transcript_path, workspace_sessions_dir, write_session,
    write_session_ui_stats, DroxIgnoreMatcher, WorkspaceLayoutBootstrap, WorkspaceMapStore,
    WorkspaceResetStats, agent_output_task_dir, agent_output_task_has_markdown,
    ensure_agent_output_task_dir, ensure_workspace_layout,
};
pub use drox_tools::{
    format_skills_listing_for_prompt, load_skills_catalog, SessionNote, SessionNotesHandle,
    ToolContext, ToolRegistry,
};
pub use error::EngineError;
pub use event::{AgentEvent, Phase};
pub use long_memory::{ContextChunkSummaryV1, SessionClosureV1};
pub use permissions::PermissionPolicy;
pub use drox_hooks::{load_merged as load_tool_hooks, ToolHooksConfig};

/// Registre des tools par défaut (`file_read`, `file_write`, `delete_path`, `grep`, `glob`, …).
#[must_use]
pub fn default_tool_registry() -> ToolRegistry {
    ToolRegistry::with_simple_tools()
}
