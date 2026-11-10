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

use super::setup::{build_llm_client_from_connect_fields, resolve_session_dir};

pub async fn session_list(params: Option<Value>) -> Result<Value, RpcError> {
    let params: SessionListParams = decode_optional(params)?;
    let dir = resolve_session_dir(params.dir)?;
    let entries = list_sessions(&dir)
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, format!("session.list failed: {e}")))?;
    let dtos: Vec<SessionListEntryDto> = entries
        .into_iter()
        .map(|e| SessionListEntryDto {
            id: e.id.to_string(),
            modified_secs: e.modified_secs,
            size_bytes: e.size_bytes,
        })
        .collect();
    serde_json::to_value(dtos).map_err(internal)
}

pub async fn session_read(params: Option<Value>) -> Result<Value, RpcError> {
    let params: SessionReadParams = decode_required(params, "session.read requires { id, dir? }")?;
    if !params.id.starts_with("ses_") {
        return Err(RpcError::new(INVALID_PARAMS, "id must start with `ses_`"));
    }
    let dir = resolve_session_dir(params.dir)?;
    let id = SessionId::from_string(params.id);
    let path = transcript_path(&dir, &id);
    let messages = match read_transcript(&path).await {
        Ok(m) => m,
        Err(SessionError::NotFound(_)) => Vec::new(),
        Err(e) => {
            return Err(RpcError::new(
                ENGINE_ERROR,
                format!("session.read failed: {e}"),
            ));
        }
    };
    let stats_path = session_ui_stats_path(&dir, &id);
    let ui_stats = read_session_ui_stats(&stats_path).await;
    serde_json::to_value(SessionReadResult { messages, ui_stats }).map_err(internal)
}

pub async fn session_truncate_after_last_user(params: Option<Value>) -> Result<Value, RpcError> {
    let params: SessionTruncateAfterLastUserParams = decode_required(
        params,
        "session.truncateAfterLastUser requires { id, dir? }",
    )?;
    if !params.id.starts_with("ses_") {
        return Err(RpcError::new(INVALID_PARAMS, "id must start with `ses_`"));
    }
    let dir = resolve_session_dir(params.dir)?;
    let id = SessionId::from_string(params.id);
    let path = transcript_path(&dir, &id);
    let messages = match read_transcript(&path).await {
        Ok(m) => m,
        Err(SessionError::NotFound(_)) => Vec::new(),
        Err(e) => {
            return Err(RpcError::new(
                ENGINE_ERROR,
                format!("session.truncateAfterLastUser read failed: {e}"),
            ));
        }
    };
    let truncated = truncate_after_last_user(&messages);
    write_transcript(&path, &truncated).await.map_err(|e| {
        RpcError::new(
            ENGINE_ERROR,
            format!("session.truncateAfterLastUser write failed: {e}"),
        )
    })?;
    serde_json::to_value(SessionTruncateAfterLastUserResult {
        message_count: truncated.len(),
    })
    .map_err(internal)
}

pub async fn session_compact(params: Option<Value>) -> Result<Value, RpcError> {
    let p: SessionCompactParams = decode_required(
        params,
        "session.compact requires { id, dir?, server?, model?, apiKey?, headers? }",
    )?;
    if !p.id.starts_with("ses_") {
        return Err(RpcError::new(INVALID_PARAMS, "id must start with `ses_`"));
    }
    let dir = resolve_session_dir(p.dir)?;
    let id = SessionId::from_string(p.id);
    let path = transcript_path(&dir, &id);
    let mut messages = match read_transcript(&path).await {
        Ok(m) => m,
        Err(SessionError::NotFound(_)) => Vec::new(),
        Err(e) => {
            return Err(RpcError::new(
                ENGINE_ERROR,
                format!("session.compact read_transcript failed: {e}"),
            ));
        }
    };
    if messages.is_empty() {
        return Err(RpcError::new(
            INVALID_PARAMS,
            "session transcript is empty — send at least one message in this session before /compact",
        ));
    }

    let llm = build_llm_client_from_connect_fields(
        p.server,
        p.model,
        p.api_key,
        &p.headers,
        p.provider.as_deref(),
    )?;

    // 1.6.0 C-2 — même persistance que compaction live (TUI / agent.run).
    let policy = ContextPolicy::for_model_context_window(131_072);
    if let Some(report) = drox_engine::try_live_compact(
        llm.as_ref(),
        crate::prompts::COMPACTION_PROMPT,
        &mut messages,
        &policy,
        &CompactionConfig::default(),
    )
    .await
    {
        write_transcript(&path, &messages).await.map_err(|e| {
            RpcError::new(
                ENGINE_ERROR,
                format!("session.compact write_transcript failed: {e}"),
            )
        })?;
        let usage = report.usage.map(|u| SessionCompactUsageDto {
            input_tokens: u.input_tokens,
            output_tokens: u.output_tokens,
        });
        let objective = extract_objective_from_summary(&report.summary_text);
        let dto = SessionCompactResult {
            summary: report.summary_text,
            objective,
            files_touched: report.files_touched,
            usage,
            transcript_rewritten: true,
        };
        return serde_json::to_value(dto).map_err(internal);
    }

    let result = summarize_run(
        llm.as_ref(),
        crate::prompts::COMPACTION_PROMPT,
        &messages,
        &[],
        &CompactionConfig::default(),
    )
    .await
    .map_err(|e| RpcError::new(ENGINE_ERROR, e.to_string()))?;

    let usage = result.usage.map(|u| SessionCompactUsageDto {
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
    });
    let objective = (!result.objective.trim().is_empty()).then_some(result.objective);

    let dto = SessionCompactResult {
        summary: result.summary,
        objective,
        files_touched: result.files_touched,
        usage,
        transcript_rewritten: false,
    };
    serde_json::to_value(dto).map_err(internal)
}

fn extract_objective_from_summary(summary: &str) -> Option<String> {
    let mut in_obj = false;
    let mut buf = String::new();
    for line in summary.lines() {
        let t = line.trim();
        if t.starts_with("## ") {
            if in_obj {
                break;
            }
            if t[3..].to_ascii_lowercase().contains("objective") {
                in_obj = true;
                continue;
            }
        } else if in_obj && !t.is_empty() {
            if !buf.is_empty() {
                buf.push(' ');
            }
            buf.push_str(t);
        }
    }
    (!buf.is_empty()).then_some(buf)
}
