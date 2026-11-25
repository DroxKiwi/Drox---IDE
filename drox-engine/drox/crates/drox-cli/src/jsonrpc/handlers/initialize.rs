#![allow(unused_imports)]
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use camino::{Utf8Path, Utf8PathBuf};
use drox_engine::{
    Agent, AgentConfig, AgentEvent, CompactionConfig, ContextPolicy, DroxIgnoreMatcher,
    EngineSubagentExecutor, JsonlTranscriptSink, LayeredConfig, MemoryRuntime, PermissionEngine,
    PermissionMode, PermissionPolicy, SessionError, SessionNotesHandle, SubagentSettings,
    TranscriptSessionConfig, WorkspaceMapStore, default_sessions_dir, default_tool_registry,
    format_sessions_listing_for_prompt, list_sessions, load_memdir, load_sessions_listing,
    memdir_system_prefix, read_session_ui_stats, read_transcript, session_ui_stats_path,
    summarize_run, transcript_path, truncate_after_last_user, write_session_ui_stats,
    write_transcript,
};
use drox_llm::{ChatOptions, LlmClient, LlmConfig, create_llm_client};
use drox_mcp::McpHub;
use drox_permissions::{
    DetectUnreachableOptions, PathMatchContext, PermissionBehavior, Rule, RuleSet, RuleSource,
    detect_unreachable_rules, format_rule, parse_rule,
};
use drox_tools::{
    ScopeDeferredHandle, ToolContext, ToolError, ToolRegistry, UserAnswer, UserAsker, UserQuestion,
    register_mcp_tools,
};
use drox_types::{Content, SessionId};
use futures::StreamExt;
use serde_json::{Value, json};
use tracing::warn;

use super::super::ide_event_shim::{IdeEventShimState, expand_agent_event_for_ide};
use super::super::remote_tool::RemoteTool;
use super::super::rpc_types::{
    AgentCancelParams, AgentCancelResult, AgentDoneNotification, AgentEventNotification,
    AgentRunParams, AgentRunResult, InitializeParams, InitializeResult, RunStatus,
    SessionCompactParams, SessionCompactResult, SessionCompactUsageDto, SessionListEntryDto,
    SessionListParams, SessionReadParams, SessionReadResult, SessionTruncateAfterLastUserParams,
    SessionTruncateAfterLastUserResult, UserAskOption, UserAskParams, UserAskQuestion,
    UserAskResult,
};
use super::super::server::Server;
use super::super::{CONFIG_ERROR, ENGINE_ERROR, INVALID_PARAMS, RUN_NOT_FOUND, RpcError};
use uuid::Uuid;

use super::decode::{decode_optional, decode_required, internal};

// Garde la signature `async` pour rester homogène avec les autres handlers
// dispatchés dans `server::handle_request`.
#[allow(clippy::unused_async)]
pub async fn initialize(server: &Server, params: Option<Value>) -> Result<Value, RpcError> {
    let parsed: InitializeParams = decode_optional(params)?;
    if let Some(caps) = parsed.client_capabilities {
        if !caps.executable_tools.is_empty() {
            tracing::info!(
                tools = ?caps.executable_tools,
                "client declared executable tools (delegated via tool/exec)"
            );
        }
        server.set_executable_tools(caps.executable_tools);
        if caps.interactive_ask {
            tracing::info!("client declared `interactiveAsk` — RpcUserAsker will be installed");
        }
        server.set_interactive_ask(caps.interactive_ask);
    }
    let r = InitializeResult::current();
    serde_json::to_value(r).map_err(internal)
}
