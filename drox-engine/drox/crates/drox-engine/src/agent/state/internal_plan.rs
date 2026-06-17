//! `internal_plan_write` — L2 micro-plan (engine-only, not UI).

use std::collections::{HashMap, HashSet};

use serde_json::{json, Value};

use super::ArchitectRunState;

pub const INTERNAL_WORK_PLAN_MARKER: &str = "## Internal work plan (engine only)";

pub const INTERNAL_PLAN_REQUIRED_BEFORE_WORK: &str =
    "Blocked: `internal_plan_write` is **mandatory** before any other tool on this run. \
     Call it first with `{\"steps\":[{\"id\":\"s1\",\"action\":\"…\",\"paths\":[\"…\"],\
     \"done_when\":\"…\",\"status\":\"in_progress|pending|completed\"}]}` (5–20 concrete steps). \
     This internal micro-plan is engine-only (not the user todo UI). \
     No `workspace_map_read`, `file_read`, `todo_write`, or mutations until the plan exists.";

/// Whether the architect has committed an internal L2 plan this run.
#[must_use]
pub fn has_internal_plan(state: &ArchitectRunState) -> bool {
    state
        .internal_plan
        .as_ref()
        .is_some_and(|p| !p.steps.is_empty())
}

/// Pre-execution gate: every architect tool except `internal_plan_write` until a plan exists.
#[must_use]
pub fn internal_plan_required_block(
    role_id: crate::run_spec::RoleId,
    state: &ArchitectRunState,
    tool_name: &str,
) -> Option<String> {
    if role_id != crate::run_spec::RoleId::Architect {
        return None;
    }
    if tool_name == crate::orchestration::tool_folders::TOOL_INTERNAL_PLAN_WRITE {
        return None;
    }
    if has_internal_plan(state) {
        return None;
    }
    Some(INTERNAL_PLAN_REQUIRED_BEFORE_WORK.to_string())
}

#[must_use]
pub fn format_internal_plan_required_block() -> String {
    format!(
        "{INTERNAL_WORK_PLAN_MARKER}\n\n\
         **Required — first action on every architect run.** Before `workspace_map_read`, \
         `file_read`, `todo_write`, mutations, or `[gate: advance]` work, call \
         `internal_plan_write` once with 5–20 concrete steps (`id`, `action`, `paths`, \
         `done_when`, `status`). Engine-only — not shown in the user todo UI. \
         Update the notebook as you learn (`mode: merge` optional).\n"
    )
}

#[derive(Debug, Clone)]
pub struct InternalPlanStep {
    pub id: String,
    pub action: String,
    pub paths: Vec<String>,
    pub done_when: String,
    pub status: String,
}

#[derive(Debug, Clone, Default)]
pub struct InternalPlanMeta {
    pub tools_since_touch: u32,
    pub updated_at: Option<String>,
    pub last_write_mode: String,
}

#[derive(Debug, Clone)]
pub struct InternalPlanState {
    pub steps: Vec<InternalPlanStep>,
    pub meta: InternalPlanMeta,
}

impl Default for InternalPlanState {
    fn default() -> Self {
        Self {
            steps: Vec::new(),
            meta: InternalPlanMeta {
                last_write_mode: "replace".to_string(),
                ..InternalPlanMeta::default()
            },
        }
    }
}

const PAYLOAD_PREVIEW_MAX: usize = 240;
const MAX_STEPS: usize = 32;

#[must_use]
fn payload_preview(arguments: &Value) -> String {
    let raw = arguments.to_string();
    if raw.chars().count() <= PAYLOAD_PREVIEW_MAX {
        return raw;
    }
    let truncated: String = raw.chars().take(PAYLOAD_PREVIEW_MAX).collect();
    format!("{truncated}… [payload truncated]")
}

#[must_use]
pub fn internal_plan_shape_guard(
    existing: Option<&InternalPlanState>,
    arguments: &Value,
) -> Option<String> {
    match resolve_internal_plan_write(existing, arguments.clone()) {
        Ok(_) => None,
        Err(msg) => Some(format!(
            "{msg}\n\nReceived payload (truncated): {}",
            payload_preview(arguments)
        )),
    }
}

#[must_use]
pub fn in_progress_step_id(plan: &InternalPlanState) -> Option<String> {
    plan.steps
        .iter()
        .find(|s| s.status == "in_progress")
        .map(|s| s.id.clone())
}

#[must_use]
pub fn has_in_progress_step(plan: &InternalPlanState) -> bool {
    in_progress_step_id(plan).is_some()
}

