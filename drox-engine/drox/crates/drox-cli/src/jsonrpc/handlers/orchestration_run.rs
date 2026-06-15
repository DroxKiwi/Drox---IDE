//! Orchestration `role_split` — routage simple puis run discuss ou edit.

use drox_engine::{
    append_engine_trace_record, architect_discussion_system_prompt_for_start_run,
    architect_discussion_user_message,
    architect_edit_system_prompt_core_for_run_vars, architect_user_message,
    engine_trace_path,
    initial_run_objective_for_concrete_edit, resolve_engine_tuning, AgentEvent, ArchitectGate,
    EngineTracePayload, EngineTraceRecord, OrchestrationConfig, RoleId, RunRoutingTrace, RunSpec,
    StartRunKind, resolve_run_intent, RunIntentFlags,
};
use drox_types::Content;

use crate::jsonrpc::handlers::agent_run::{
    build_agent_setup, build_orchestration_llm, drive_role_run, notify_agent_event,
    notify_agent_run_completed, AgentSetupOverrides, RunOutcome,
};
use crate::jsonrpc::handlers::common::resolve_workspace;
use crate::jsonrpc::protocol::AgentRunParams;
use crate::jsonrpc::server::Server;

/// Run `role_split` complet : routage puis discussion ou edit architecte.
pub async fn drive_role_split_run(
    server: &Server,
    run_id: String,
    params: &AgentRunParams,
    _user_blocks: Vec<Content>,
) -> Result<RunOutcome, RunOutcome> {
    let resolved = resolve_architect_gate(server, params).await?;
    tracing::info!(
        architect_gate = resolved.gate.as_str(),
        start_run = resolved.start_run.wire_id(),
        greeting_only = resolved.intent_flags.greeting_only,
        expects_workspace_mutation = resolved.intent_flags.expects_workspace_mutation,
        intent_probe_source = ?resolved.intent_flags.source,
        "orchestration role_split — mode resolved"
    );
    record_run_routing_trace(server, &run_id, params, &resolved).await;
    match resolved.gate {
        ArchitectGate::Discuss | ArchitectGate::Analyze => {
            drive_role_split_discuss(server, run_id, params, resolved).await
        }
        ArchitectGate::Edit => {
            drive_role_split_edit(server, run_id, params, resolved).await
        }
    }
}

/// Routage après intent probe (auto / discussion) ou défauts RPC edit/analyze.
struct ResolvedOrchestration {
    gate: ArchitectGate,
    start_run: StartRunKind,
    intent_flags: RunIntentFlags,
}

impl ResolvedOrchestration {
    fn from_intent(resolved: drox_engine::ResolvedRunIntent) -> Self {
        let chain = resolved.gate_chain();
        Self {
            gate: chain.gate,
            start_run: chain.start_run,
            intent_flags: resolved.flags,
        }
    }
}

async fn resolve_architect_gate(
    server: &Server,
    params: &AgentRunParams,
) -> Result<ResolvedOrchestration, RunOutcome> {
    let raw_mode = params.architect_interaction_mode.as_deref();
    let rpc_gate = raw_mode.and_then(ArchitectGate::parse_param);
    if raw_mode.is_some() && rpc_gate.is_none() {
        tracing::warn!(
            architect_interaction_mode = ?raw_mode,
            "unknown interaction mode — intent probe + auto routing"
        );
    } else if let Some(gate) = rpc_gate {
        tracing::info!(
            architect_gate = gate.as_str(),
            source = "rpc_param",
            "mode forced"
        );
    }

    let llm = build_orchestration_llm(server, params)
        .await
        .map_err(|_| RunOutcome::Errored)?;
    let resolved = resolve_run_intent(llm, &params.prompt, rpc_gate).await;
    Ok(ResolvedOrchestration::from_intent(resolved))
}

async fn record_run_routing_trace(
    server: &Server,
    run_id: &str,
    params: &AgentRunParams,
    resolved: &ResolvedOrchestration,
) {
    let flags = &resolved.intent_flags;
    let event = AgentEvent::RunRouting {
        architect_gate: resolved.gate.as_str().to_string(),
        start_run: resolved.start_run.wire_id().to_string(),
        greeting_only: flags.greeting_only,
        expects_workspace_mutation: flags.expects_workspace_mutation,
        intent_source: flags.source.as_str().to_string(),
    };
    notify_agent_event(server, run_id, event.clone()).await;

    let Some(ref sid) = params.session_id else {
        return;
    };
    if !sid.starts_with("ses_") {
        return;
    }
    let dir = match params.session_dir.clone() {
        Some(p) => p,
        None => {
            let Ok(workspace) = resolve_workspace(params.workspace.clone()) else {
                return;
            };
            drox_engine::workspace_sessions_dir(&workspace)
        }
    };
    let path = engine_trace_path(&dir, &drox_types::SessionId::from_string(sid.clone()));
    let record = EngineTraceRecord::new(EngineTracePayload::RunRouting(RunRoutingTrace {
        architect_gate: resolved.gate.as_str().to_string(),
        start_run: resolved.start_run.wire_id().to_string(),
        greeting_only: flags.greeting_only,
        expects_workspace_mutation: flags.expects_workspace_mutation,
        intent_source: flags.source.as_str().to_string(),
    }));
    if let Err(err) = append_engine_trace_record(&path, &record).await {
        tracing::warn!(error = %err, path = %path, "engine_trace run_routing append failed");
    }
}

