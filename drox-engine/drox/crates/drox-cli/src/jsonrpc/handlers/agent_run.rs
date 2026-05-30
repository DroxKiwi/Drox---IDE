//! Handlers des méthodes du protocole drox JSON-RPC v1.
//!
//! Les handlers ne touchent pas directement à `stdout` : ils renvoient un
//! `Value` ou un [`RpcError`], le [`super::server::Server`] s'occupe de
//! sérialiser la `Response` et de pousser les notifications.

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use async_trait::async_trait;
use camino::{Utf8Path, Utf8PathBuf};
use drox_engine::{
    Agent, AgentConfig, AgentEvent, CompactionConfig, ContextPolicy, JsonlTranscriptSink,
    EngineOrchestrationDelegate, LayeredConfig, MemoryRuntime, OrchestrationConfig,
    PermissionEngine, PermissionMode, PermissionPolicy, OrchestrationMode, RunSpec, SessionError,
    SessionNotesHandle, TranscriptSessionConfig, SubagentJobRegistry,
    WorkspaceMapStore, EngineSubagentExecutor, SubagentSettings,
    apply_prompt_memory_budget, format_sessions_listing_for_prompt, load_memdir,
    load_sessions_listing, memdir_system_prefix, read_session_ui_stats,
    read_transcript, session_ui_stats_path, transcript_path, write_session_ui_stats,
    DroxIgnoreMatcher,
};
use drox_llm::{ChatOptions, OllamaClient};
use drox_mcp::McpHub;
use drox_permissions::{
    DetectUnreachableOptions, PathMatchContext, PermissionBehavior, Rule, RuleSet, RuleSource,
    detect_unreachable_rules, format_rule, parse_rule,
};
use drox_tools::{
    OrchestrationDelegateEventHook, OrchestrationDelegateHookEvent, ScopeDeferredHandle,
    SubagentEventHook, SubagentHookEvent, ToolContext, ToolError, ToolRegistry, UserAnswer,
    UserAsker, UserQuestion,
};
use drox_types::{Content, SessionId};
use futures::StreamExt;
use serde_json::Value;
use tracing::warn;

use crate::system_prompt::{AssembleInput, RegistryBuildInput, assemble_system_prompt, build_registry_for_run};

use crate::jsonrpc::handlers::common::{
    build_llm_config, decode_required, internal, resolve_workspace,
};
use crate::jsonrpc::protocol::{
    AgentCancelParams, AgentCancelResult, AgentDoneNotification, AgentEventNotification,
    AgentRunParams, AgentRunResult, RunStatus, UserAskParams, UserAskQuestion, UserAskOption,
    UserAskResult,
};
use crate::jsonrpc::remote_tool::RemoteTool;
use crate::jsonrpc::server::Server;
use crate::jsonrpc::{CONFIG_ERROR, ENGINE_ERROR, INVALID_PARAMS, RUN_NOT_FOUND, RpcError};
use uuid::Uuid;

/// Statut de fin d'une tâche `agent.run`. Utilisé pour signaler le succès
/// même lorsque le `JoinHandle` est consommé par `cancel_run`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunOutcome {
    Completed,
    Errored,
}

// Garde la signature `async` pour rester homogène avec les autres handlers
// dispatchés dans `server::handle_request`.
#[allow(clippy::unused_async)]
pub async fn agent_run(server: Server, params: Option<Value>) -> Result<Value, RpcError> {
    let params: AgentRunParams = decode_required(params, "agent.run requires `prompt`")?;
    if params.prompt.is_empty() && params.images.is_empty() {
        return Err(RpcError::new(INVALID_PARAMS, "prompt must not be empty"));
    }

    // Le run_id est alloué **avant** la construction de l'agent pour que les
    // wrappers `RemoteTool` puissent l'embarquer.
    let orchestration_mode =
        OrchestrationMode::resolve(params.orchestration_mode.as_deref());
    tracing::info!(
        orchestration_mode = orchestration_mode.as_str(),
        "agent.run — orchestration mode"
    );

    let run_id = server.allocate_run_id();
    let user_blocks = build_user_blocks(&params);
    let image_count = params.images.len();
    if image_count > 0 {
        tracing::info!(
            run_id = %run_id,
            images = image_count,
            "agent.run with image attachments"
        );
    }

    let server_for_task = server.clone();
    let run_id_for_task = run_id.clone();
    let params_for_task = params.clone();
    let run_cancel = Arc::new(AtomicBool::new(false));

    let join = tokio::spawn(async move {
        let outcome = super::orchestration_run::drive_run_v1_2(
            &server_for_task,
            run_id_for_task.clone(),
            &params_for_task,
            user_blocks,
        )
        .await
        .unwrap_or_else(|status| status);
        server_for_task.forget_run(&run_id_for_task);
        outcome
    });

    server.register_run(run_id.clone(), join, run_cancel);
    serde_json::to_value(AgentRunResult { run_id }).map_err(internal)
}

pub fn agent_cancel(server: &Server, params: Option<Value>) -> Result<Value, RpcError> {
    let params: AgentCancelParams = decode_required(params, "agent.cancel requires `runId`")?;
    let cancelled = server.cancel_run(&params.run_id);
    if !cancelled {
        return Err(RpcError::new(
            RUN_NOT_FOUND,
            format!("no active run with id `{}`", params.run_id),
        ));
    }
    serde_json::to_value(AgentCancelResult { cancelled: true }).map_err(internal)
}

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

