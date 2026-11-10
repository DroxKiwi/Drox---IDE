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

pub(super) fn decode_optional<T: serde::de::DeserializeOwned + Default>(
    params: Option<Value>,
) -> Result<T, RpcError> {
    match params {
        None | Some(Value::Null) => Ok(T::default()),
        Some(v) => serde_json::from_value(v)
            .map_err(|e| RpcError::new(INVALID_PARAMS, format!("invalid params: {e}"))),
    }
}

pub(super) fn decode_required<T: serde::de::DeserializeOwned>(
    params: Option<Value>,
    missing_msg: &str,
) -> Result<T, RpcError> {
    let Some(v) = params else {
        return Err(RpcError::new(INVALID_PARAMS, missing_msg.to_string()));
    };
    serde_json::from_value(v).map_err(|e| {
        RpcError::new(INVALID_PARAMS, format!("invalid params: {e}"))
            .with_data(json!({ "hint": missing_msg }))
    })
}

pub(super) fn internal<E: std::fmt::Display>(e: E) -> RpcError {
    RpcError::new(super::super::INTERNAL_ERROR, e.to_string())
}