/// Increment freshness counter after a successful non-L2 tool.
pub fn record_internal_plan_tool_touch(state: &mut ArchitectRunState, tool_name: &str) {
    if tool_name == crate::orchestration::tool_folders::TOOL_INTERNAL_PLAN_WRITE {
        return;
    }
    if let Some(plan) = state.internal_plan.as_mut() {
        plan.meta.tools_since_touch = plan.meta.tools_since_touch.saturating_add(1);
    }
}

/// Nudge when the L2 notebook is stale (soft — caller injects via `append_gate_nudge`).
#[must_use]
pub fn stale_internal_plan_nudge(
    state: &ArchitectRunState,
    threshold: u32,
) -> Option<String> {
    if threshold == 0 {
        return None;
    }
    let plan = state.internal_plan.as_ref()?;
    if plan.meta.tools_since_touch < threshold {
        return None;
    }
    Some(crate::agent::nudges::stale_plan_nudge(plan.meta.tools_since_touch))
}

#[must_use]
pub fn internal_plan_trace_summary(state: &ArchitectRunState) -> (u32, Option<String>, u32) {
    match state.internal_plan.as_ref() {
        Some(p) => (
            p.steps.len() as u32,
            in_progress_step_id(p),
            p.meta.tools_since_touch,
        ),
        None => (0, None, 0),
    }
}

fn write_mode(arguments: &Value) -> &'static str {
    match arguments
        .get("mode")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .map(str::to_ascii_lowercase)
    {
        Some(ref m) if m == "merge" => "merge",
        _ => "replace",
    }
}

fn parse_step(step: &Value) -> Result<InternalPlanStep, String> {
    let id = parse_step_id(step)?;
    let action = step
        .get("action")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Step `{id}` needs non-empty `action`."))?
        .to_string();
    Ok(parse_step_fields(step, id, action)?)
}

fn parse_step_id(step: &Value) -> Result<String, String> {
    step
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Each step needs a non-empty `id`.".to_string())
        .map(str::to_string)
}

fn parse_step_status(step: &Value, id: &str, default: &str) -> Result<String, String> {
    let status = step
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or(default)
        .trim()
        .to_ascii_lowercase();
    if !matches!(
        status.as_str(),
        "pending" | "in_progress" | "completed" | "cancelled"
    ) {
        return Err(format!(
            "Step `{id}` has invalid status `{status}` — use pending|in_progress|completed|cancelled."
        ));
    }
    Ok(status)
}

fn parse_step_paths(step: &Value) -> Vec<String> {
    step
        .get("paths")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| p.as_str().map(str::trim))
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn parse_step_fields(
    step: &Value,
    id: String,
    action: String,
) -> Result<InternalPlanStep, String> {
    let status = parse_step_status(step, &id, "pending")?;
    let paths = parse_step_paths(step);
    let done_when = step
        .get("done_when")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("")
        .to_string();
    Ok(InternalPlanStep {
        id,
        action,
        paths,
        done_when,
        status,
    })
}

/// Merge patch — `action` / `paths` / `done_when` optional; inherit from existing step.
fn parse_merge_step_patch(step: &Value, existing: &InternalPlanStep) -> Result<InternalPlanStep, String> {
    let id = parse_step_id(step)?;
    if id != existing.id {
        return Err(format!(
            "Merge patch id mismatch: payload `{id}` vs existing `{}`.",
            existing.id
        ));
    }
    let action = step
        .get("action")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| existing.action.clone());
    let status = if step.get("status").is_some() {
        parse_step_status(step, &id, &existing.status)?
    } else {
        existing.status.clone()
    };
    let paths = if step.get("paths").is_some() {
        parse_step_paths(step)
    } else {
        existing.paths.clone()
    };
    let done_when = if step.get("done_when").is_some() {
        step
            .get("done_when")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .unwrap_or("")
            .to_string()
    } else {
        existing.done_when.clone()
    };
    Ok(InternalPlanStep {
        id,
        action,
        paths,
        done_when,
        status,
    })
}

fn validate_step_set(steps: &[InternalPlanStep]) -> Result<(), String> {
    if steps.is_empty() {
        return Err("internal_plan_write: plan must contain at least one step.".to_string());
    }
    if steps.len() > MAX_STEPS {
        return Err(format!(
            "internal_plan_write: at most {MAX_STEPS} steps per plan."
        ));
    }
    let mut ids = HashSet::new();
    let mut in_progress = 0usize;
    for step in steps {
        if !ids.insert(step.id.clone()) {
            return Err(format!("Duplicate internal plan step id `{}`.", step.id));
        }
        if step.status == "in_progress" {
            in_progress += 1;
        }
    }
    if in_progress > 1 {
        return Err("At most one internal plan step may be `in_progress`.".to_string());
    }
    Ok(())
}

