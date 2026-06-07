//! Tool `architect_help` — rappel contextuel du protocole architecte (1.2.0).
//!
//! Read-only, sans I/O. Le moteur fournit un snapshot d'état via
//! [`crate::context::ToolContext::architect_help_snapshot`].

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::tool::Tool;

/// État architecte sérialisé pour l'aide contextuelle (copié par le moteur).
#[derive(Debug, Clone, Default)]
pub struct ArchitectHelpSnapshot {
    pub user_request: Option<String>,
    /// `discovery` | `task` — déclaré par le modèle via `[mode: …]`.
    pub work_mode: Option<String>,
    pub run_objective: Option<String>,
    pub run_closable: bool,
    /// Plan terminé + vérification globale (smoke / utilisateur) OK.
    pub run_fully_closable: bool,
    /// `pending` | `passed` | `failed` | `user_delegated`
    pub cycle_sanity: String,
    pub plan_id: Option<String>,
    pub todo_items: Vec<ArchitectHelpTodoItem>,
    pub last_delegate_task_id: Option<String>,
    pub last_delegate_status: Option<String>,
    pub last_delegate_verified: bool,
    pub verified_task_ids: Vec<String>,
    pub reads_since_delegate: usize,
    pub workspace_map_loaded: bool,
}

#[derive(Debug, Clone)]
pub struct ArchitectHelpTodoItem {
    pub id: String,
    pub status: String,
    pub label: String,
}

/// Payload `architect_help`.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct ArchitectHelpInput {
    /// `auto` (défaut) déduit le sujet depuis l'état du run.
    /// Sinon : `closure`, `sanity`, `delegate`, `verify`, `plan`, `phases`, `general`.
    #[serde(default = "default_topic")]
    pub topic: String,
}

fn default_topic() -> String {
    "auto".to_string()
}

pub struct ArchitectHelpTool;

#[async_trait]
impl Tool for ArchitectHelpTool {
    fn name(&self) -> &str {
        "architect_help"
    }

    fn description(&self) -> &str {
        "Contextual playbook for the Architect role: full tools vs Executor sub-agents (`delegate_executor`), \
         parallel slot count, when to verify, update todos, or close. Read-only. \
         Use when unsure what to do next — especially delegate vs direct edit, or near `[phase: done]`. \
         Format: {\"topic\": \"auto\"|\"closure\"|\"sanity\"|\"delegate\"|\"verify\"|\"plan\"|\"phases\"|\"general\"}."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(ArchitectHelpInput)).unwrap_or(Value::Null)
    }

    fn is_read_only(&self) -> bool {
        true
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let args: ArchitectHelpInput = serde_json::from_value(input).map_err(|e| {
            ToolError::invalid_args(format!(
                "architect_help: invalid JSON ({e}). Expected {{\"topic\": \"auto\"}}."
            ))
        })?;
        let Some(snapshot) = ctx.architect_help_snapshot.as_ref() else {
            return Err(ToolError::invalid_args(
                "architect_help: unavailable outside Architect orchestration runs",
            ));
        };
        let topic = resolve_topic(&args.topic, snapshot);
        let parallel_slots = ctx.max_todo_in_progress_allowed();
        let guidance = build_guidance(topic, snapshot, parallel_slots);
        Ok(json!({
            "topic": topic,
            "run_closable": snapshot.run_closable,
            "guidance": guidance,
        }))
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum HelpTopic {
    Auto,
    Closure,
    Sanity,
    Delegate,
    Verify,
    Plan,
    Phases,
    General,
}

fn resolve_topic(raw: &str, snapshot: &ArchitectHelpSnapshot) -> &'static str {
    let topic = parse_topic(raw);
    if topic != HelpTopic::Auto {
        return topic_wire(topic);
    }
    if snapshot.run_fully_closable {
        return "closure";
    }
    if snapshot.run_closable && snapshot.cycle_sanity == "pending" {
        return "sanity";
    }
    if snapshot.last_delegate_status.as_deref() == Some("partial")
        && !snapshot.last_delegate_verified
    {
        return "verify";
    }
    if snapshot.todo_items.is_empty() {
        return "plan";
    }
    "general"
}

