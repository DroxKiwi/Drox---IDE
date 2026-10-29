//! Session agent interactive (hors `--serve` / `--list-sessions`).

use std::io::Write;
use std::sync::Arc;

use anyhow::Context;
use drox_cli::{language, prompts};
use drox_engine::{
    Agent, AgentConfig, AgentEvent, ContextPolicy, JsonlTranscriptSink, PermissionMode,
    SessionError, TranscriptSessionConfig, default_sessions_dir, default_tool_registry,
    load_memdir, memdir_system_prefix, read_transcript, transcript_path,
};
use drox_llm::{ChatOptions, LlmConfig, create_llm_client};
use drox_tools::ToolContext;
use drox_types::SessionId;
use futures::StreamExt;

use crate::stdin_asker::StdinUserAsker;

use super::cli::Cli;
use super::headers::collect_headers;
use super::cli_permission_policy::build_permission_policy;
use super::setup::{merge_optional_system, parse_env_f32, parse_env_i64, resolve_workspace};

pub(crate) async fn run_interactive_agent(cli: Cli, prompt: &str) -> anyhow::Result<()> {
    let headers = collect_headers(cli.api_key.as_deref(), &cli.headers)
        .context("invalid HTTP header argument")?;
    let mut config = LlmConfig::try_from_str(&cli.server, &cli.model)
        .with_context(|| format!("invalid server URL: {}", cli.server))?;
    for (k, v) in &headers {
        config = config.with_header(k, v);
    }
    if let Some(n) = parse_env_i64("DROX_NUM_PREDICT") {
        config = config.with_num_predict(n);
    }
    if let Some(n) = parse_env_i64("DROX_NUM_CTX") {
        config = config.with_num_ctx(n);
    }
    if let Some(v) = parse_env_f32("DROX_TOP_P") {
        config = config.with_top_p(Some(v));
    }
    if let Some(n) = parse_env_i64("DROX_TOP_K") {
        config = config.with_top_k(Some(n));
    }
    if let Some(v) = parse_env_f32("DROX_REPEAT_PENALTY") {
        config = config.with_repeat_penalty(Some(v));
    }
    if let Some(n) = parse_env_i64("DROX_SEED") {
        config = config.with_seed(Some(n));
    }
    if let Some(v) = parse_env_f32("DROX_MIN_P") {
        config = config.with_min_p(Some(v));
    }
    if let Some(v) = parse_env_f32("DROX_PRESENCE_PENALTY") {
        config = config.with_presence_penalty(Some(v));
    }
    if let Some(v) = parse_env_f32("DROX_FREQUENCY_PENALTY") {
        config = config.with_frequency_penalty(Some(v));
    }
    if let Ok(s) = std::env::var("DROX_KEEP_ALIVE") {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            config = config.with_keep_alive(Some(trimmed.to_owned()));
        }
    }
    tracing::info!(
    headers = headers.len(),
    api_key_set = cli.api_key.is_some(),
    num_predict = config.num_predict,
    num_ctx = config.num_ctx,
    top_p = ?config.top_p,
    top_k = ?config.top_k,
    repeat_penalty = ?config.repeat_penalty,
    seed = ?config.seed,
    min_p = ?config.min_p,
    presence_penalty = ?config.presence_penalty,
    frequency_penalty = ?config.frequency_penalty,
    keep_alive = ?config.keep_alive,
    "LLM config prête"
    );
    let num_ctx = config.num_ctx.max(2048) as usize;
    let llm = create_llm_client(Some(cli.provider.as_str()), config)
        .context("failed to build LLM client")?;
    let registry = Arc::new(default_tool_registry());
    let workspace = resolve_workspace(cli.workspace.clone())?;
    let workspace_fingerprint = workspace.as_str().to_string();
    tracing::info!(%workspace, apply = cli.apply, plan = cli.plan, "workspace résolu");

    let mem = load_memdir(workspace.as_path())
        .await
        .context("lecture MEMORY.md / DROX.md")?;
    let base_system = merge_optional_system(cli.system.clone(), memdir_system_prefix(&mem));
    let mut base_system = prompts::prepend_core_system_prompt(base_system);
    // Sprint M1 — listing des sessions archivées injecté en début de prompt.
    // Échec silencieux : un dossier .drox/memory/sessions/ illisible ne
    // doit pas casser le démarrage CLI.
    let memory_listing =
        drox_engine::load_sessions_listing(workspace.as_path(), drox_engine::DEFAULT_LISTING_LIMIT)
            .await
            .unwrap_or_else(|e| {
                tracing::warn!(error = %e, "memory: failed to load sessions listing");
                Vec::new()
            });
    if let Some(block) = drox_engine::format_sessions_listing_for_prompt(&memory_listing) {
        base_system.push_str("\n\n");
        base_system.push_str(&block);
    }
    let skills_listing = drox_engine::load_skills_catalog(workspace.as_path())
        .await
        .unwrap_or_else(|e| {
            tracing::warn!(error = %e, "skills: failed to load catalog");
            Vec::new()
        });
    if let Some(block) = drox_engine::format_skills_listing_for_prompt(&skills_listing) {
        base_system.push_str("\n\n");
        base_system.push_str(&block);
    }
    let base_system = Some(base_system);
    let lang = language::from_env();
    if let Some(ref l) = lang {
        tracing::info!(language = %l.display, "langue principale appliquée");
    }
    let mut system_merged = language::merge_into_system(base_system, lang.as_ref());

    let sessions_dir = cli
        .session_dir
        .clone()
        .unwrap_or(default_sessions_dir().context("résolution répertoire sessions")?);

    let (history, transcript) = if let Some(ref sid) = cli.session {
        if !sid.starts_with("ses_") {
            anyhow::bail!("--session doit être un identifiant ses_…");
        }
        let id = SessionId::from_string(sid.clone());
        let path = transcript_path(&sessions_dir, &id);
        let history = match read_transcript(&path).await {
            Ok(h) => h,
            Err(SessionError::NotFound(_)) => Vec::new(),
            Err(e) => return Err(e.into()),
        };
        let append_from = history.len() + usize::from(system_merged.is_some());
        let sink = JsonlTranscriptSink::arc(path);
        (
            history,
            Some(TranscriptSessionConfig {
                sink,
                append_from_message_index: append_from,
            }),
        )
    } else {
        (Vec::new(), None)
    };

    let (mode, policy) = build_permission_policy(&cli, &workspace)?;
    tracing::info!(mode = mode.short_title(), "mode permission");

    let drox_ignore = drox_engine::DroxIgnoreMatcher::load_or_create(workspace.clone()).await?;
    let workspace_map = drox_engine::WorkspaceMapStore::load_or_create(
        workspace.clone(),
        workspace_fingerprint.clone(),
        Some(drox_ignore.clone()),
    )
    .await?;
    let mut base_for_map = system_merged.clone().unwrap_or_default();
    base_for_map.push_str("\n\n");
    base_for_map.push_str(&drox_ignore.format_for_prompt());
    if let Some(block) = workspace_map.format_for_prompt() {
        base_for_map.push_str("\n\n");
        base_for_map.push_str(&block);
    }
    system_merged = Some(base_for_map);

    let ctx = ToolContext::new(workspace.clone(), cli.apply)
        .with_plan_mode(cli.plan || mode == PermissionMode::Plan)
        .with_user_asker(Arc::new(StdinUserAsker))
        .with_scope_deferred(drox_tools::ScopeDeferredHandle::new())
        .with_workspace_map(workspace_map)
        .with_drox_ignore(drox_ignore);
    let tool_hooks = drox_engine::load_tool_hooks(&workspace);
    let memory_runtime = drox_engine::MemoryRuntime {
        workspace_root: workspace,
        llm: llm.clone(),
        compaction_prompt: prompts::COMPACTION_PROMPT.to_string(),
        compaction_config: drox_engine::CompactionConfig::default(),
        notes: drox_engine::SessionNotesHandle::new(),
        model_label: cli.model.clone(),
    };
    let agent_config = AgentConfig {
        system_prompt: system_merged,
        max_iterations: cli.max_iterations,
        chat_options: ChatOptions {
            temperature: cli.temperature,
            max_tokens: cli.max_tokens,
            stop_sequences: Vec::new(),
            tools: Vec::new(),
            ..ChatOptions::default()
        },
        permissions: Some(policy),
        context: Some(ContextPolicy::for_model_context_window(num_ctx)),
        transcript,
        memory: Some(memory_runtime),
        transcript_session_id: cli.session.clone(),
        workspace_fingerprint,
        max_parallel_tool_calls: drox_engine::DEFAULT_MAX_PARALLEL_TOOL_CALLS,
        tool_hooks: if tool_hooks.is_enabled() {
            Some(tool_hooks)
        } else {
            None
        },
        run_objective: None,
        context_load: Default::default(),
        work_plan_frame: false,
        analysis_frame: false,
        doc_ingestion_frame: false,
        session_intent_preclassified: false,
        explore_execution: false,
        // Pas de sélecteur de profil hors IDE : CORE complet = protocole complet.
        engine_profile: drox_engine::EngineProfile::CloudFull.id().to_string(),
        history_probe: false,
    };
    let agent = Agent::new(llm, registry, ctx, agent_config);

    let mut stream = agent.run_with_history(history, prompt.to_string());
    let stdout = std::io::stdout();
    let mut stderr = std::io::stderr();
    let mut out = stdout.lock();

    while let Some(event) = stream.next().await {
        match event.context("agent error")? {
            AgentEvent::TextDelta { text } => {
                out.write_all(text.as_bytes())?;
                out.flush()?;
            }
            AgentEvent::ToolStart {
                id,
                name,
                arguments,
            } => {
                writeln!(stderr, "\n[tool start] {name} ({id}) args={arguments}")?;
            }
            AgentEvent::ToolFinish {
                id,
                output,
                is_error,
            } => {
                let tag = if is_error { "error" } else { "ok" };
                writeln!(stderr, "[tool {tag}] {id} → {output}")?;
            }
            AgentEvent::Stop { reason, usage } => {
                writeln!(out)?;
                tracing::info!(
                    ?reason,
                    input_tokens = usage.input_tokens,
                    output_tokens = usage.output_tokens,
                    "agent terminé"
                );
                break;
            }
            AgentEvent::ContextSnip {
                tokens_freed,
                blocks_snipped,
                tokens_used_after,
            } => {
                writeln!(
                    stderr,
                    "[context snip] freed≈{tokens_freed} tok, blocks={blocks_snipped}, after≈{tokens_used_after}"
                )?;
            }
            AgentEvent::ContextCompacted {
                tokens_before,
                tokens_after,
                messages_removed,
                ..
            } => {
                writeln!(
                    stderr,
                    "[context compact] before≈{tokens_before} after≈{tokens_after} removed_msgs={messages_removed}"
                )?;
            }
            other => {
                tracing::debug!(event = ?other, "event agent non géré");
            }
        }
    }

    Ok(())
}