fn steps_to_json(steps: &[InternalPlanStep]) -> Vec<Value> {
    steps
        .iter()
        .map(|s| {
            json!({
                "id": s.id,
                "action": s.action,
                "paths": s.paths,
                "done_when": s.done_when,
                "status": s.status,
            })
        })
        .collect()
}

fn merge_plan_steps(
    existing: &InternalPlanState,
    arguments: &Value,
) -> Result<Vec<InternalPlanStep>, String> {
    let removes: HashSet<String> = arguments
        .get("remove_step_ids")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|id| id.as_str().map(str::trim))
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let mut updates: HashMap<String, InternalPlanStep> = HashMap::new();
    if let Some(arr) = arguments.get("steps").and_then(|v| v.as_array()) {
        for step in arr {
            let id = parse_step_id(step)?;
            let parsed = if let Some(existing_step) = existing.steps.iter().find(|s| s.id == id) {
                parse_merge_step_patch(step, existing_step)?
            } else {
                parse_step(step)?
            };
            updates.insert(parsed.id.clone(), parsed);
        }
    }

    let mut appends: Vec<InternalPlanStep> = Vec::new();
    if let Some(arr) = arguments.get("append_steps").and_then(|v| v.as_array()) {
        for step in arr {
            appends.push(parse_step(step)?);
        }
    }

    if updates.is_empty() && appends.is_empty() && removes.is_empty() {
        return Err(
            "internal_plan_write merge mode needs `steps` updates, `append_steps`, and/or \
             `remove_step_ids`."
                .to_string(),
        );
    }

    let mut out: Vec<InternalPlanStep> = Vec::new();
    for step in &existing.steps {
        if removes.contains(&step.id) {
            continue;
        }
        if let Some(updated) = updates.remove(&step.id) {
            out.push(updated);
        } else {
            out.push(step.clone());
        }
    }
    for (_, step) in updates {
        out.push(step);
    }
    for step in appends {
        if out.iter().any(|s| s.id == step.id) {
            return Err(format!(
                "Duplicate internal plan step id `{}` in append_steps.",
                step.id
            ));
        }
        out.push(step);
    }
    validate_step_set(&out)?;
    Ok(out)
}

fn replace_plan_steps(arguments: &Value) -> Result<Vec<InternalPlanStep>, String> {
    let steps = arguments
        .get("steps")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "internal_plan_write requires {\"steps\":[...]} with at least one step.".to_string()
        })?;
    let mut out = Vec::with_capacity(steps.len());
    for step in steps {
        out.push(parse_step(step)?);
    }
    validate_step_set(&out)?;
    Ok(out)
}

#[must_use]
pub fn resolve_internal_plan_write(
    existing: Option<&InternalPlanState>,
    arguments: Value,
) -> Result<(Vec<InternalPlanStep>, &'static str), String> {
    let mode = write_mode(&arguments);
    let steps = if mode == "merge" {
        match existing {
            Some(plan) => merge_plan_steps(plan, &arguments)?,
            None => replace_plan_steps(&arguments)?,
        }
    } else {
        replace_plan_steps(&arguments)?
    };
    Ok((steps, mode))
}

#[must_use]
pub fn ingest_internal_plan(
    slot: &mut Option<InternalPlanState>,
    arguments: Value,
) -> Value {
    let existing = slot.as_ref();
    let (steps, mode) = match resolve_internal_plan_write(existing, arguments.clone()) {
        Ok(v) => v,
        Err(_) => (Vec::new(), "replace"),
    };
    let updated_at = chrono::Utc::now().to_rfc3339();
    *slot = if steps.is_empty() {
        None
    } else {
        Some(InternalPlanState {
            steps,
            meta: InternalPlanMeta {
                tools_since_touch: 0,
                updated_at: Some(updated_at.clone()),
                last_write_mode: mode.to_string(),
            },
        })
    };
    json!({
        "ok": !slot.as_ref().is_none_or(|p| p.steps.is_empty()),
        "mode": mode,
        "steps": slot.as_ref().map(|p| steps_to_json(&p.steps)).unwrap_or_default(),
        "meta": {
            "tools_since_touch": 0,
            "updated_at": updated_at,
            "step_count": slot.as_ref().map(|p| p.steps.len()).unwrap_or(0),
        }
    })
}