fn parse_topic(raw: &str) -> HelpTopic {
    match raw.trim().to_ascii_lowercase().as_str() {
        "closure" | "close" | "done" | "fin" => HelpTopic::Closure,
        "sanity" | "smoke" | "regression" | "end_check" | "fonctionne" => HelpTopic::Sanity,
        "delegate" | "executor" | "delegation" => HelpTopic::Delegate,
        "verify" | "verification" => HelpTopic::Verify,
        "plan" | "todo" | "todos" => HelpTopic::Plan,
        "phases" | "phase" => HelpTopic::Phases,
        "general" | "help" => HelpTopic::General,
        _ => HelpTopic::Auto,
    }
}

fn topic_wire(t: HelpTopic) -> &'static str {
    match t {
        HelpTopic::Closure => "closure",
        HelpTopic::Sanity => "sanity",
        HelpTopic::Delegate => "delegate",
        HelpTopic::Verify => "verify",
        HelpTopic::Plan => "plan",
        HelpTopic::Phases => "phases",
        HelpTopic::General => "general",
        HelpTopic::Auto => "auto",
    }
}

fn build_guidance(topic: &str, s: &ArchitectHelpSnapshot, parallel_slots: usize) -> String {
    let mut out = String::from("## Architect help\n\n");
    out.push_str("### Run snapshot\n");
    if let Some(req) = s.user_request.as_deref() {
        out.push_str(&format!("- **User request:** {req}\n"));
    } else {
        out.push_str("- **User request:** (see cycle anchor)\n");
    }
    if let Some(obj) = s.run_objective.as_deref() {
        out.push_str(&format!("- **Run objective:** {obj}\n"));
    }
    if let Some(mode) = s.work_mode.as_deref() {
        out.push_str(&format!("- **Work mode:** `{mode}`\n"));
    }
    out.push_str(&format!(
        "- **Run closable (plan done):** {}\n",
        if s.run_closable { "yes" } else { "no" }
    ));
    out.push_str(&format!(
        "- **Ready to close (sanity OK):** {}\n",
        if s.run_fully_closable {
            "yes — `[phase: answering]` then `[phase: done]`"
        } else {
            "no"
        }
    ));
    out.push_str(&format!("- **Cycle sanity:** `{}`\n", s.cycle_sanity));
    if let Some(pid) = s.plan_id.as_deref() {
        out.push_str(&format!("- **Plan id:** `{pid}` → `.drox/agent-output/{pid}/<task_id>/`\n"));
    }
    out.push_str("- **Your tools:** full workspace access (`file_edit`, `bash`, reads, …) — you are not limited to delegation.\n");
    if parallel_slots > 1 {
        out.push_str(&format!(
            "- **Parallel sub-agents:** up to **{parallel_slots}** slots — batch independent scopes via `delegate_executor` `tasks[]`.\n"
        ));
    } else {
        out.push_str(
            "- **Sub-agents:** optional — one `delegate_executor` task at a time when isolating work; otherwise edit/bash yourself.\n",
        );
    }
    if !s.todo_items.is_empty() {
        out.push_str("- **Todos:**\n");
        for item in &s.todo_items {
            let verified = if s.verified_task_ids.iter().any(|v| v == &item.id) {
                " · verified"
            } else {
                ""
            };
            out.push_str(&format!(
                "  - `{id}` [{status}]{verified} — {label}\n",
                id = item.id,
                status = item.status,
                label = item.label,
            ));
        }
    }
    if let Some(task) = s.last_delegate_task_id.as_deref() {
        out.push_str(&format!(
            "- **Last delegate:** `{task}` · status `{}` · engine verified: {}\n",
            s.last_delegate_status.as_deref().unwrap_or("?"),
            s.last_delegate_verified
        ));
    }
    out.push('\n');
    match topic {
        "closure" => out.push_str(guidance_closure(s)),
        "sanity" => out.push_str(guidance_sanity(s)),
        "delegate" => out.push_str(&guidance_delegate(s, parallel_slots)),
        "verify" => out.push_str(&guidance_verify(s)),
        "plan" => out.push_str(&guidance_plan(parallel_slots)),
        "phases" => out.push_str(guidance_phases()),
        _ => out.push_str(guidance_general(s)),
    }
    out
}

