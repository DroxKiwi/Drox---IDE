//! Pre-gate — block wire tools until folder expanded.

use crate::agent::ArchitectRunState;
use crate::orchestration::EngineTuning;
use crate::RunStation;

use super::aliases::is_folder_describe;
use super::manifest::{folder_for_station_when_collapsed, folder_wire_tools};
use super::types::{FOLDER_EDIT_FILE, FOLDER_READ_WORKSPACE, FOLDER_VERIFY_PROJECT};

#[must_use]
pub fn tool_folder_pre_gate(
    tuning: &EngineTuning,
    state: &ArchitectRunState,
    station: RunStation,
    tool_name: &str,
    arguments: &serde_json::Value,
) -> Option<String> {
    if !tuning.tool_folders_enabled || !tuning.run_rail_enabled {
        return None;
    }
    if is_folder_describe(arguments) {
        return None;
    }
    let folder = folder_for_station_when_collapsed(station)?;
    if state.is_tool_folder_expanded(folder) {
        return None;
    }
    let wire_tools = folder_wire_tools(folder)?;
    if !wire_tools.contains(&tool_name) {
        return None;
    }
    Some(format!(
        "Tool folder `{folder}` is not expanded yet. Call `{folder}` with {{\"action\":\"describe\"}} \
         first; wire tools `{wire}` unlock on the next turn.",
        wire = wire_tools.join("`, `")
    ))
}

#[must_use]
pub fn is_virtual_folder_tool(tool_name: &str) -> bool {
    matches!(
        tool_name,
        FOLDER_EDIT_FILE | FOLDER_READ_WORKSPACE | FOLDER_VERIFY_PROJECT
    )
}
