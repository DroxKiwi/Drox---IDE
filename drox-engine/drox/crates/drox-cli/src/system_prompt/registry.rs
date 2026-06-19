//! Registre d'outils exposé au LLM selon `RunSpec`.

use std::sync::Arc;

use drox_tools::DynTool;

use drox_engine::{default_tool_registry, RunSpec, RoleId};
use drox_mcp::McpHub;
use drox_tools::{register_mcp_tools, ArchitectHelpTool, ToolRegistry};
use tracing;

/// Paramètres de construction du registre pour un `agent.run`.
#[derive(Clone)]
pub struct RegistryBuildInput {
    pub run_spec: RunSpec,
    pub mcp_enabled: bool,
    pub mcp_hub: Option<Arc<McpHub>>,
    pub disabled_tools: Vec<String>,
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
        registry.register(Arc::new(ArchitectHelpTool) as DynTool);
    }
    registry
}

/// Construit le registre (MCP, filtre workspace) pour un run.
pub async fn build_registry_for_run(input: RegistryBuildInput) -> ToolRegistry {
    let mut registry = registry_for_spec(&input.run_spec);
    if input.mcp_enabled {
        if let Some(hub) = input.mcp_hub {
            register_mcp_tools(&mut registry, &hub).await;
        } else {
            tracing::info!(role = ?input.run_spec.role_id, "orchestration — outils MCP non enregistrés");
        }
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
    registry
}

pub(crate) fn apply_disabled_tools(registry: &mut ToolRegistry, disabled: &[String]) {
    const ALWAYS_ACTIVE: &[&str] = &["ask_user_question"];
    for name in disabled {
        let trimmed = name.trim();
        if trimmed.is_empty() || ALWAYS_ACTIVE.contains(&trimmed) {
            continue;
        }
        if registry.remove(trimmed) {
            tracing::info!(tool = %trimmed, "outil désactivé par paramètre workspace");
        }
    }
}
