use drox_llm::ToolSpec;
use drox_tools::ToolRegistry;

use crate::orchestration::internal_plan_tool::{internal_plan_write_spec, TOOL_INTERNAL_PLAN_WRITE};
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
    if run_spec.role_id == RoleId::Architect
        && !specs.iter().any(|s| s.name == TOOL_INTERNAL_PLAN_WRITE)
    {
        specs.push(internal_plan_write_spec());
    }
    specs
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::run_spec::RoleId;
    use crate::default_tool_registry;

    #[test]
    fn architect_flat_palette_includes_core_wire_tools() {
        let registry = default_tool_registry();
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        let names: Vec<_> = build_tool_specs(&registry, &spec)
            .into_iter()
            .map(|s| s.name)
            .collect();
        assert!(names.iter().any(|n| n == "file_edit"));
        assert!(names.iter().any(|n| n == "file_read"));
        assert!(names.iter().any(|n| n == TOOL_INTERNAL_PLAN_WRITE));
        assert!(!names.iter().any(|n| n == "read_workspace"));
        assert!(!names.iter().any(|n| n == "edit_file"));
        assert!(!names.iter().any(|n| n == "verify_project"));
    }

    #[test]
    fn file_edit_spec_requires_path_and_edits() {
        let registry = default_tool_registry();
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        let file_edit = build_tool_specs(&registry, &spec)
            .into_iter()
            .find(|s| s.name == "file_edit")
            .expect("file_edit in palette");
        let required = file_edit
            .parameters
            .get("required")
            .and_then(|v| v.as_array())
            .expect("required array");
        let req: Vec<_> = required.iter().filter_map(|v| v.as_str()).collect();
        assert!(req.contains(&"path"));
        assert!(req.contains(&"edits"));
    }
}
