//! Délégation Architecte → Exécutant (orchestration 1.2.0).

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::Value;

use crate::context::ToolContext;
use crate::error::ToolError;

/// Résultat structuré renvoyé à l'Architecte après un passage exécutant.
#[derive(Debug, Clone)]
pub struct OrchestrationDelegateResult {
    pub task_id: String,
    pub status: String,
    pub report_markdown: String,
    pub iterations_used: usize,
    pub truncated: bool,
    /// Vérité terrain post-délégation (scope + agent-output).
    pub verified: bool,
    /// Paquet d'échec structuré pour reprogrammation architecte (`null` si verified).
    pub failure: Option<serde_json::Value>,
}

pub type OrchestrationDelegateEventHook =
    Arc<dyn Fn(OrchestrationDelegateHookEvent) + Send + Sync>;

/// Notifications UI pendant une délégation exécutant.
#[derive(Debug, Clone)]
pub enum OrchestrationDelegateHookEvent {
    RoleEnter { role_id: String },
    /// Début d'une tâche exécutant (`delegate_executor`).
    ExecutorTaskStart {
        task_id: String,
        description: String,
    },
    /// Fin de tâche exécutant.
    ExecutorTaskDone {
        task_id: String,
        status: String,
        summary: String,
        truncated: bool,
        iterations_used: usize,
        success: bool,
    },
    /// Événement agent brut (texte, tools, …) relayé sur le run parent.
    AgentEventJson { payload: Value },
}

/// Une tâche exécuteur (principale ou entrée `parallel_with`).
#[derive(Debug, Clone)]
pub struct ExecutorTaskRequest {
    pub task_id: String,
    pub description: String,
    pub deliverable: Option<String>,
    pub instructions: Option<String>,
    pub context: Option<String>,
    pub scope: Option<Vec<String>>,
}

/// Exécuteur branché par le moteur quand l'Architecte appelle `delegate_executor`.
///
/// `context` : bagage choisi par l'Architecte uniquement (extraits, rapports
/// `.drox/agent-output/…`). L'exécuteur ne reçoit pas le message utilisateur du run parent.
#[async_trait]
pub trait OrchestrationDelegateExecutor: Send + Sync {
    async fn run_executor_task(
        &self,
        task_id: String,
        description: String,
        deliverable: Option<String>,
        instructions: Option<String>,
        context: Option<String>,
        scope: Option<Vec<String>>,
        ctx: &ToolContext,
    ) -> Result<OrchestrationDelegateResult, ToolError>;

    /// Lance plusieurs tâches exécuteur (batch `parallel_with`). Implémentation par défaut : séquentiel.
    async fn run_executor_tasks_batch(
        &self,
        tasks: Vec<ExecutorTaskRequest>,
        parent_ctx: &ToolContext,
    ) -> Result<Vec<OrchestrationDelegateResult>, ToolError> {
        let mut results = Vec::with_capacity(tasks.len());
        for task in tasks {
            results.push(
                self.run_executor_task(
                    task.task_id,
                    task.description,
                    task.deliverable,
                    task.instructions,
                    task.context,
                    task.scope,
                    parent_ctx,
                )
                .await?,
            );
        }
        Ok(results)
    }
}
