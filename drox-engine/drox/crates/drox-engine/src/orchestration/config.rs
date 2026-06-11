//! Model resolution for orchestration (`role_split` — architect solo 1.4.0).

/// Valeurs par défaut si rien n'est configuré (smoke local).
pub const DEFAULT_ARCHITECT_MODEL: &str = "qwen3.5:9b";

/// Architect model for a `role_split` run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrchestrationConfig {
    pub architect_model: String,
}

impl OrchestrationConfig {
    /// Résout depuis `agent.run` (`params.model` / `DROX_MODEL`).
    #[must_use]
    pub fn from_agent_run(model: Option<&str>) -> Self {
        let env_parent =
            || std::env::var("DROX_MODEL").unwrap_or_else(|_| DEFAULT_ARCHITECT_MODEL.to_string());
        let architect = model
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToString::to_string)
            .unwrap_or_else(env_parent);
        Self {
            architect_model: architect,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_agent_run_uses_explicit_model() {
        let cfg = OrchestrationConfig::from_agent_run(Some("qwen3.5:9b"));
        assert_eq!(cfg.architect_model, "qwen3.5:9b");
    }
}
