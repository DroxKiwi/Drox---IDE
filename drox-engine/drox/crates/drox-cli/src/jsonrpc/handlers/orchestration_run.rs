//! Pilote orchestration 1.2.0 (`v1_2`) — run **Architecte** unique, délégation par outil.

use drox_engine::{
    architect_system_prompt_for_run, architect_user_message, OrchestrationConfig, RoleId, RunSpec,
};
use drox_types::Content;

use crate::jsonrpc::handlers::agent_run::{
    build_agent_setup, drive_role_run, AgentSetupOverrides, OrchestrationDelegateWireInput,
    RunOutcome,
};
use crate::jsonrpc::protocol::AgentRunParams;
use crate::jsonrpc::server::Server;

/// Run complet en mode `v1_2` : l'Architecte pilote le plan et appelle `delegate_executor` tâche par tâche.
pub async fn drive_run_v1_2(
    server: &Server,
    run_id: String,
    params: &AgentRunParams,
    _user_blocks: Vec<Content>,
) -> Result<RunOutcome, RunOutcome> {
    let orch_cfg = OrchestrationConfig::from_agent_run(
        params.model.as_deref(),
        params.subagents_model.as_deref(),
        params.orchestration_max_parallel_executors,
    );

    tracing::info!(
        architect_model = %orch_cfg.architect_model,
        executor_model = %orch_cfg.executor_model,
        max_parallel_executors = orch_cfg.max_parallel_executors,
        "orchestration v1_2 — architect-driven run (delegate_executor per task)"
    );

    let architect_spec = RunSpec::for_orchestration_role(RoleId::Architect);
    let architect_wire = architect_spec.role_wire_id();

    let architect_setup = build_agent_setup(
        server,
        &run_id,
        params,
        architect_spec,
        AgentSetupOverrides {
            model_override: Some(orch_cfg.architect_model.clone()),
            system_override: Some(architect_system_prompt_for_run(
                orch_cfg.max_parallel_executors,
            )),
            force_disable_subagents: true,
            orchestration_delegate: Some(OrchestrationDelegateWireInput { orch_cfg }),
        },
    )
    .await
    .map_err(|_| RunOutcome::Errored)?;

    let architect_blocks = vec![Content::text(architect_user_message(&params.prompt))];
    let (arch_outcome, _architect_text) = drive_role_run(
        server,
        &run_id,
        architect_setup,
        architect_blocks,
        architect_wire,
    )
    .await;

    if arch_outcome == RunOutcome::Errored {
        Err(RunOutcome::Errored)
    } else {
        Ok(RunOutcome::Completed)
    }
}