async fn drive_role_split_discuss(
    server: &Server,
    run_id: String,
    params: &AgentRunParams,
    resolved: ResolvedOrchestration,
) -> Result<RunOutcome, RunOutcome> {
    let start_run = resolved.start_run;
    let allow_reads = start_run.allows_discussion_reads();
    let tuning = drox_engine::resolve_engine_tuning(
        params.engine_strictness.as_deref(),
        params.engine_tuning.as_ref(),
    );
    let mut discussion_params = params.clone();
    let discuss_max = tuning.discussion_max_iterations.clamp(1, 25);
    discussion_params.max_iterations = Some(
        discussion_params
            .max_iterations
            .unwrap_or(discuss_max as usize)
            .clamp(1, 25),
    );

    let orch_cfg = OrchestrationConfig::from_agent_run(discussion_params.model.as_deref());

    let spec = RunSpec::for_architect_discussion_with_reads(allow_reads);
    let wire = spec.role_wire_id();

    tracing::info!(
        discussion_allow_reads = allow_reads,
        start_run = start_run.wire_id(),
        "orchestration role_split — architect_discussion"
    );

    let discussion_system =
        architect_discussion_system_prompt_for_start_run(start_run, &tuning);

    let setup = build_agent_setup(
        server,
        &run_id,
        &discussion_params,
        spec,
        AgentSetupOverrides {
            model_override: Some(orch_cfg.architect_model.clone()),
            system_override: Some(discussion_system),
            run_objective_override: None,
            run_intent: Some(resolved.intent_flags),
        },
    )
    .await
    .map_err(|_| RunOutcome::Errored)?;

    let blocks = vec![Content::text(architect_discussion_user_message(
        &discussion_params.prompt,
    ))];
    let (outcome, assistant_text, answering_text) =
        drive_role_run(server, &run_id, setup, blocks, wire, false, true).await;
    if outcome == RunOutcome::Errored {
        Err(RunOutcome::Errored)
    } else {
        let source = if answering_text.trim().is_empty() {
            assistant_text.as_str()
        } else {
            answering_text.as_str()
        };
        let reply = drox_engine::extract_discussion_user_facing_reply(source);
        if !reply.trim().is_empty() {
            notify_agent_event(
                server,
                &run_id,
                AgentEvent::UserFacingReply { text: reply },
            )
            .await;
        }
        notify_agent_run_completed(server, &run_id).await;
        Ok(RunOutcome::Completed)
    }
}

async fn drive_role_split_edit(
    server: &Server,
    run_id: String,
    params: &AgentRunParams,
    resolved: ResolvedOrchestration,
) -> Result<RunOutcome, RunOutcome> {
    let start_run = resolved.start_run;
    let tuning = resolve_engine_tuning(
        params.engine_strictness.as_deref(),
        params.engine_tuning.as_ref(),
    );
    let orch_cfg = OrchestrationConfig::from_agent_run(params.model.as_deref());

    let run_objective_override = initial_run_objective_for_concrete_edit(&params.prompt);

    tracing::info!(
        architect_model = %orch_cfg.architect_model,
        start_run = start_run.wire_id(),
        run_objective_locked = run_objective_override.is_some(),
        "orchestration role_split — architect_edit"
    );

    let architect_spec = RunSpec::for_orchestration_role(RoleId::Architect);
    let architect_wire = architect_spec.role_wire_id();

    let architect_model = orch_cfg.architect_model.clone();

    let architect_setup = build_agent_setup(
        server,
        &run_id,
        params,
        architect_spec,
        AgentSetupOverrides {
            model_override: Some(architect_model),
            system_override: Some(architect_edit_system_prompt_core_for_run_vars(&tuning)),
            run_objective_override,
            run_intent: Some(resolved.intent_flags),
        },
    )
    .await
    .map_err(|_| RunOutcome::Errored)?;

    let architect_blocks = vec![Content::text(architect_user_message(&params.prompt))];
    let (arch_outcome, _, _) = drive_role_run(
        server,
        &run_id,
        architect_setup,
        architect_blocks,
        architect_wire,
        true,
        true,
    )
    .await;

    if arch_outcome == RunOutcome::Errored {
        Err(RunOutcome::Errored)
    } else {
        Ok(RunOutcome::Completed)
    }
}