/// Tout ce dont la tâche `drive_run` a besoin pour piloter un agent. Construit
/// **avant** le spawn afin que les erreurs de configuration soient renvoyées
/// directement dans la réponse à `agent.run`.
pub(crate) struct AgentSetup {
    agent: Agent,
    history: Vec<drox_types::Message>,
    /// Persistance des compteurs webview (↑ / ↓ / ctx) pour reprise de session.
    ui_stats_path: Option<Utf8PathBuf>,
}

/// Contexte pour brancher `delegate_executor` sur un run Architecte.
#[derive(Debug, Clone)]
pub(crate) struct OrchestrationDelegateWireInput {
    pub orch_cfg: OrchestrationConfig,
}

/// Surcharges pour sous-runs orchestration 1.2.0.
#[derive(Debug, Clone, Default)]
pub(crate) struct AgentSetupOverrides {
    pub model_override: Option<String>,
    pub system_override: Option<String>,
    pub force_disable_subagents: bool,
    pub orchestration_delegate: Option<OrchestrationDelegateWireInput>,
}

#[allow(clippy::too_many_lines)] // plomberie linéaire : workspace + memory + permissions + transcript + registry
pub(crate) async fn build_agent_setup(
    server: &Server,
    run_id: &str,
    params: &AgentRunParams,
    run_spec: RunSpec,
    overrides: AgentSetupOverrides,
) -> Result<AgentSetup, RpcError> {
    let effective_model = overrides
        .model_override
        .clone()
        .or_else(|| params.model.clone());
    let parent_num_ctx_override = params.num_ctx.map(|n| n as i64);
    let llm_config = build_llm_config(
        params.server.clone(),
        effective_model,
        params.api_key.clone(),
        &params.headers,
        parent_num_ctx_override,
    )?;
    let num_ctx = llm_config.num_ctx.max(2048) as usize;
    let llm = Arc::new(
        OllamaClient::new(llm_config)
            .map_err(|e| RpcError::new(CONFIG_ERROR, format!("LLM init failed: {e}")))?,
    );

    let workspace = resolve_workspace(params.workspace.clone())?;
    let workspace_fingerprint = workspace.as_str().to_string();

    let mem = load_memdir(workspace.as_path())
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, format!("memdir: {e}")))?;
    let memory_listing = load_sessions_listing(
        workspace.as_path(),
        drox_engine::DEFAULT_LISTING_LIMIT,
    )
    .await
    .unwrap_or_else(|e| {
        warn!(error = %e, "memory: failed to load sessions listing — ignoring");
        Vec::new()
    });
    let skills_listing = drox_engine::load_skills_catalog(workspace.as_path())
        .await
        .unwrap_or_else(|e| {
            warn!(error = %e, "skills: failed to load catalog — ignoring");
            Vec::new()
        });
    drox_engine::ensure_workspace_layout(&workspace)
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, format!("workspace layout: {e}")))?;

    let drox_ignore = DroxIgnoreMatcher::load_or_create(workspace.clone())
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, format!("droxignore: {e}")))?;
    let workspace_map = WorkspaceMapStore::load_or_create(
        workspace.clone(),
        workspace_fingerprint.clone(),
        Some(drox_ignore.clone()),
    )
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, format!("workspace_map: {e}")))?;
    let lang = crate::language::from_env();
    if let Some(ref l) = lang {
        tracing::debug!(language = %l.display, "langue principale appliquée (jsonrpc)");
    }

    let (mode, policy) = build_permission_policy(params, &workspace)?;

    let mut subagents_enabled = params.subagents_enabled.unwrap_or(false);
    if overrides.force_disable_subagents {
        subagents_enabled = false;
    }

    // Mode Professeur : propositions seules côté client (`applyFsWrites: false`).
    let apply = if mode.is_professor() {
        false
    } else {
        params.apply_edits.unwrap_or(false)
    };

    let (memdir_prefix, memory_sessions_block) = apply_prompt_memory_budget(
        memdir_system_prefix(&mem),
        format_sessions_listing_for_prompt(&memory_listing),
        run_spec.memory_budget_tokens(),
    );

    let system_merged = if let Some(sys) = overrides.system_override.clone() {
        Some(sys)
    } else {
        assemble_system_prompt(AssembleInput {
            role_id: run_spec.role_id,
            cli_system: params.system.clone(),
            memdir_prefix,
            memory_sessions_block,
            skills_block: drox_engine::format_skills_listing_for_prompt(&skills_listing),
            drox_ignore_block: drox_ignore.format_for_prompt(),
            workspace_map_block: workspace_map.format_for_prompt(),
            language: lang,
            native_thinking: params.native_thinking == Some(true),
            professor_mode: mode.is_professor(),
            disabled_tools_notice: format_disabled_tools_notice(&params.disabled_tools),
            subagents_enabled,
        })
    };

    let (history, transcript, ui_stats_path) =
        build_transcript(params, system_merged.as_deref()).await?;

    let model_label = params
        .model
        .clone()
        .unwrap_or_else(|| std::env::var("DROX_MODEL").unwrap_or_else(|_| "llama3.2".into()));

    let mcp_hub = McpHub::discover(&workspace).await;
    let mut subagent_settings = SubagentSettings {
        enabled: subagents_enabled,
        max_iterations: params.subagents_max_iterations.unwrap_or(15).clamp(1, 50),
        max_concurrent: params.subagents_max_concurrent.unwrap_or(1).clamp(1, 8),
        event_hook: None,
    };
    if subagent_settings.enabled {
        subagent_settings.event_hook = Some(subagent_event_hook(server, run_id));
    }
    let registry = build_registry_for_run(RegistryBuildInput {
        run_spec: run_spec.clone(),
        mcp_enabled: params.mcp_tools_enabled.unwrap_or(true),
        mcp_hub: mcp_hub.clone(),
        disabled_tools: params.disabled_tools.clone(),
        subagent_settings: subagent_settings.clone(),
    })
    .await;
    let registry = Arc::new(wrap_executable_tools(registry, server, run_id));
    // Sprint Questions bloquantes (§2.13) — si le client a annoncé
    // `interactiveAsk` à `initialize`, on installe un asker qui délègue à
    // `user/ask` (carte modale dans la webview). Sinon, l'asker refusant
    // historique reste actif et le tool retournera `ToolError::Interactive`.
    let asker: Arc<dyn UserAsker> = if server.supports_interactive_ask() {
        Arc::new(RpcUserAsker {
            server: server.clone(),
            run_id: run_id.to_string(),
        })
    } else {
        Arc::new(RefuseAsker)
    };
    let scope_deferred = ScopeDeferredHandle::new();
    let mut ctx = ToolContext::new(workspace.clone(), apply)
        .with_plan_mode(mode.enables_plan_mode_on_tools())
        .with_user_asker(asker)
        .with_scope_deferred(scope_deferred)
        .with_workspace_map(workspace_map.clone())
        .with_drox_ignore(drox_ignore);
    if let Some(hub) = mcp_hub {
        tracing::info!(
            servers = ?hub.server_names(),
            path = %hub.config_path().display(),
            "MCP hub chargé"
        );
        ctx = ctx.with_mcp_hub(hub);
    }

    let chat_options = ChatOptions {
        temperature: params.temperature,
        max_tokens: params.max_tokens,
        stop_sequences: Vec::new(),
        tools: Vec::new(),
        think: params.native_thinking,
        ..ChatOptions::default()
    };

    if let Some(ref orch_wire) = overrides.orchestration_delegate {
        let executor_llm = build_orchestration_executor_llm(
            params,
            &llm,
            num_ctx as i64,
            &orch_wire.orch_cfg.executor_model,
        )
        .await?;
        let executor_num_ctx = resolve_subagent_num_ctx(params) as usize;
        let run_cancel = server
            .run_cancel_flag(run_id)
            .unwrap_or_else(|| Arc::new(AtomicBool::new(false)));
        let delegate = Arc::new(EngineOrchestrationDelegate::new(
            executor_llm,
            vec![orch_wire.orch_cfg.executor_model.clone()],
            chat_options.clone(),
            params
                .subagents_max_iterations
                .or(params.max_iterations)
                .unwrap_or(8)
                .clamp(1, 25),
            executor_num_ctx,
            Some(policy.clone()),
            Some(orchestration_delegate_hook(server, run_id)),
            run_cancel,
            orch_wire.orch_cfg.max_parallel_executors,
        ));
        ctx = ctx
            .with_orchestration_delegate(delegate)
            .with_orchestration_max_parallel_executors(orch_wire.orch_cfg.max_parallel_executors);
        tracing::info!(
            executor_model = %orch_wire.orch_cfg.executor_model,
            max_parallel_executors = orch_wire.orch_cfg.max_parallel_executors,
            "orchestration v1_2 — delegate_executor wired for Architect run"
        );
    }

    if subagent_settings.enabled {
        let subagent_num_ctx = resolve_subagent_num_ctx(params);
        tracing::info!(
            subagents_enabled = true,
            subagents_num_ctx_param = ?params.subagents_num_ctx,
            subagents_model_param = ?params.subagents_model,
            num_ctx_param = ?params.num_ctx,
            resolved_subagent_num_ctx = subagent_num_ctx,
            parent_num_ctx = num_ctx,
            drox_subagents_num_ctx_env = ?crate::jsonrpc::handlers::common::env_i64(
                "DROX_SUBAGENTS_NUM_CTX"
            ),
            drox_num_ctx_env = ?crate::jsonrpc::handlers::common::env_i64("DROX_NUM_CTX"),
            "agent.run — résolution contexte sous-agents"
        );
        let subagent_llm = resolve_subagent_llm(
            params,
            &llm,
            subagent_num_ctx,
            num_ctx as i64,
        )?;
        if let Some(m) = params
            .subagents_model
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            tracing::info!(
                subagent_model = %m,
                parent_model = ?params.model,
                subagent_num_ctx,
                parent_num_ctx = num_ctx,
                "sous-agents — modèle dédié"
            );
        } else {
            tracing::info!(
                subagent_num_ctx,
                parent_num_ctx = num_ctx,
                "sous-agents — même modèle que le parent, fenêtre contexte dédiée"
            );
        }
        let subagent_jobs = Arc::new(SubagentJobRegistry::new());
        let executor = Arc::new(EngineSubagentExecutor::new(
            subagent_llm,
            chat_options.clone(),
            subagent_settings.clone(),
            run_spec.clone(),
            subagent_num_ctx as usize,
            subagent_jobs,
        ));
        ctx = ctx
            .with_subagent_settings(subagent_settings)
            .with_subagent_executor(executor);
    }

    let tool_hooks = drox_hooks::load_merged(&workspace);

    // Sprint M1 — mémoire de session. `MemoryRuntime` partage son
    // `SessionNotesHandle` avec le `ToolContext` (via le moteur, à l'entrée
    // de `drive_inner`). Le même client LLM est réutilisé pour la
    // compaction — c'est intentionnel pour V1 : un sprint suivant pourra
    // permettre un modèle dédié (plus petit, plus rapide) si besoin.
    let memory_runtime = MemoryRuntime {
        workspace_root: workspace,
        llm: llm.clone(),
        compaction_prompt: crate::prompts::COMPACTION_PROMPT.to_string(),
        compaction_config: CompactionConfig::default(),
        notes: SessionNotesHandle::new(),
        model_label: model_label.clone(),
    };
    if tool_hooks.is_enabled() {
        tracing::info!(
            pre = tool_hooks.pre_tool_use.len(),
            post = tool_hooks.post_tool_use.len(),
            "tool hooks actifs (.drox/hooks.json)"
        );
    }

    let agent_config = AgentConfig {
        system_prompt: system_merged,
        max_iterations: params.max_iterations.unwrap_or(12),
        chat_options,
        permissions: Some(policy),
        context: Some(ContextPolicy::for_model_context_window(num_ctx)),
        transcript,
        memory: Some(memory_runtime),
        transcript_session_id: params.session_id.clone(),
        workspace_fingerprint,
        max_parallel_tool_calls: drox_engine::DEFAULT_MAX_PARALLEL_TOOL_CALLS,
        tool_hooks: if tool_hooks.is_enabled() {
            Some(tool_hooks)
        } else {
            None
        },
        run_objective: params.run_objective.clone(),
        delegate_task_id: None,
        executor_deliverable_task_id: None,
        executor_deliverable_plan_id: None,
        run_spec,
    };

    let agent = Agent::new(llm, registry, ctx, agent_config);
    Ok(AgentSetup {
        agent,
        history,
        ui_stats_path,
    })
}