#[must_use]
pub fn format_internal_plan_snapshot_block(plan: &InternalPlanState) -> String {
    let mut block = format!(
        "{INTERNAL_WORK_PLAN_MARKER}\n\n\
         Engine-only micro-plan (not shown to the user). Update via `internal_plan_write` \
         as your understanding evolves.\n"
    );
    if let Some(ts) = plan.meta.updated_at.as_deref() {
        block.push_str(&format!(
            "_Last updated: {ts} · tools since touch: {}_\n",
            plan.meta.tools_since_touch
        ));
    }
    for step in &plan.steps {
        let paths = if step.paths.is_empty() {
            String::new()
        } else {
            format!(" · `{}`", step.paths.join("`, `"))
        };
        block.push_str(&format!(
            "\n- **{}** [{}] — {}{}",
            step.id, step.status, step.action, paths
        ));
        if !step.done_when.is_empty() {
            block.push_str(&format!(" _(done when: {})_", step.done_when));
        }
    }
    block.push('\n');
    block
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_empty_steps_replace() {
        assert!(internal_plan_shape_guard(None, &json!({ "steps": [] })).is_some());
    }

    #[test]
    fn accepts_valid_plan() {
        let args = json!({
            "steps": [{
                "id": "s1",
                "action": "Read header",
                "paths": ["src/a.ts"],
                "done_when": "lines 1-40 understood",
                "status": "in_progress"
            }]
        });
        assert!(internal_plan_shape_guard(None, &args).is_none());
    }

    #[test]
    fn merge_status_only_inherits_action() {
        let existing = InternalPlanState {
            steps: vec![InternalPlanStep {
                id: "s1".into(),
                action: "Explore workspace".into(),
                paths: vec!["src/a.ts".into()],
                done_when: "map read".into(),
                status: "in_progress".into(),
            }],
            meta: InternalPlanMeta::default(),
        };
        let args = json!({
            "mode": "merge",
            "steps": [{ "id": "s1", "status": "completed" }]
        });
        assert!(internal_plan_shape_guard(Some(&existing), &args).is_none());
        let (steps, mode) = resolve_internal_plan_write(Some(&existing), args).unwrap();
        assert_eq!(mode, "merge");
        assert_eq!(steps[0].action, "Explore workspace");
        assert_eq!(steps[0].paths, vec!["src/a.ts"]);
        assert_eq!(steps[0].done_when, "map read");
        assert_eq!(steps[0].status, "completed");
    }

    #[test]
    fn merge_updates_and_appends() {
        let mut slot = Some(InternalPlanState {
            steps: vec![InternalPlanStep {
                id: "s1".into(),
                action: "Read".into(),
                paths: vec![],
                done_when: String::new(),
                status: "pending".into(),
            }],
            meta: InternalPlanMeta::default(),
        });
        let out = ingest_internal_plan(
            &mut slot,
            json!({
                "mode": "merge",
                "steps": [{ "id": "s1", "action": "Read done", "status": "completed" }],
                "append_steps": [{ "id": "s2", "action": "Edit", "status": "in_progress" }]
            }),
        );
        assert_eq!(out["mode"], "merge");
        let plan = slot.unwrap();
        assert_eq!(plan.steps.len(), 2);
        assert_eq!(plan.steps[0].action, "Read done");
        assert_eq!(plan.meta.tools_since_touch, 0);
    }

    #[test]
    fn touch_increments_counter() {
        let mut state = ArchitectRunState::new();
        let _ = ingest_internal_plan(
            &mut state.internal_plan,
            json!({"steps":[{"id":"s1","action":"a","status":"pending"}]}),
        );
        record_internal_plan_tool_touch(&mut state, "file_read");
        record_internal_plan_tool_touch(&mut state, "file_read");
        assert_eq!(state.internal_plan.as_ref().unwrap().meta.tools_since_touch, 2);
        let _ = ingest_internal_plan(
            &mut state.internal_plan,
            json!({
                "mode": "merge",
                "steps": [{ "id": "s1", "action": "a", "status": "completed" }]
            }),
        );
        assert_eq!(state.internal_plan.as_ref().unwrap().meta.tools_since_touch, 0);
    }

    #[test]
    fn stale_nudge_respects_threshold() {
        let mut state = ArchitectRunState::new();
        let _ = ingest_internal_plan(
            &mut state.internal_plan,
            json!({"steps":[{"id":"s1","action":"a","status":"pending"}]}),
        );
        for _ in 0..5 {
            record_internal_plan_tool_touch(&mut state, "grep");
        }
        assert!(stale_internal_plan_nudge(&state, 6).is_none());
        assert!(stale_internal_plan_nudge(&state, 5).is_some());
    }
}
