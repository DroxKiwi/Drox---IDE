//! Exécution de sous-agents (§2.10) — interface côté tools, implémentation dans `drox-engine`.

use std::sync::Arc;

use async_trait::async_trait;

use serde_json::Value;

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::subagent_report::SubagentExploreResult;

/// Événements UI émis pendant un sous-agent (carte repliée côté IDE).
#[derive(Debug, Clone)]
pub enum SubagentHookEvent {
    Start {
        subagent_type: String,
        description: String,
        /// Id job async (`sub_…`) ; vide en sync.
        job_id: Option<String>,
        /// `true` = explore en arrière-plan (M5c).
        background: bool,
    },
    Done {
        subagent_type: String,
        summary: String,
        truncated: bool,
        iterations_used: usize,
        job_id: Option<String>,
        success: bool,
        error_message: Option<String>,
    },
}

pub type SubagentEventHook = Arc<dyn Fn(SubagentHookEvent) + Send + Sync>;

/// Paramètres workspace / run pour les sous-agents.
#[derive(Clone)]
pub struct SubagentSettings {
    /// Si `false`, le tool `task` n'est pas enregistré et ne doit pas être appelé.
    pub enabled: bool,
    /// Plafond d'itérations LLM par sous-agent.
    pub max_iterations: usize,
    /// Nombre max de sous-agents en parallèle (V1 : file d'attente via sémaphore).
    pub max_concurrent: usize,
    /// Notifications UI optionnelles (`subagent_start` / `subagent_done`).
    pub event_hook: Option<SubagentEventHook>,
}

impl std::fmt::Debug for SubagentSettings {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SubagentSettings")
            .field("enabled", &self.enabled)
            .field("max_iterations", &self.max_iterations)
            .field("max_concurrent", &self.max_concurrent)
            .field("event_hook", &self.event_hook.as_ref().map(|_| "<hook>"))
            .finish()
    }
}

impl Default for SubagentSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            max_iterations: 15,
            max_concurrent: 1,
            event_hook: None,
        }
    }
}

impl SubagentSettings {
    #[must_use]
    pub fn effective_max_iterations(&self) -> usize {
        self.max_iterations.clamp(1, 50)
    }
}

/// Job explore async encore en cours (affichage UI / re-perspective).
#[derive(Debug, Clone)]
pub struct RunningExploreJobUi {
    pub job_id: String,
    pub description: String,
}

/// Job explore terminé, en attente d'injection parent (M5c async).
#[derive(Debug, Clone)]
pub struct SubagentCompletedJob {
    pub job_id: String,
    pub description: String,
    pub result: Result<SubagentExploreResult, String>,
}

/// Exécuteur branché par le moteur quand `SubagentSettings::enabled`.
#[async_trait]
pub trait SubagentExecutor: Send + Sync {
    /// Lance un sous-agent **Explore** (lecture seule) et renvoie le rapport final.
    async fn run_explore(
        &self,
        description: String,
        thoroughness: Option<String>,
        objective_fragment: Option<String>,
        scope: Option<Vec<String>>,
        ctx: &ToolContext,
    ) -> Result<SubagentExploreResult, ToolError>;

    /// Lance un explore en arrière-plan ; retour immédiat (`job_id`, JSON tool pending).
    async fn spawn_explore(
        &self,
        description: String,
        thoroughness: Option<String>,
        objective_fragment: Option<String>,
        scope: Option<Vec<String>>,
        ctx: &ToolContext,
    ) -> Result<(String, Value), ToolError> {
        let _ = (
            description,
            thoroughness,
            objective_fragment,
            scope,
            ctx,
        );
        Err(ToolError::invalid_args(
            "spawn_explore not supported (subagent executor without job registry)",
        ))
    }

    /// Jobs explore terminés depuis le dernier drain (M5c).
    fn drain_completed_jobs(&self) -> Vec<SubagentCompletedJob> {
        Vec::new()
    }

    /// Nombre d'explores encore en cours (M5c).
    fn running_jobs_count(&self) -> usize {
        0
    }

    /// Jobs explore async en cours (M5c UI / re-perspective).
    fn running_explore_jobs(&self) -> Vec<RunningExploreJobUi> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn effective_max_iterations_clamped() {
        let s = SubagentSettings {
            enabled: true,
            max_iterations: 20,
            max_concurrent: 2,
            event_hook: None,
        };
        assert_eq!(s.effective_max_iterations(), 20);
        let s = SubagentSettings {
            max_iterations: 99,
            ..s
        };
        assert_eq!(s.effective_max_iterations(), 50);
    }
}
