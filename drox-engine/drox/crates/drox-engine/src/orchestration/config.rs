//! Configuration modèles orchestration `v1_2` (1.2.0).
//!
//! Recycle les réglages produit existants :
//! - modèle principal (`params.model` / `nexus.drox.architect.model`, ex-`nexus.drox.model`)
//! - modèle sous-agent (`params.subagentsModel` / `nexus.drox.executor.model`, ex-`nexus.drox.subagents.model`)

/// Valeurs par défaut si rien n'est configuré (smoke local).
pub const DEFAULT_ARCHITECT_MODEL: &str = "qwen3.5:9b";
pub const DEFAULT_EXECUTOR_MODEL: &str = "qwen3.5:2b";

use super::parallel_batch::MAX_PARALLEL_EXECUTORS_CAP;

/// Paire architecte / exécutant pour un run `v1_2`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrchestrationConfig {
    pub architect_model: String,
    pub executor_model: String,
    /// Nombre max de tâches exécuteur en parallèle dans un batch (défaut 1 = séquentiel).
    pub max_parallel_executors: usize,
}

impl OrchestrationConfig {
    /// Extrait le nom de modèle exécuteur (premier token si CSV legacy ; ignore `@ctx` dans le nom).
    fn parse_executor_model(raw: Option<&str>, fallback: &str) -> String {
        let token = raw
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .and_then(|s| s.split(',').map(str::trim).find(|p| !p.is_empty()))
            .unwrap_or(fallback);
        let head = token.split(';').next().unwrap_or(token).trim();
        match head.rsplit_once('@') {
            Some((left, right)) if !left.trim().is_empty() && right.trim().parse::<usize>().is_ok() => {
                left.trim().to_string()
            }
            _ => head.to_string(),
        }
    }

    /// Résout depuis `agent.run` (même sémantique que legacy : exécutant vide → architecte).
    #[must_use]
    pub fn from_agent_run(
        model: Option<&str>,
        subagents_model: Option<&str>,
        max_parallel_executors: Option<usize>,
    ) -> Self {
        let env_parent =
            || std::env::var("DROX_MODEL").unwrap_or_else(|_| DEFAULT_ARCHITECT_MODEL.to_string());
        let architect = model
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(env_parent);
        let executor = Self::parse_executor_model(subagents_model, &architect);
        let max_parallel_executors = max_parallel_executors
            .unwrap_or(1)
            .clamp(1, MAX_PARALLEL_EXECUTORS_CAP);
        Self {
            architect_model: architect,
            executor_model: executor,
            max_parallel_executors,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_agent_run_uses_parent_when_executor_empty() {
        let cfg = OrchestrationConfig::from_agent_run(Some("qwen3.5:9b"), None, None);
        assert_eq!(cfg.architect_model, "qwen3.5:9b");
        assert_eq!(cfg.executor_model, "qwen3.5:9b");
        assert_eq!(cfg.max_parallel_executors, 1);
    }

    #[test]
    fn from_agent_run_splits_architect_and_executor() {
        let cfg = OrchestrationConfig::from_agent_run(Some("qwen3.5:9b"), Some("qwen3.5:2b"), None);
        assert_eq!(cfg.architect_model, "qwen3.5:9b");
        assert_eq!(cfg.executor_model, "qwen3.5:2b");
    }

    #[test]
    fn from_agent_run_uses_first_model_when_legacy_csv_pool() {
        let cfg = OrchestrationConfig::from_agent_run(
            Some("qwen3.5:9b"),
            Some("qwen3.5:9b-sub1@16384, qwen3.5:9b-sub2@24576"),
            Some(2),
        );
        assert_eq!(cfg.executor_model, "qwen3.5:9b-sub1");
        assert_eq!(cfg.max_parallel_executors, 2);
    }

    #[test]
    fn from_agent_run_strips_ctx_suffix_from_executor_model() {
        let cfg = OrchestrationConfig::from_agent_run(
            Some("qwen3.5:9b"),
            Some("qwen3.5:9b@32768"),
            None,
        );
        assert_eq!(cfg.executor_model, "qwen3.5:9b");
    }

    #[test]
    fn max_parallel_clamped() {
        let cfg = OrchestrationConfig::from_agent_run(None, None, Some(150));
        assert_eq!(cfg.max_parallel_executors, MAX_PARALLEL_EXECUTORS_CAP);
        let mid = OrchestrationConfig::from_agent_run(None, None, Some(50));
        assert_eq!(mid.max_parallel_executors, 50);
    }
}