/// Pilote un agent, notifie les événements, collecte le texte assistant.
pub(crate) async fn drive_role_run(
    server: &Server,
    run_id: &str,
    setup: AgentSetup,
    user_blocks: Vec<Content>,
    role_wire: &str,
) -> (RunOutcome, String) {
    server
        .notify(
            "agent/event",
            AgentEventNotification {
                run_id: run_id.to_string(),
                event: AgentEvent::RoleEnter {
                    role_id: role_wire.to_string(),
                },
                job_id: None,
            },
        )
        .await;

    let AgentSetup {
        agent,
        history,
        ui_stats_path,
    } = setup;
    let mut stream = agent.run_with_history_blocks(history, user_blocks);
    let mut errored = false;
    let mut assistant_text = String::new();

    while let Some(event) = stream.next().await {
        if server.is_run_cancelled(run_id) {
            break;
        }
        match event {
            Ok(ev) => {
                if let AgentEvent::TextDelta { ref text } = ev {
                    assistant_text.push_str(text);
                }
                if let Some(ref p) = ui_stats_path {
                    if let Err(e) = merge_ui_stats_from_agent_event(p, &ev).await {
                        warn!(error = %e, path = %p, "session ui-stats persist failed");
                    }
                }
                let is_stop = matches!(&ev, AgentEvent::Stop { .. });
                server
                    .notify(
                        "agent/event",
                        AgentEventNotification {
                            run_id: run_id.to_string(),
                            event: ev,
                            job_id: None,
                        },
                    )
                    .await;
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
                            run_id: run_id.to_string(),
                            status: RunStatus::Error,
                            error: Some(e.to_string()),
                        },
                    )
                    .await;
                break;
            }
        }
    }

    if server.is_run_cancelled(run_id) {
        return (RunOutcome::Errored, assistant_text);
    }

    let outcome = if errored {
        RunOutcome::Errored
    } else {
        RunOutcome::Completed
    };

    // Clôture UI (`busy: false`) — `drive_run` le fait déjà ; `drive_role_run` (v1_2) non.
    if !errored {
        server
            .notify(
                "agent/done",
                AgentDoneNotification {
                    run_id: run_id.to_string(),
                    status: RunStatus::Completed,
                    error: None,
                },
            )
            .await;
    }

    (outcome, assistant_text)
}

