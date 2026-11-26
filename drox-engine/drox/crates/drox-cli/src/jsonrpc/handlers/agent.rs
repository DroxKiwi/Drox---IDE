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

use super::setup::{AgentSetup, build_agent_setup, build_user_blocks};

/// Statut de fin d'une tâche `agent.run`. Utilisé pour signaler le succès
/// même lorsque le `JoinHandle` est consommé par `cancel_run`.
#[derive(Debug, Clone, Copy)]
pub enum RunOutcome {
    Completed,
    Errored,
}

pub async fn agent_run(server: Server, params: Option<Value>) -> Result<Value, RpcError> {
    let params: AgentRunParams = decode_required(params, "agent.run requires `prompt`")?;
    let skip_user_turn = params.skip_user_turn.unwrap_or(false);
    if !skip_user_turn && params.prompt.is_empty() {
        return Err(RpcError::new(INVALID_PARAMS, "prompt must not be empty"));
    }

    // Le run_id est alloué **avant** la construction de l'agent pour que les
    // wrappers `RemoteTool` puissent l'embarquer.
    let run_id = server.allocate_run_id();
    let agent_setup = build_agent_setup(&server, &run_id, &params).await?;

    let server_for_task = server.clone();
    let run_id_for_task = run_id.clone();
    let user_blocks = if skip_user_turn {
        Vec::new()
    } else {
        build_user_blocks(&params)
    };
    let image_count = params.images.len();
    if image_count > 0 {
        tracing::info!(
            run_id = %run_id,
            images = image_count,
            "agent.run with image attachments"
        );
    }

    let join = tokio::spawn(async move {
        let outcome = drive_run(
            &server_for_task,
            run_id_for_task.clone(),
            agent_setup,
            user_blocks,
            skip_user_turn,
        )
        .await
        .unwrap_or_else(|status| status);
        server_for_task.forget_run(&run_id_for_task);
        outcome
    });

    server.register_run(run_id.clone(), join);
    serde_json::to_value(AgentRunResult { run_id }).map_err(internal)
}

pub async fn agent_cancel(server: &Server, params: Option<Value>) -> Result<Value, RpcError> {
    let params: AgentCancelParams = decode_required(params, "agent.cancel requires `runId`")?;
    let run_id = params.run_id.clone();
    let cancelled = server.cancel_run(&run_id);
    if !cancelled {
        return Err(RpcError::new(
            RUN_NOT_FOUND,
            format!("no active run with id `{run_id}`"),
        ));
    }
    // Abort seul ne laisse aucun tool_result / agent/done → carte Explore orpheline côté IDE.
    server
        .notify(
            "agent/done",
            AgentDoneNotification {
                run_id,
                status: RunStatus::Cancelled,
                error: None,
            },
        )
        .await;
    serde_json::to_value(AgentCancelResult { cancelled: true }).map_err(internal)
}

async fn drive_run(
    server: &Server,
    run_id: String,
    setup: AgentSetup,
    user_blocks: Vec<Content>,
    skip_user_turn: bool,
) -> Result<RunOutcome, RunOutcome> {
    let AgentSetup {
        agent,
        history,
        ui_stats_path,
    } = setup;
    let mut stream = if skip_user_turn {
        agent.continue_from_history(history)
    } else {
        agent.run_with_history_blocks(history, user_blocks)
    };
    let mut errored = false;
    let mut ide_shim = IdeEventShimState::default();

    while let Some(event) = stream.next().await {
        match event {
            Ok(ev) => {
                if let Some(ref p) = ui_stats_path {
                    if let Err(e) = merge_ui_stats_from_agent_event(p, &ev).await {
                        warn!(error = %e, path = %p, "session ui-stats persist failed");
                    }
                }
                let is_stop = matches!(&ev, AgentEvent::Stop { .. });
                for wire in expand_agent_event_for_ide(&ev, &mut ide_shim) {
                    server
                        .notify(
                            "agent/event",
                            AgentEventNotification {
                                run_id: run_id.clone(),
                                event: wire,
                            },
                        )
                        .await;
                }
                if is_stop {
                    break;
                }
            }
            Err(e) => {
                errored = true;
                server
                    .notify(
                        "agent/done",
                        AgentDoneNotification {
                            run_id: run_id.clone(),
                            status: RunStatus::Error,
                            error: Some(e.to_string()),
                        },
                    )
                    .await;
                break;
            }
        }
    }

    if !errored {
        server
            .notify(
                "agent/done",
                AgentDoneNotification {
                    run_id,
                    status: RunStatus::Completed,
                    error: None,
                },
            )
            .await;
    }

    if errored {
        Err(RunOutcome::Errored)
    } else {
        Ok(RunOutcome::Completed)
    }
}

fn usize_to_u32_saturated(n: usize) -> u32 {
    u32::try_from(n).unwrap_or(u32::MAX)
}

/// Met à jour le fichier `*.ui-stats.json` comme le ferait la webview
/// (cumuls ↑↓ + dernier ctx).
async fn merge_ui_stats_from_agent_event(
    path: &Utf8Path,
    ev: &AgentEvent,
) -> Result<(), SessionError> {
    let mut s = read_session_ui_stats(path).await.unwrap_or_default();
    let mut dirty = false;
    match ev {
        AgentEvent::Stop { usage, .. } | AgentEvent::TurnUsage { usage } => {
            if usage.input_tokens > 0 || usage.output_tokens > 0 {
                s.total_in = s.total_in.saturating_add(u64::from(usage.input_tokens));
                s.total_out = s.total_out.saturating_add(u64::from(usage.output_tokens));
                if usage.input_tokens > 0 {
                    s.ctx = usage.input_tokens;
                }
                dirty = true;
            }
        }
        AgentEvent::ContextUsage { parent_tokens } => {
            s.ctx = usize_to_u32_saturated(*parent_tokens);
            dirty = true;
        }
        AgentEvent::ContextSnip {
            tokens_used_after, ..
        } => {
            s.ctx = usize_to_u32_saturated(*tokens_used_after);
            dirty = true;
        }
        AgentEvent::ContextCompacted {
            tokens_after,
            usage,
            ..
        } => {
            s.ctx = usize_to_u32_saturated(*tokens_after);
            if let Some(u) = usage {
                if u.input_tokens > 0 || u.output_tokens > 0 {
                    s.total_in = s.total_in.saturating_add(u64::from(u.input_tokens));
                    s.total_out = s.total_out.saturating_add(u64::from(u.output_tokens));
                }
            }
            dirty = true;
        }
        _ => {}
    }
    if dirty {
        write_session_ui_stats(path, &s).await?;
    }
    Ok(())
}
