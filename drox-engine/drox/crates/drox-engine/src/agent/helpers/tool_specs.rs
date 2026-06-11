use drox_llm::ToolSpec;
use drox_tools::ToolRegistry;

use crate::run_spec::RoleId;
use crate::run_spec::RunSpec;
/// Construit la liste des `ToolSpec` Ã  partir du registre.
///
/// Certains outils restent enregistrÃ©s pour exÃ©cution cÃ´tÃ© client / CLI
/// mais ne doivent **pas** Ãªtre visibles du LLM (`session_end` : rÃ©servÃ©
/// Ã  la commande utilisateur `/session_end`).
pub(crate) fn build_tool_specs(registry: &ToolRegistry, run_spec: &RunSpec) -> Vec<ToolSpec> {
    const HIDDEN_FROM_LLM: &[&str] = &["session_end"];
    let has_mcp_stubs = registry
        .names()
        .iter()
        .any(|n| n.starts_with("mcp__"));
    let mut specs = Vec::new();
    for name in registry.names() {
        if !run_spec.tool_visible(&name) {
            continue;
        }
        if HIDDEN_FROM_LLM.contains(&name.as_str()) {
            continue;
        }
        if has_mcp_stubs && name == "mcp_call" {
            continue;
        }
        if let Some(tool) = registry.get(&name) {
            let description = if run_spec.role_id == RoleId::Architect {
                crate::orchestration::architect_tool_short_description(&name)
                    .map(str::to_string)
                    .unwrap_or_else(|| tool.description().to_string())
            } else {
                tool.description().to_string()
            };
            specs.push(ToolSpec {
                name: tool.name().to_string(),
                description,
                parameters: tool.input_schema(),
            });
        }
    }
    specs
}