#[allow(dead_code)]
async fn drive_run(
    server: &Server,
    run_id: String,
    setup: AgentSetup,
    user_blocks: Vec<Content>,
) -> Result<RunOutcome, RunOutcome> {
    let AgentSetup {
        agent,
        history,
        ui_stats_path,
    } = setup;
    let mut stream = agent.run_with_history_blocks(history, user_blocks);
    let mut errored = false;

    while let Some(event) = stream.next().await {
        if server.is_run_cancelled(&run_id) {
            break;
        }
        match event {
            Ok(ev) => {
                if let Some(ref p) = ui_stats_path {
                    if let Err(e) = merge_ui_stats_from_agent_event(p, &ev).await {
                        warn!(error = %e, path = %p, "session ui-stats persist failed");
                    }
                }
                let is_stop = matches!(&ev, AgentEvent::Stop { .. });
                server
                    .notify(
                        "agent/event",
                        AgentEventNotification {
                            run_id: run_id.clone(),
                            event: ev,
                            job_id: None,
                        },
                    )
                    .await;
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

    if server.is_run_cancelled(&run_id) {
        return Err(RunOutcome::Errored);
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

/// Construit les blocs `Content` du message utilisateur pour le nouveau tour.
/// Le prompt textuel est toujours présent en tête, suivi des images
/// éventuelles. L'ordre est délibéré : la plupart des modèles vision (Ollama
/// vision, Gemma3-Vision, Qwen-VL) ancrent le texte avant les images.
fn strip_image_base64(data: &str) -> String {
    let t = data.trim();
    if let Some(rest) = t.strip_prefix("data:") {
        if let Some((_meta, payload)) = rest.split_once(',') {
            return payload.replace(['\n', '\r', ' '], "");
        }
    }
    t.replace(['\n', '\r', ' '], "")
}

fn build_user_blocks(params: &AgentRunParams) -> Vec<Content> {
    let image_count = params.images.len();
    let mut blocks: Vec<Content> =
        Vec::with_capacity(1 + image_count.saturating_mul(2));
    let mut prompt = params.prompt.clone();
    if prompt.is_empty() && image_count > 0 {
        prompt = "[Attached images]".to_string();
    }
    if image_count > 0 {
        let list = params
            .images
            .iter()
            .map(|img| {
                img.rel_path
                    .as_deref()
                    .or(img.abs_path.as_deref())
                    .unwrap_or("(image)")
            })
            .map(|p| format!("- {p}"))
            .collect::<Vec<_>>()
            .join("\n");
        if !prompt.contains("[Attached images]") && !prompt.contains("[Images jointes]") {
            prompt = format!("{prompt}\n\n[Attached images]\n{list}");
        }
    }
    blocks.push(Content::text(prompt));
    for (i, img) in params.images.iter().enumerate() {
        let idx = i + 1;
        let label = img
            .rel_path
            .as_deref()
            .or(img.abs_path.as_deref())
            .map(|p| format!("[Image {idx}: {p}]"))
            .unwrap_or_else(|| format!("[Image {idx}]"));
        blocks.push(Content::text(label));
        blocks.push(Content::image(
            img.mime.clone(),
            strip_image_base64(&img.data),
        ));
    }
    blocks
}

#[cfg(test)]
mod image_block_tests {
    use super::*;
    use crate::jsonrpc::protocol::AgentRunImage;

    #[test]
    fn build_user_blocks_includes_pixels_and_path_caption() {
        let params = AgentRunParams {
            prompt: "describe".into(),
            images: vec![AgentRunImage {
                mime: "image/png".into(),
                data: "AAAA".into(),
                rel_path: Some("./.drox/attachments/x.png".into()),
                abs_path: None,
            }],
            ..Default::default()
        };
        let blocks = build_user_blocks(&params);
        assert_eq!(blocks.len(), 3);
        assert!(matches!(&blocks[1], Content::Text { text } if text.contains("x.png")));
        assert!(matches!(&blocks[2], Content::Image { data, .. } if data == "AAAA"));
    }

    #[test]
    fn strip_image_base64_removes_data_url_prefix() {
        assert_eq!(
            strip_image_base64("data:image/png;base64,QQ=="),
            "QQ=="
        );
    }
}

/// Bloc prompt indiquant au modèle quels outils ne sont pas disponibles.
fn format_disabled_tools_notice(disabled: &[String]) -> Option<String> {
    const ALWAYS_ACTIVE: &[&str] = &["ask_user_question", "todo_write"];
    let names: Vec<&str> = disabled
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !ALWAYS_ACTIVE.contains(s))
        .collect();
    if names.is_empty() {
        return None;
    }
    Some(format!(
        "\n\n## Tools unavailable in this workspace\n\
         The user **disabled** the following tools — do not call them: {}.",
        names.join(", ")
    ))
}

/// Construit la registry de tools pour un run donné : on part de la registry
/// par défaut, puis pour chaque nom déclaré par le client dans
/// `executableTools` on remplace l'implémentation locale par un
/// [`RemoteTool`] qui ré-émet l'appel via `tool/exec`. Si le nom n'existe pas
/// dans la registry locale, il est ignoré (rien à wrapper).
pub(crate) fn wrap_executable_tools(
    mut registry: ToolRegistry,
    server: &Server,
    run_id: &str,
) -> ToolRegistry {
    let remote_names = server.executable_tools();
    if remote_names.is_empty() {
        return registry;
    }
    for name in remote_names {
        let Some(inner) = registry.get(&name) else {
            // Normal for orchestration Architect runs: allowlist excludes file_edit/bash/etc.;
            // those tools are wrapped when the Executor role registry includes them.
            tracing::debug!(
                %name,
                "client declared executable tool but no local counterpart in this run registry; ignored"
            );
            continue;
        };
        let wrapper = RemoteTool::wrap(server.clone(), &inner, run_id.to_string());
        registry.register(Arc::new(wrapper));
    }
    registry
}

fn build_permission_policy(
    params: &AgentRunParams,
    workspace: &Utf8PathBuf,
) -> Result<(PermissionMode, PermissionPolicy), RpcError> {
    let no_settings = params.no_settings.unwrap_or(false);
    let (user_path, project_path, local_path): (Option<PathBuf>, Option<PathBuf>, Option<PathBuf>) =
        if no_settings {
            (None, None, None)
        } else {
            let user = dirs::home_dir().map(|h| h.join(".drox").join("settings.json"));
            let drox_dir = workspace.as_std_path().join(".drox");
            let project = Some(drox_dir.join("settings.json"));
            let local = Some(drox_dir.join("settings.local.json"));
            (user, project, local)
        };

    let layered = LayeredConfig::load(
        user_path.as_deref(),
        project_path.as_deref(),
        local_path.as_deref(),
    )
    .map_err(|e| RpcError::new(CONFIG_ERROR, format!("settings: {e}")))?;

    let mut rules: RuleSet = layered.build_rule_set();
    push_rules(&mut rules, &params.allow, PermissionBehavior::Allow);
    push_rules(&mut rules, &params.ask, PermissionBehavior::Ask);
    push_rules(&mut rules, &params.deny, PermissionBehavior::Deny);

    let mode = params.mode.as_deref().map_or_else(
        || layered.effective_mode().unwrap_or(PermissionMode::Default),
        PermissionMode::from_str_lossy,
    );

    for unreachable in detect_unreachable_rules(&rules, &DetectUnreachableOptions::default()) {
        tracing::warn!(
            rule = %format_rule(&unreachable.rule.value),
            reason = %unreachable.reason,
            fix = %unreachable.fix,
            "règle de permission inatteignable (masquée)"
        );
    }

    let home = dirs::home_dir().unwrap_or_else(|| workspace.as_std_path().to_path_buf());
    let engine = Arc::new(
        PermissionEngine::with_rules(rules).with_path_context(PathMatchContext::new(
            workspace.as_std_path(),
            home,
        )),
    );
    Ok((mode, PermissionPolicy::new(engine, mode)))
}

fn push_rules(set: &mut RuleSet, raw: &[String], behavior: PermissionBehavior) {
    for s in raw {
        set.push(Rule {
            value: parse_rule(s),
            behavior,
            source: RuleSource::CliArg,
        });
    }
}

async fn build_transcript(
    params: &AgentRunParams,
    system_merged: Option<&str>,
) -> Result<
    (
        Vec<drox_types::Message>,
        Option<TranscriptSessionConfig>,
        Option<Utf8PathBuf>,
    ),
    RpcError,
> {
    let Some(ref sid) = params.session_id else {
        return Ok((Vec::new(), None, None));
    };
    if !sid.starts_with("ses_") {
        return Err(RpcError::new(
            INVALID_PARAMS,
            "sessionId must start with `ses_`",
        ));
    }
    let dir = match params.session_dir.clone() {
        Some(p) => p,
        None => {
            let workspace = resolve_workspace(params.workspace.clone())?;
            drox_engine::workspace_sessions_dir(&workspace)
        }
    };
    let id = SessionId::from_string(sid.clone());
    let path = transcript_path(&dir, &id);
    let stats_path = session_ui_stats_path(&dir, &id);
    let history = match read_transcript(&path).await {
        Ok(h) => h,
        Err(SessionError::NotFound(_)) => Vec::new(),
        Err(e) => return Err(RpcError::new(ENGINE_ERROR, format!("session read: {e}"))),
    };
    let append_from = history.len() + usize::from(system_merged.is_some());
    let sink = JsonlTranscriptSink::arc(path);
    Ok((
        history,
        Some(TranscriptSessionConfig {
            sink,
            append_from_message_index: append_from,
        }),
        Some(stats_path),
    ))
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
        AgentEvent::Stop { usage, .. } => {
            if usage.input_tokens > 0 || usage.output_tokens > 0 {
                s.total_in = s.total_in.saturating_add(u64::from(usage.input_tokens));
                s.total_out = s.total_out.saturating_add(u64::from(usage.output_tokens));
                // M5c — `#ctx` = parent history only (`ContextUsage` / snip), not last LLM usage.
                dirty = true;
            }
        }
        AgentEvent::ContextSnip {
            tokens_used_after, ..
        } => {
            s.ctx = usize_to_u32_saturated(*tokens_used_after);
            dirty = true;
        }
        AgentEvent::ContextUsage { parent_tokens, .. } => {
            if *parent_tokens > 0 {
                s.ctx = usize_to_u32_saturated(*parent_tokens);
                dirty = true;
            }
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


/// `UserAsker` qui refuse systématiquement les questions interactives.
///
/// Sélectionné quand `clientCapabilities.interactiveAsk` est `false` (ou
/// absent). Le client doit alors pré-configurer ses règles
/// `allow`/`ask`/`deny` ou utiliser `mode: "bypassPermissions"` /
/// `acceptEdits` pour éviter les blocages. Le tool `ask_user_question`
/// retournera systématiquement `ToolError::Interactive` dans ce cas.
pub(crate) struct RefuseAsker;

#[async_trait]
impl UserAsker for RefuseAsker {
    async fn ask(&self, q: UserQuestion) -> Result<UserAnswer, ToolError> {
        warn!(prompt = %q.prompt, "RefuseAsker active (client did not declare interactiveAsk)");
        Err(ToolError::interactive(
            "interactive prompts are disabled : client did not declare `interactiveAsk` \
             capability. Pre-configure allow/ask/deny rules or set mode to acceptEdits / \
             bypassPermissions.",
        ))
    }
}

/// `UserAsker` qui délègue au client via la requête serveur→client
/// `user/ask` (Sprint Questions bloquantes — §2.13 du backlog).
///
/// Le wrapper `ask_many` envoie **une seule** requête JSON-RPC contenant la
/// liste complète des questions ; cela permet au client de matérialiser la
/// carte « Questions » avec sa file 1 of N en une seule passe UI (et donc
/// au modèle d'attendre **un seul** round-trip réseau quel que soit le
/// nombre de questions).
///
/// L'implémentation par défaut de `ask` (mono-question) re-dispatch vers
/// `ask_many` pour rester cohérente.
struct RpcUserAsker {
    server: Server,
    run_id: String,
}

#[async_trait]
impl UserAsker for RpcUserAsker {
    async fn ask(&self, question: UserQuestion) -> Result<UserAnswer, ToolError> {
        let mut answers = self.ask_many(vec![question], None).await?;
        answers
            .pop()
            .ok_or_else(|| ToolError::interactive("user/ask returned no answer"))
    }

    async fn ask_many(
        &self,
        questions: Vec<UserQuestion>,
        title: Option<String>,
    ) -> Result<Vec<UserAnswer>, ToolError> {
        let ask_id = Uuid::new_v4().to_string();
        let rpc_questions: Vec<UserAskQuestion> = questions
            .iter()
            .enumerate()
            .map(|(i, q)| UserAskQuestion {
                id: q
                    .id
                    .clone()
                    .unwrap_or_else(|| format!("q{}", i + 1)),
                prompt: q.prompt.clone(),
                options: if !q.structured_options.is_empty() {
                    q.structured_options
                        .iter()
                        .map(|o| UserAskOption {
                            id: o.id.clone(),
                            label: o.label.clone(),
                        })
                        .collect()
                } else {
                    q.choices
                        .iter()
                        .enumerate()
                        .map(|(j, label)| UserAskOption {
                            id: format!("opt{}", j + 1),
                            label: label.clone(),
                        })
                        .collect()
                },
                allow_multiple: q.allow_multiple,
                // On respecte le toggle remonté par le modèle via le tool
                // (cf. `AskQuestionItem::allow_free_text`). L'UI cliente
                // affiche le champ « détails optionnels » uniquement si ce
                // drapeau ou l'absence d'options structurées le justifie.
                allow_free_text: q.allow_free_text,
            })
            .collect();

        let params = UserAskParams {
            run_id: self.run_id.clone(),
            ask_id,
            title,
            questions: rpc_questions.clone(),
        };

        let value = self
            .server
            .send_request("user/ask", &params)
            .await
            .map_err(|e| {
                ToolError::interactive(format!(
                    "user/ask rejected: {} (code={})",
                    e.message, e.code
                ))
            })?;

        let result: UserAskResult = serde_json::from_value(value).map_err(|e| {
            ToolError::interactive(format!("user/ask returned malformed result: {e}"))
        })?;

        // Reconstruit les `UserAnswer` en s'alignant sur l'ordre **et** les
        // ids des questions envoyées : un client correct renvoie les mêmes
        // ids dans le même ordre, mais on tolère le désordre en cherchant
        // par id pour éviter les bugs subtils côté UI.
        let mut answers = Vec::with_capacity(questions.len());
        for (i, q_in) in questions.iter().enumerate() {
            let q_rpc = &rpc_questions[i];
            let matched = result
                .answers
                .iter()
                .find(|a| a.id == q_rpc.id)
                .or_else(|| result.answers.get(i));
            let Some(a) = matched else {
                return Err(ToolError::interactive(format!(
                    "user/ask missing answer for `{}`",
                    q_rpc.id
                )));
            };

            // Map `option_ids` ("opt1", "opt2"...) → indices 0-based dans
            // `q.choices` côté tool.
            let indices: Vec<usize> = a
                .option_ids
                .iter()
                .filter_map(|opt_id| {
                    q_rpc
                        .options
                        .iter()
                        .position(|o| &o.id == opt_id)
                })
                .collect();

            // Le `text` rendu au tool combine free_text + labels d'options
            // (joints par `,`) pour rester rétro-compatible avec les askers
            // mono-question existants qui ne regardent que `text`.
            let label_join = indices
                .iter()
                .filter_map(|i| q_in.choices.get(*i))
                .cloned()
                .collect::<Vec<_>>()
                .join(",");
            let text = if a.free_text.trim().is_empty() {
                label_join
            } else if label_join.is_empty() {
                a.free_text.clone()
            } else {
                format!("{label_join}\n{}", a.free_text)
            };

            answers.push(UserAnswer {
                id: Some(a.id.clone()),
                text,
                indices,
                skipped: a.skipped,
            });
        }

        Ok(answers)
    }
}

/// Fenêtre Ollama par défaut des sous-agents (4b Explore) — plus basse que le parent
/// pour limiter la VRAM quand deux modèles sont chargés côte à côte.
const DEFAULT_SUBAGENT_NUM_CTX: i64 = 8192;

fn resolve_subagent_num_ctx(params: &AgentRunParams) -> i64 {
    params
        .subagents_num_ctx
        .map(|n| n as i64)
        .or_else(|| crate::jsonrpc::handlers::common::env_i64("DROX_SUBAGENTS_NUM_CTX"))
        .unwrap_or(DEFAULT_SUBAGENT_NUM_CTX)
        .clamp(2048, 200_000)
}

fn effective_parent_model(params: &AgentRunParams) -> String {
    params
        .model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| std::env::var("DROX_MODEL").ok())
        .unwrap_or_else(|| "llama3.2".into())
}

fn effective_subagent_model(params: &AgentRunParams) -> String {
    params
        .subagents_model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| effective_parent_model(params))
}

/// Client LLM pour les sous-agents — jamais le parent si modèle ou `num_ctx` diffère.
fn resolve_subagent_llm(
    params: &AgentRunParams,
    parent_llm: &Arc<OllamaClient>,
    subagent_num_ctx: i64,
    parent_num_ctx: i64,
) -> Result<Arc<OllamaClient>, RpcError> {
    let parent_model = effective_parent_model(params);
    let subagent_model = effective_subagent_model(params);
    if subagent_model == parent_model && subagent_num_ctx == parent_num_ctx {
        tracing::debug!(
            model = %subagent_model,
            num_ctx = subagent_num_ctx,
            "sous-agent — réutilisation du client LLM parent"
        );
        return Ok(parent_llm.clone());
    }
    tracing::info!(
        subagent_model = %subagent_model,
        parent_model = %parent_model,
        subagent_num_ctx,
        parent_num_ctx,
        "sous-agent — client Ollama dédié (modèle ou num_ctx distinct)"
    );
    let llm_config = super::common::build_subagent_llm_config(
        params.server.clone(),
        Some(subagent_model.clone()),
        params.api_key.clone(),
        &params.headers,
        subagent_num_ctx,
    )?;
    tracing::info!(
        subagent_model = %subagent_model,
        llm_config_num_ctx = llm_config.num_ctx,
        "sous-agent — config LLM (num_ctx client Ollama)"
    );
    Ok(Arc::new(
        OllamaClient::new(llm_config)
            .map_err(|e| RpcError::new(CONFIG_ERROR, format!("subagent LLM init failed: {e}")))?,
    ))
}

/// Client LLM unique pour l'exécutant orchestration (`v1_2`).
/// Parallélisme des tâches : `max_parallel_executors` + slots Ollama (`OLLAMA_NUM_PARALLEL`).
pub(crate) async fn build_orchestration_executor_llm(
    params: &AgentRunParams,
    parent_llm: &Arc<OllamaClient>,
    parent_num_ctx: i64,
    executor_model: &str,
) -> Result<Vec<Arc<dyn drox_llm::LlmClient>>, RpcError> {
    let parent_model = effective_parent_model(params);
    let executor_model = executor_model.trim();
    let executor_model = if executor_model.is_empty() {
        effective_subagent_model(params)
    } else {
        executor_model.to_string()
    };
    let executor_num_ctx = resolve_subagent_num_ctx(params);
    // Même modèle → réutiliser le client parent (l'exécuteur passe `num_ctx` par requête
    // dans `EngineOrchestrationDelegate`). Un second client forçait un rechargement Ollama
    // (VRAM) et des 500 « model failed to load » alors que l'architecte tournait déjà.
    if executor_model == parent_model {
        tracing::info!(
            executor_model = %executor_model,
            executor_num_ctx,
            parent_num_ctx,
            "orchestration executor — reusing parent Ollama client (same model)"
        );
        return Ok(vec![parent_llm.clone()]);
    }
    tracing::info!(
        executor_model = %executor_model,
        parent_model = %parent_model,
        executor_num_ctx,
        parent_num_ctx,
        "orchestration executor — dedicated Ollama client (different model)"
    );
    let llm_config = super::common::build_subagent_llm_config(
        params.server.clone(),
        Some(executor_model),
        params.api_key.clone(),
        &params.headers,
        executor_num_ctx,
    )?;
    Ok(vec![Arc::new(
        OllamaClient::new(llm_config).map_err(|e| {
            RpcError::new(CONFIG_ERROR, format!("executor LLM init failed: {e}"))
        })?,
    )])
}

/// Relaye événements exécutant (RoleEnter, tools, texte) sur le run parent — FIFO.
pub(crate) fn orchestration_delegate_hook(
    server: &Server,
    run_id: &str,
) -> OrchestrationDelegateEventHook {
    let server = server.clone();
    let run_id = run_id.to_string();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(AgentEvent, Option<String>)>();
    let server_consumer = server.clone();
    let run_id_consumer = run_id.clone();
    tokio::spawn(async move {
        while let Some((event, job_id)) = rx.recv().await {
            if server_consumer.is_run_cancelled(&run_id_consumer) {
                continue;
            }
            server_consumer
                .notify(
                    "agent/event",
                    AgentEventNotification {
                        run_id: run_id_consumer.clone(),
                        event,
                        job_id,
                    },
                )
                .await;
        }
    });
    Arc::new(move |ev| {
        let (event, relay_job_id) = match ev {
            OrchestrationDelegateHookEvent::RoleEnter { role_id } => (
                AgentEvent::RoleEnter { role_id },
                None,
            ),
            OrchestrationDelegateHookEvent::ExecutorTaskStart {
                task_id,
                description,
            } => (
                AgentEvent::SubagentStart {
                subagent_type: "executor".to_string(),
                description,
                job_id: Some(task_id),
                background: false,
            },
                None,
            ),
            OrchestrationDelegateHookEvent::ExecutorTaskDone {
                task_id,
                status,
                summary,
                truncated,
                iterations_used,
                success,
            } => (
                AgentEvent::SubagentDone {
                subagent_type: "executor".to_string(),
                summary: if summary.is_empty() {
                    format!("Task {task_id} — {status}")
                } else {
                    summary
                },
                truncated,
                iterations_used,
                job_id: Some(task_id.clone()),
                success,
                task_status: Some(status.clone()),
                error_message: if success {
                    None
                } else {
                    Some(format!("Executor {task_id} — {status}"))
                },
            },
                None,
            ),
            OrchestrationDelegateHookEvent::AgentEventJson { mut payload } => {
                let job_id = payload
                    .get("job_id")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                if let Some(obj) = payload.as_object_mut() {
                    obj.remove("job_id");
                }
                match serde_json::from_value::<AgentEvent>(payload) {
                    Ok(e) if e.is_parent_context_gauge() => return,
                    Ok(e) => (e, job_id),
                    Err(_) => return,
                }
            }
        };
        let _ = tx.send((event, relay_job_id));
    })
}

/// Notifications UI `subagent_start` / `subagent_done` sur le run parent (M5).
fn subagent_event_hook(server: &Server, run_id: &str) -> SubagentEventHook {
    let server = server.clone();
    let run_id = run_id.to_string();
    Arc::new(move |ev| {
        let event = match ev {
            SubagentHookEvent::Start {
                subagent_type,
                description,
                job_id,
                background,
            } => AgentEvent::SubagentStart {
                subagent_type,
                description,
                job_id,
                background,
            },
            SubagentHookEvent::Done {
                subagent_type,
                summary,
                truncated,
                iterations_used,
                job_id,
                success,
                error_message,
            } => AgentEvent::SubagentDone {
                subagent_type,
                summary,
                truncated,
                iterations_used,
                job_id,
                success,
                task_status: None,
                error_message,
            },
        };
        let server = server.clone();
        let run_id = run_id.clone();
        tokio::spawn(async move {
            server
                .notify(
                    "agent/event",
                    AgentEventNotification {
                        run_id,
                        event,
                        job_id: None,
                    },
                )
                .await;
        });
    })
}

