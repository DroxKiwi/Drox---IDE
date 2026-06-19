//! `internal_plan_write` — engine-only virtual tool (no IDE wire).

use drox_llm::ToolSpec;
use serde_json::{json, Value};

use crate::agent::{ingest_internal_plan, internal_plan_shape_guard, ArchitectRunState};

pub const TOOL_INTERNAL_PLAN_WRITE: &str = "internal_plan_write";

/// LLM tool spec for optional internal micro-plan updates.
#[must_use]
pub fn internal_plan_write_spec() -> ToolSpec {
    ToolSpec {
        name: TOOL_INTERNAL_PLAN_WRITE.into(),
        description: "Optional internal micro-plan (engine-only, not shown in UI). \
            {\"steps\":[...]} or {\"mode\":\"merge\",...}."
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
    }
}

/// Execute `internal_plan_write` in-process (no registry handler).
#[must_use]
pub fn try_execute_internal_plan_write(
    state: &mut ArchitectRunState,
    arguments: &Value,
) -> Result<Value, String> {
    if let Some(msg) = internal_plan_shape_guard(state.internal_plan.as_ref(), arguments) {
        return Err(msg);
    }
    Ok(ingest_internal_plan(&mut state.internal_plan, arguments.clone()))
}
