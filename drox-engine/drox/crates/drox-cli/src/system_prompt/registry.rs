//! Registre d'outils exposé au LLM selon `RunSpec`.

use std::sync::Arc;

use drox_tools::DynTool;

use drox_engine::{default_tool_registry, RunSpec, RoleId, SubagentSettings};
use drox_mcp::McpHub;
use drox_tools::{register_mcp_tools, ArchitectHelpTool, DelegateExecutorTool, ToolRegistry};
use tracing;

/// Paramètres de construction du registre pour un `agent.run`.
#[derive(Clone)]
pub struct RegistryBuildInput {
    pub run_spec: RunSpec,
    pub mcp_enabled: bool,
    pub mcp_hub: Option<Arc<McpHub>>,
    pub disabled_tools: Vec<String>,
    pub subagent_settings: SubagentSettings,
}

/// Retire du registre les outils non visibles pour la spec.
fn prune_registry_to_spec(registry: &mut ToolRegistry, spec: &RunSpec) {
    let remove: Vec<String> = registry
        .names()
        .into_iter()
        .filter(|name| !spec.tool_visible(name))
        .collect();
    for name in remove {
        if registry.remove(&name) {
            tracing::debug!(tool = %name, role = ?spec.role_id, "outil retiré du registre (rôle)");
        }
    }
}

/// Registre de base pour une spec — `Standard` = registre complet ; rôles 1.2.0 = allowlist.
#[must_use]
pub fn registry_for_spec(spec: &RunSpec) -> ToolRegistry {
    let mut registry = default_tool_registry();
    if spec.role_id != RoleId::Standard {
        prune_registry_to_spec(&mut registry, spec);
    }
    if spec.role_id == RoleId::Architect {
        registry.register(Arc::new(DelegateExecutorTool) as DynTool);
        registry.register(Arc::new(ArchitectHelpTool) as DynTool);
    }
    registry
}

/// Construit le registre (MCP, sous-agents, filtre workspace) pour un run.
pub async fn build_registry_for_run(input: RegistryBuildInput) -> ToolRegistry {
    let mut registry = registry_for_spec(&input.run_spec);

    if input.run_spec.role_id == RoleId::Standard && input.mcp_enabled {
        if let Some(ref hub) = input.mcp_hub {
            let dynamic = register_mcp_tools(&mut registry, hub).await;
            tracing::info!(
                dynamic_tools = dynamic,
                servers = ?hub.server_names(),
                path = %hub.config_path().display(),
                "MCP tools enregistrés"
            );
        }
    } else if input.run_spec.is_orchestration_role() {
        tracing::info!(role = ?input.run_spec.role_id, "orchestration — outils MCP non enregistrés");
    } else {
        tracing::info!("outils MCP désactivés pour ce run (paramètres workspace)");
    }
    apply_disabled_tools(&mut registry, &input.disabled_tools);
    if !input.disabled_tools.is_empty() {
        tracing::info!(
            disabled = ?input.disabled_tools,
            remaining = registry.names().len(),
            "registre tools après filtre workspace"
        );
    }
    if input.subagent_settings.enabled && input.run_spec.role_id == RoleId::Standard {
        registry.register_subagent_task();
        tracing::info!(
            max_iter = input.subagent_settings.max_iterations,
            max_concurrent = input.subagent_settings.max_concurrent,
            "sous-agents activés — tool `task` enregistré"
        );
    }
    registry
}

pub(crate) fn apply_disabled_tools(registry: &mut ToolRegistry, disabled: &[String]) {
    const ALWAYS_ACTIVE: &[&str] = &["ask_user_question", "todo_write"];
    for name in disabled {
        let trimmed = name.trim();
        if trimmed.is_empty() || ALWAYS_ACTIVE.contains(&trimmed) {
            continue;
        }
        if registry.remove(trimmed) {
            tracing::debug!(tool = %trimmed, "outil retiré du registre (désactivé)");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_engine::{RoleId, ARCHITECT_TOOL_ALLOWLIST};

    #[test]
    fn architect_registry_matches_allowlist() {
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        let registry = registry_for_spec(&spec);
        let names = registry.names();
        for name in &names {
            assert!(
                ARCHITECT_TOOL_ALLOWLIST.contains(&name.as_str()),
                "unexpected tool for architect: {name}"
            );
        }
        assert!(names.iter().any(|n| n == "file_read"));
        assert!(names.iter().any(|n| n == "delegate_executor"));
        assert!(names.iter().any(|n| n == "architect_help"));
        assert!(names.iter().any(|n| n == "file_edit"));
        assert!(names.iter().any(|n| n == "bash"));
    }

    #[test]
    fn architect_discussion_registry_read_only() {
        let spec = RunSpec::for_architect_discussion();
        let registry = registry_for_spec(&spec);
        let names = registry.names();
        assert!(names.iter().any(|n| n == "file_read"));
        assert!(names.iter().any(|n| n == "workspace_map_read"));
        assert!(!names.iter().any(|n| n == "todo_write"));
        assert!(!names.iter().any(|n| n == "delegate_executor"));
    }

    #[test]
    fn executor_registry_allows_file_edit() {
        let spec = RunSpec::for_orchestration_role(RoleId::Executor);
        let registry = registry_for_spec(&spec);
        assert!(registry.get("file_edit").is_some());
        assert!(!registry.get("web_search").is_some());
    }

    #[test]
    fn standard_registry_includes_web_search() {
        let registry = registry_for_spec(&RunSpec::default());
        assert!(registry.get("web_search").is_some());
    }
}
