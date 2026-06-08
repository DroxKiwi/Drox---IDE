//! Orchestration `role_split` — routage simple puis run discuss ou edit.

use drox_engine::{
    architect_discussion_system_prompt_for_start_run, architect_discussion_user_message,
    architect_edit_system_prompt_core_for_run_vars, architect_user_message,
    initial_run_objective_for_concrete_edit, resolve_engine_tuning, AgentEvent, ArchitectGate,
    GateChainResult, OrchestrationConfig, RoleId, RunSpec, StartRunKind,
};
use drox_types::Content;

use crate::jsonrpc::handlers::agent_run::{
    build_agent_setup, drive_role_run, notify_agent_event, notify_agent_run_completed,
    AgentSetupOverrides, OrchestrationDelegateWireInput, RunOutcome,
};
use crate::jsonrpc::protocol::AgentRunParams;
use crate::jsonrpc::server::Server;

/// Run `role_split` complet : routage puis discussion ou edit architecte.
pub async fn drive_role_split_run(
    server: &Server,
    run_id: String,
    params: &AgentRunParams,
    _user_blocks: Vec<Content>,
) -> Result<RunOutcome, RunOutcome> {
    let resolved = resolve_architect_gate(params);
    tracing::info!(
        architect_gate = resolved.gate.as_str(),
        start_run = resolved.start_run.wire_id(),
        "orchestration role_split — mode resolved"
    );
    match resolved.gate {
        ArchitectGate::Discuss | ArchitectGate::Analyze => {
            drive_role_split_discuss(server, run_id, params, resolved.start_run).await
        }
        ArchitectGate::Edit => {
            drive_role_split_edit(server, run_id, params, resolved.start_run).await
        }
    }
}

/// Override RPC `architectInteractionMode` ou défaut edit.
fn resolve_architect_gate(params: &AgentRunParams) -> GateChainResult {
    if let Some(raw) = params.architect_interaction_mode.as_deref() {
        if let Some(gate) = ArchitectGate::parse_param(raw) {
            tracing::info!(
                architect_gate = gate.as_str(),
                source = "rpc_param",
                "mode forcé"
            );
            return GateChainResult::from_rpc_override(gate);
        }
        tracing::warn!(
            architect_interaction_mode = %raw,
            "param mode inconnu — défaut edit"
        );
    }
    GateChainResult::default_for_prompt(&params.prompt)
}

async fn drive_role_split_discuss(
    server: &Server,
    run_id: String,
    params: &AgentRunParams,
    start_run: StartRunKind,
) -> Result<RunOutcome, RunOutcome> {
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

    let orch_cfg = OrchestrationConfig::from_agent_run(
        discussion_params.model.as_deref(),
        discussion_params.subagents_model.as_deref(),
        discussion_params.orchestration_max_parallel_executors,
    );

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
            force_disable_subagents: true,
            orchestration_delegate: None,
            run_objective_override: None,
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
    start_run: StartRunKind,
) -> Result<RunOutcome, RunOutcome> {
    let tuning = resolve_engine_tuning(
        params.engine_strictness.as_deref(),
        params.engine_tuning.as_ref(),
    );
    let orch_cfg = OrchestrationConfig::from_agent_run(
        params.model.as_deref(),
        params.subagents_model.as_deref(),
        params.orchestration_max_parallel_executors,
    );

    let run_objective_override = initial_run_objective_for_concrete_edit(&params.prompt);
    let delegation_enabled = tuning.executor_delegation_enabled;
    let parallel_slots = if delegation_enabled {
        orch_cfg.max_parallel_executors
    } else {
        1
    };

    tracing::info!(
        architect_model = %orch_cfg.architect_model,
        executor_model = %orch_cfg.executor_model,
        max_parallel_executors = orch_cfg.max_parallel_executors,
        executor_delegation_enabled = delegation_enabled,
        start_run = start_run.wire_id(),
        run_objective_locked = run_objective_override.is_some(),
        "orchestration role_split — architect_edit"
    );

    let architect_spec = RunSpec::for_orchestration_role(RoleId::Architect);
    let architect_wire = architect_spec.role_wire_id();

    let architect_model = orch_cfg.architect_model.clone();
    let orchestration_delegate = if delegation_enabled {
        Some(OrchestrationDelegateWireInput { orch_cfg })
    } else {
        None
    };

    let architect_setup = build_agent_setup(
        server,
        &run_id,
        params,
        architect_spec,
        AgentSetupOverrides {
            model_override: Some(architect_model),
            system_override: Some(architect_edit_system_prompt_core_for_run_vars(
                parallel_slots,
                &tuning,
            )),
            force_disable_subagents: true,
            orchestration_delegate,
            run_objective_override,
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
