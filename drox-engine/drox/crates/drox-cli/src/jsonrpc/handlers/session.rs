//! Handlers `session.*`.

use drox_engine::{
    CompactionConfig, SessionError, list_sessions, read_transcript, read_session_ui_stats,
    session_ui_stats_path, summarize_run, transcript_path, workspace_sessions_dir,
};
use drox_types::SessionId;
use serde_json::Value;

use crate::jsonrpc::handlers::common::{
    build_ollama_from_llm_connect_fields, decode_optional, decode_required, internal,
    resolve_session_dir, resolve_workspace,
};
use crate::jsonrpc::protocol::{
    SessionCompactParams, SessionCompactResult, SessionCompactUsageDto, SessionListEntryDto,
    SessionListParams, SessionReadParams, SessionReadResult,
};
use crate::jsonrpc::{ENGINE_ERROR, INVALID_PARAMS, RpcError};

fn resolve_sessions_dir(
    dir: Option<camino::Utf8PathBuf>,
    workspace: Option<camino::Utf8PathBuf>,
) -> Result<camino::Utf8PathBuf, RpcError> {
    if let Some(p) = dir {
        return Ok(p);
    }
    if let Some(ws) = workspace {
        let canonical = resolve_workspace(Some(ws))?;
        return Ok(workspace_sessions_dir(&canonical));
    }
    resolve_session_dir(None)
}

pub async fn session_list(params: Option<Value>) -> Result<Value, RpcError> {
    let params: SessionListParams = decode_optional(params)?;
    let dir = resolve_sessions_dir(params.dir, params.workspace)?;
    let entries = list_sessions(&dir)
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, format!("session.list failed: {e}")))?;
    let dtos: Vec<SessionListEntryDto> = entries
        .into_iter()
        .map(|e| SessionListEntryDto {
            id: e.id.to_string(),
            modified_secs: e.modified_secs,
            size_bytes: e.size_bytes,
            title: e.display_title,
        })
        .collect();
    serde_json::to_value(dtos).map_err(internal)
}

pub async fn session_read(params: Option<Value>) -> Result<Value, RpcError> {
    let params: SessionReadParams = decode_required(params, "session.read requires { id, dir? }")?;
    if !params.id.starts_with("ses_") {
        return Err(RpcError::new(INVALID_PARAMS, "id must start with `ses_`"));
    }
    let dir = resolve_sessions_dir(params.dir, params.workspace)?;
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

pub async fn session_compact(params: Option<Value>) -> Result<Value, RpcError> {
    let p: SessionCompactParams = decode_required(
        params,
        "session.compact requires { id, dir?, server?, model?, apiKey?, headers? }",
    )?;
    if !p.id.starts_with("ses_") {
        return Err(RpcError::new(INVALID_PARAMS, "id must start with `ses_`"));
    }
    let dir = resolve_sessions_dir(p.dir, p.workspace)?;
    let id = SessionId::from_string(p.id);
    let path = transcript_path(&dir, &id);
    let messages = match read_transcript(&path).await {
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

    let llm = build_ollama_from_llm_connect_fields(
        p.server,
        p.model,
        p.api_key,
        &p.headers,
        None,
    )?;

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
    };
    serde_json::to_value(dto).map_err(internal)
}