fn guidance_sanity(s: &ArchitectHelpSnapshot) -> &'static str {
    if s.run_fully_closable {
        return "### Cycle sanity — already resolved\n\
                Proceed with `[phase: answering]` and `[phase: done]` (see `topic: closure`).";
    }
    if s.cycle_sanity == "failed" {
        return "### Cycle sanity — FAILED\n\
                The smoke / build check did not pass. In `[phase: answering]`:\n\
                1. State clearly what failed (command, error snippet, affected area).\n\
                2. Give **fix hints** (likely files, config, dependency, order of operations).\n\
                3. Offer to fix in a follow-up — do **not** claim the mission succeeded.";
    }
    "### Cycle sanity — suggested before close\n\
     All todos are done — consider confirming the **whole project still works**:\n\
     1. Pick one command that matches the stack (`package.json` scripts, `Cargo.toml`, `pyproject.toml`, CI config).\n\
     2. `delegate_executor` with `task_id` `sanity`, narrow `scope`, instructions with exact command + success criteria.\n\
     3. If impossible (size, unknown tech): `ask_user_question` with a **specific** manual check.\n\
     4. On pass → user summary. On fail → report + hints. Then `[phase: done]`."
}

fn guidance_closure(s: &ArchitectHelpSnapshot) -> &'static str {
    if s.run_fully_closable {
        "### Closure — do this now\n\
         1. **Stop** calling `delegate_executor`, `workspace_map_read`, `file_read`, `grep`, `glob`.\n\
         2. Emit **`[phase: answering]`** once with the **user-facing** summary (what changed, paths).\n\
         3. On the **next line**, emit only **`[phase: done]`** — no tools, no repeated tables.\n\
         4. Do **not** re-summarize in thinking — the engine will stop the run.\n\
         Optional: `todo_write` with the same completed list (or empty if engine allows) then steps 2–3."
    } else if s.run_closable {
        "### Closure — waiting on cycle sanity\n\
         Plan tasks are done. Complete **cycle sanity** first (`architect_help { \"topic\": \"sanity\" }`), \
         then call `topic: closure` again."
    } else if s.todo_items.is_empty() {
        "### Closure — light run (no plan)\n\
         No `todo_write` yet. If the user only greeted or asked something simple:\n\
         1. **Stop** calling tools.\n\
         2. **`[phase: answering]`** — short reply visible in chat.\n\
         3. **`[phase: done]`** on the next line.\n\
         If they asked for real repo work, prefer `delegate_executor` (sub-agent) — optional `todo_write` — do not loop on `architect_help`."
    } else {
        "### Closure — not yet\n\
         Open todos remain. Finish with direct edits/bash and/or `delegate_executor` for parallel shards → \
         optional sanity check → then `[phase: answering]` + `[phase: done]`."
    }
}

fn guidance_delegate(s: &ArchitectHelpSnapshot, parallel_slots: usize) -> String {
    let mode_hint = match s.work_mode.as_deref() {
        Some("discovery") => "\n**Mode discovery:** prefer multi-line plan (one axis + path per line) before delegating.\n",
        Some("task") => "\n**Mode task:** keep discovery minimal — one targeted read, then delegate.\n",
        _ => "",
    };
    let in_progress_rule = if parallel_slots > 1 {
        format!(
            "3. Mark up to **{parallel_slots}** independent tasks `in_progress`, then one **`delegate_executor`** call with `tasks[]` for the batch — or delegate sequentially when scopes nest (same path or directory containing another task's tree). Different files in the same folder can batch.\n\
             3b. If you intend parallel work but send only one item in `tasks[]`, only one `task_id` runs.\n"
        )
    } else {
        "3. Set one task `in_progress`, then **`delegate_executor`** with same `task_id`, narrow `scope`, \
         and instructions (no repo-wide discovery).\n"
            .to_string()
    };
    format!(
        "### Delegate (Executor sub-agent — parallel workers){mode_hint}\n\
         **When:** parallelize independent shards (slots > 1) or isolate a heavy sub-task. You may also `file_edit` / `bash` directly.\n\
         1. Optional `workspace_map_read` for real `scope` paths.\n\
         2. Optional `todo_write` to track shards (`t1`, `t2`, …).\n\
         {in_progress_rule}\
         4. Pack **complete** `instructions` + `scope` + `context` — sub-agents cannot plan, delegate, or improvise scope.\n\
         5. After return: read deliverable `.md` or verify yourself; fix gaps with direct edits if faster."
    )
}

