//! Segment spawn triggers (C7) — engine decides, not the model.
//!
//! Design: `drox-engine/docs/1.4/1.4.0/04-SEGMENTS.md`

use std::collections::HashSet;

use camino::Utf8Path;
use serde_json::Value;

use super::super::station::RunStation;
use super::super::state::RunRailState;
use crate::agent::ArchitectRunState;
use crate::agent::nudges::MUTATING_TOOLS_FOR_STEP_TRACKING;

/// Dev thresholds (C7).
pub const SEGMENT_FILE_BYTES_THRESHOLD: u64 = 8 * 1024;
pub const SEGMENT_ACT_STEPS_THRESHOLD: u32 = 20;

/// Request to spawn an isolated ACT segment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SegmentSpawnRequest {
    pub task_id: String,
    pub label: String,
    pub scope: Vec<String>,
    pub brief: String,
}

/// Evaluate whether a parent mutation at ACT should run in a segment instead.
#[must_use]
pub fn evaluate_segment_spawn(
    rail: &RunRailState,
    architect: &ArchitectRunState,
    tool_name: &str,
    arguments: &Value,
    target_bytes: Option<u64>,
    segment_spawned_paths: &HashSet<String>,
) -> Option<SegmentSpawnRequest> {
    if rail.station != RunStation::Act {
        return None;
    }
    if !MUTATING_TOOLS_FOR_STEP_TRACKING.contains(&tool_name) {
        return None;
    }
    let path = mutation_path(tool_name, arguments)?;
    if segment_spawned_paths.contains(path) {
        return None;
    }
    let bytes_hit = target_bytes.is_some_and(|b| b >= SEGMENT_FILE_BYTES_THRESHOLD);
    let steps_hit = rail.act_tool_steps >= SEGMENT_ACT_STEPS_THRESHOLD;
    let todo_hit = architect
        .current_focus_task_line()
        .is_some_and(|(_, _, status)| status == "in_progress");
    if !bytes_hit && !steps_hit && !todo_hit {
        return None;
    }
    let (task_id, label, _) = architect.current_focus_task_line().unwrap_or_else(|| {
        (
            "segment".to_string(),
            path.to_string(),
            "in_progress".to_string(),
        )
    });
    let scope = vec![path.to_string()];
    let brief = format!(
        "Apply the architect's pending mutation for `{path}` using `{tool_name}`. \
         Parent ACT step count: {}. Use only scoped paths.",
        rail.act_tool_steps
    );
    Some(SegmentSpawnRequest {
        task_id,
        label,
        scope,
        brief,
    })
}

/// Resolve workspace-relative path and on-disk size for mutation tools.
pub async fn mutation_target_bytes(
    workspace: &Utf8Path,
    tool_name: &str,
    arguments: &Value,
) -> Option<u64> {
    match tool_name {
        "file_write" => arguments
            .get("contents")
            .and_then(|v| v.as_str())
            .map(|s| s.len() as u64),
        "file_edit" | "notebook_edit" => {
            let path = arguments.get("path").or_else(|| arguments.get("file_path"))?;
            let rel = path.as_str()?;
            let full = workspace.join(rel);
            tokio::fs::metadata(full.as_std_path()).await.ok().map(|m| m.len())
        }
        _ => None,
    }
}

#[must_use]
fn mutation_path<'a>(tool_name: &str, arguments: &'a Value) -> Option<&'a str> {
    match tool_name {
        "file_edit" | "file_write" | "notebook_edit" => arguments
            .get("path")
            .or_else(|| arguments.get("file_path"))
            .and_then(|v| v.as_str()),
        "bash" => arguments.get("command").and_then(|v| v.as_str()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn skips_outside_act() {
        let rail = RunRailState::new();
        assert!(evaluate_segment_spawn(
            &rail,
            &ArchitectRunState::default(),
            "file_edit",
            &json!({ "path": "a.css" }),
            Some(9000),
            &HashSet::new(),
        )
        .is_none());
    }

    #[test]
    fn triggers_on_large_file_at_act() {
        let mut rail = RunRailState::new();
        rail.station = RunStation::Act;
        let req = evaluate_segment_spawn(
            &rail,
            &ArchitectRunState::default(),
            "file_edit",
            &json!({ "path": "src/globals.css" }),
            Some(9000),
            &HashSet::new(),
        )
        .expect("segment");
        assert_eq!(req.scope, vec!["src/globals.css"]);
    }
}
