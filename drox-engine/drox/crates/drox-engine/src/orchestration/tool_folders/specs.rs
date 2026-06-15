//! LLM tool specs — collapse wire tools into virtual folders per station.

use drox_llm::ToolSpec;
use serde_json::json;

use crate::agent::ArchitectRunState;
use crate::orchestration::EngineTuning;
use crate::RunStation;

use super::gate::is_virtual_folder_tool;
use super::manifest::{folder_for_station_when_collapsed, folder_one_line_description, folder_wire_tools};

pub const TOOL_INTERNAL_PLAN_WRITE: &str = "internal_plan_write";

/// Apply folder collapse + inject virtual tool specs for the current station.
#[must_use]
pub fn apply_tool_folder_specs(
    specs: Vec<ToolSpec>,
    station: RunStation,
    tuning: &EngineTuning,
    state: &ArchitectRunState,
) -> Vec<ToolSpec> {
    let mut out = specs;
    if tuning.tool_folders_enabled && tuning.run_rail_enabled {
        if let Some(folder) = folder_for_station_when_collapsed(station) {
            if !state.is_tool_folder_expanded(folder) {
                out = collapse_wire_tools(out, folder);
                out.push(folder_tool_spec(folder));
            } else {
                out.retain(|s| !is_virtual_folder_tool(&s.name));
            }
        }
    }
    if should_offer_internal_plan(station, tuning) {
        inject_internal_plan_spec(&mut out);
    }
    out
}

fn should_offer_internal_plan(_station: RunStation, _tuning: &EngineTuning) -> bool {
    true
}

fn collapse_wire_tools(mut specs: Vec<ToolSpec>, folder: &str) -> Vec<ToolSpec> {
    let Some(wire) = folder_wire_tools(folder) else {
        return specs;
    };
    specs.retain(|s| !wire.contains(&s.name.as_str()));
    specs
}

#[must_use]
fn folder_tool_spec(folder: &str) -> ToolSpec {
    ToolSpec {
        name: folder.to_string(),
        description: folder_one_line_description(folder).to_string(),
        parameters: json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["describe"],
                    "description": "List specialized wire tools available after expansion."
                }
            },
            "required": ["action"]
        }),
    }
}

fn inject_internal_plan_spec(specs: &mut Vec<ToolSpec>) {
    if specs.iter().any(|s| s.name == TOOL_INTERNAL_PLAN_WRITE) {
        return;
    }
    specs.push(ToolSpec {
        name: TOOL_INTERNAL_PLAN_WRITE.into(),
        description: "Internal micro-plan (5–20 steps, engine-only, not shown in UI). \
            First call: {\"steps\":[...]}. Updates: {\"mode\":\"merge\",\"steps\":[...],\"append_steps\":[...],\"remove_step_ids\":[...]}. \
            See system internal plan protocol."
            .into(),
        parameters: json!({
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": ["replace", "merge"],
                    "description": "replace (default) or merge into existing plan"
                },
                "remove_step_ids": {
                    "type": "array",
                    "items": { "type": "string" }
                },
                "append_steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string" },
                            "action": { "type": "string" },
                            "paths": { "type": "array", "items": { "type": "string" } },
                            "done_when": { "type": "string" },
                            "status": {
                                "type": "string",
                                "enum": ["pending", "in_progress", "completed", "cancelled"]
                            }
                        },
                        "required": ["id", "action", "status"]
                    }
                },
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string" },
                            "action": { "type": "string" },
                            "paths": { "type": "array", "items": { "type": "string" } },
                            "done_when": { "type": "string" },
                            "status": {
                                "type": "string",
                                "enum": ["pending", "in_progress", "completed", "cancelled"]
                            }
                        },
                        "required": ["id", "action", "status"]
                    }
                }
            },
            "required": ["steps"]
        }),
    });
}

#[must_use]
pub fn internal_plan_write_spec() -> ToolSpec {
    let mut specs = Vec::new();
    inject_internal_plan_spec(&mut specs);
    specs.pop().expect("internal_plan spec")
}