fn guidance_verify(s: &ArchitectHelpSnapshot) -> String {
    let task = s
        .last_delegate_task_id
        .as_deref()
        .unwrap_or("<task_id>");
    format!(
        "### After delegate (task `{task}`)\n\
         Status was `partial` or you want extra confidence:\n\
         1. Read the executor `.md` deliverable or spot-check scope with `file_read` / `grep`.\n\
         2. If satisfied, update `todo_write` (`completed`) when you use a plan.\n\
         3. Otherwise re-delegate with a sharper brief — or shard the todo.\n\
         The engine does not block your next tool; use judgment."
    )
}

fn guidance_plan(parallel_slots: usize) -> String {
    let in_progress_rule = if parallel_slots > 1 {
        format!(
            "     - With **{parallel_slots}** parallel slots: up to {parallel_slots} tasks may be `in_progress` at once when launching a batch (`tasks[]`); otherwise keep one active.\n"
        )
    } else {
        "     - Keep one task `in_progress` at a time.\n".to_string()
    };
    format!(
        "### Plan (`todo_write` — optional)\n\
         - Split the **user request** into small shards (not generic « analyze project »).\n\
         - Each shard should be delegable via `delegate_executor` with a narrow `scope`.\n\
{in_progress_rule}\
         - Parallel: several `in_progress` todos → one `delegate_executor` with multiple `tasks[]` entries.\n\
         - Batch template:\n\
           `{{\"tasks\":[{{\"task_id\":\"t1\",\"description\":\"…\",\"scope\":[\"src/a\"],\"instructions\":\"…\"}},{{\"task_id\":\"t2\",\"description\":\"…\",\"scope\":[\"src/b\"],\"instructions\":\"…\"}}]}}`\n\
         - Skip `todo_write` entirely for one-shot fixes — delegate directly."
    )
}

fn guidance_phases() -> &'static str {
    "### Phases (Architect)\n\
     - `[phase: planning]` / `[phase: analyzing]` — orient & optional plan.\n\
     - `[phase: acting]` — edit, bash, delegate, verify.\n\
     - `[phase: answering]` — **only** user-visible report (Markdown).\n\
     - `[phase: done]` — single terminal line; run ends.\n\
     `[run_objective: …]` early: one actionable line for the UI banner."
}

fn guidance_general(s: &ArchitectHelpSnapshot) -> &'static str {
    if s.run_fully_closable {
        return guidance_closure(s);
    }
    if s.run_closable {
        return guidance_sanity(s);
    }
    "### General cycle\n\
     1. Anchor on the **user request**.\n\
     2. **Act** — `file_edit` / `bash` / reads yourself, or `delegate_executor` to parallelize.\n\
     3. Optional `todo_write` to track shards.\n\
     4. User summary in `[phase: answering]`, then `[phase: done]`.\n\
     Topics: `delegate`, `plan`, `verify`, `sanity`, `closure`."
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;

    fn snapshot_closable() -> ArchitectHelpSnapshot {
        ArchitectHelpSnapshot {
            user_request: Some("Multiply flashlight radius by 3".into()),
            run_closable: true,
            run_fully_closable: true,
            cycle_sanity: "passed".into(),
            todo_items: vec![ArchitectHelpTodoItem {
                id: "t1".into(),
                status: "completed".into(),
                label: "Update radii".into(),
            }],
            verified_task_ids: vec!["t1".into()],
            last_delegate_task_id: Some("t1".into()),
            last_delegate_status: Some("completed".into()),
            last_delegate_verified: true,
            ..Default::default()
        }
    }

    #[test]
    fn auto_topic_picks_closure_when_closable() {
        assert_eq!(resolve_topic("auto", &snapshot_closable()), "closure");
    }

    #[test]
    fn closure_guidance_tells_to_stop_tools() {
        let g = build_guidance("closure", &snapshot_closable(), 1);
        assert!(g.contains("[phase: done]"));
        assert!(g.contains("Stop"));
    }

    #[tokio::test]
    async fn execute_returns_guidance_json() {
        let snap = snapshot_closable();
        let ctx = ToolContext::new(Utf8PathBuf::from("/tmp"), false)
            .with_architect_help_snapshot(snap);
        let out = ArchitectHelpTool
            .execute(&ctx, json!({ "topic": "closure" }))
            .await
            .unwrap();
        assert_eq!(out["topic"], "closure");
        assert!(out["guidance"].as_str().unwrap().contains("Architect help"));
    }
}
