//! Virtual folder + internal_plan_write execution (engine-only, no IDE wire).

use serde_json::{json, Value};

use crate::agent::{ingest_internal_plan, internal_plan_shape_guard, ArchitectRunState};use crate::orchestration::EngineTuning;
use crate::RunStation;

use super::aliases::is_folder_describe;
use super::describe::describe_folder_response;
use super::gate::is_virtual_folder_tool;
use super::manifest::folder_for_station_when_collapsed;
use super::specs::TOOL_INTERNAL_PLAN_WRITE;

/// Engine-handled tool — `Some(value)` or validation error string.
#[must_use]
pub fn try_execute_virtual_tool(
    tuning: &EngineTuning,
    station: Option<RunStation>,
    state: &mut ArchitectRunState,
    tool_name: &str,
    arguments: &Value,
) -> Result<Value, Option<String>> {
    if tool_name == TOOL_INTERNAL_PLAN_WRITE {
        if let Some(msg) = internal_plan_shape_guard(state.internal_plan.as_ref(), arguments) {
            return Err(Some(msg));
        }
        let normalized = ingest_internal_plan(&mut state.internal_plan, arguments.clone());
        return Ok(normalized);
    }
    if !tuning.tool_folders_enabled || !tuning.run_rail_enabled {
        return Err(None);
    }
    if !is_virtual_folder_tool(tool_name) {
        return Err(None);
    }
    if !is_folder_describe(arguments) {
        return Err(Some(format!(
            "Virtual folder `{tool_name}` only accepts {{\"action\":\"describe\"}} until expanded."
        )));
    }
    let Some(expected) = station.and_then(folder_for_station_when_collapsed) else {
        return Err(Some(format!(
            "Tool folder `{tool_name}` is not available at the current station."
        )));
    };
    if expected != tool_name {
        return Err(Some(format!(
            "At this station use folder `{expected}`, not `{tool_name}`."
        )));
    }
    state.expand_tool_folder(tool_name);
    let body = describe_folder_response(tool_name);
    Ok(json!({
        "ok": true,
        "folder": tool_name,
        "expanded": true,
        "message": body,
    }))
}
