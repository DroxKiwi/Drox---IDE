/// Mise à jour architecte après un outil read-only réussi.
pub(crate) fn architect_record_read_only_tool_success(
    role_id: RoleId,
    tool_name: &str,
    arguments: &Value,
    output: &Value,
    state: &mut ArchitectRunState,
) -> Option<String> {
    if role_id != RoleId::Architect {
        return None;
    }
    if tool_name == "workspace_map_read" {
        state.ingest_workspace_map_output(output);
    }
    architect_orchestration_record_successful_tool(role_id, tool_name, arguments, state);
    None
}

/// Met à jour l'état architecte après un outil réussi (minimal).
pub(crate) fn architect_orchestration_record_successful_tool(
    role_id: RoleId,
    call_name: &str,
    _call_arguments: &Value,
    _state: &mut ArchitectRunState,
) {
    if role_id != RoleId::Architect || call_name == "workspace_map_read" {
        return;
    }
}
