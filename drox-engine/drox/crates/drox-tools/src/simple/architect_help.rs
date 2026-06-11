//! Tool `architect_help` — rappel contextuel du protocole architecte (rail solo).

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
    pub run_objective: Option<String>,
    pub todo_items: Vec<ArchitectHelpTodoItem>,
    pub workspace_map_loaded: bool,
}

#[derive(Debug, Clone)]
pub struct ArchitectHelpTodoItem {
    pub id: String,
    pub status: String,
    pub label: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ArchitectHelpInput {
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
        "Contextual playbook for the Architect role: plan, verify, closure. Read-only. \
         Use when unsure what to do next or near `[phase: done]`. \
         Format: {\"topic\": \"auto\"|\"closure\"|\"verify\"|\"plan\"|\"phases\"|\"general\"}."
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
        let guidance = build_guidance(topic, snapshot);
        Ok(json!({
            "topic": topic,
            "todos_all_terminal": todos_all_terminal(snapshot),
            "guidance": guidance,
        }))
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum HelpTopic {
    Auto,
    Closure,
    Verify,
    Plan,
    Phases,
    General,
}

fn todos_all_terminal(s: &ArchitectHelpSnapshot) -> bool {
    !s.todo_items.is_empty()
        && s
            .todo_items
            .iter()
            .all(|item| matches!(item.status.as_str(), "completed" | "cancelled"))
}

fn resolve_topic(raw: &str, snapshot: &ArchitectHelpSnapshot) -> &'static str {
    let topic = parse_topic(raw);
    if topic != HelpTopic::Auto {
        return topic_wire(topic);
    }
    if todos_all_terminal(snapshot) {
        return "closure";
    }
    if snapshot.todo_items.is_empty() {
        return "plan";
    }
    "general"
}

fn parse_topic(raw: &str) -> HelpTopic {
    match raw.trim().to_ascii_lowercase().as_str() {
        "closure" | "close" | "done" | "fin" => HelpTopic::Closure,
        "verify" | "sanity" | "smoke" | "regression" | "test" | "tests" => HelpTopic::Verify,
        "plan" | "todo" | "todos" => HelpTopic::Plan,
        "phases" | "phase" => HelpTopic::Phases,
        "general" | "help" => HelpTopic::General,
        _ => HelpTopic::Auto,
    }
}

fn topic_wire(t: HelpTopic) -> &'static str {
    match t {
        HelpTopic::Closure => "closure",
        HelpTopic::Verify => "verify",
        HelpTopic::Plan => "plan",
        HelpTopic::Phases => "phases",
        HelpTopic::General => "general",
        HelpTopic::Auto => "auto",
    }
}

fn build_guidance(topic: &str, s: &ArchitectHelpSnapshot) -> String {
    let mut out = String::from("## Architect help\n\n");
    out.push_str("### Run snapshot\n");
    if let Some(req) = s.user_request.as_deref() {
        out.push_str(&format!("- **User request:** {req}\n"));
    } else {
        out.push_str("- **User request:** *(see run snapshot)*\n");
    }
    if let Some(obj) = s.run_objective.as_deref() {
        out.push_str(&format!("- **Run objective:** {obj}\n"));
    }
    out.push_str("- **Mode:** single-model architect — work directly with tools.\n");
    if !s.todo_items.is_empty() {
        out.push_str("- **Todos:**\n");
        for item in &s.todo_items {
            out.push_str(&format!(
                "  - `{id}` [{status}] — {label}\n",
                id = item.id,
                status = item.status,
                label = item.label,
            ));
        }
    }
    out.push('\n');
    match topic {
        "closure" => out.push_str(guidance_closure(s)),
        "verify" => out.push_str(guidance_verify()),
        "plan" => out.push_str(guidance_plan()),
        "phases" => out.push_str(guidance_phases()),
        _ => out.push_str(guidance_general(s)),
    }
    out
}

fn guidance_verify() -> &'static str {
    "### Verify before close\n\
     At the VERIFY station, confirm the change still works:\n\
     1. Pick one command that matches the stack (`package.json` scripts, `Cargo.toml`, CI config).\n\
     2. Run it with **`bash`** (or targeted `file_read` / `grep` if no safe command).\n\
     3. On pass → user summary in `[phase: answering]`. On fail → report what broke and fix in ACT.\n\
     4. Then `[phase: done]`."
}

fn guidance_closure(s: &ArchitectHelpSnapshot) -> &'static str {
    if todos_all_terminal(s) {
        return "### Closure — do this now\n\
             1. **Stop** calling tools unless VERIFY still needs a check.\n\
             2. Emit **`[phase: answering]`** once with the user-facing summary.\n\
             3. On the next line, emit only **`[phase: done]`**.\n\
             4. Do not repeat the whole analysis in thinking.";
    }
    if s.todo_items.is_empty() {
        return "### Closure — light run (no plan)\n\
             No `todo_write` yet. If the user only greeted or asked something simple:\n\
             1. **Stop** calling tools.\n\
             2. **`[phase: answering]`** — short reply visible in chat.\n\
             3. **`[phase: done]`** on the next line.\n\
             If they asked for real repo work, act directly — optional `todo_write`.";
    }
    "### Closure — not yet\n\
     Open todos remain. Finish work in ACT, update `todo_write`, optional VERIFY, then \
     `[phase: answering]` + `[phase: done]`."
}

fn guidance_plan() -> &'static str {
    "### Plan (`todo_write` — optional)\n\
     - Split the **user request** into small steps.\n\
     - Keep one task `in_progress` at a time when tracking work.\n\
     - Execute each step with `file_edit`, `bash`, `grep`, `file_read`.\n\
     - Skip `todo_write` for one-shot fixes."
}

fn guidance_phases() -> &'static str {
    "### Phases (rail solo)\n\
     - Use **`[gate: advance]`** / **`[gate: hold]`** with the run rail when prompted.\n\
     - **`[phase: answering]`** — only user-visible report (Markdown).\n\
     - **`[phase: done]`** — single terminal line; run ends.\n\
     `[run_objective: …]` early: one actionable line for the UI banner."
}

fn guidance_general(s: &ArchitectHelpSnapshot) -> &'static str {
    if todos_all_terminal(s) {
        return guidance_closure(s);
    }
    "### General cycle\n\
     1. Anchor on the **user request**.\n\
     2. **Act** — `file_edit` / `bash` / reads at the current rail station.\n\
     3. Optional `todo_write` to track steps.\n\
     4. VERIFY when the rail asks for it.\n\
     5. User summary in `[phase: answering]`, then `[phase: done]`.\n\
     Topics: `plan`, `verify`, `closure`."
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;

    fn snapshot_ready_to_close() -> ArchitectHelpSnapshot {
        ArchitectHelpSnapshot {
            user_request: Some("Multiply flashlight radius by 3".into()),
            todo_items: vec![ArchitectHelpTodoItem {
                id: "t1".into(),
                status: "completed".into(),
                label: "Update radii".into(),
            }],
            ..Default::default()
        }
    }

    #[test]
    fn auto_topic_picks_closure_when_todos_terminal() {
        assert_eq!(resolve_topic("auto", &snapshot_ready_to_close()), "closure");
    }

    #[test]
    fn closure_guidance_tells_to_stop_tools() {
        let g = build_guidance("closure", &snapshot_ready_to_close());
        assert!(g.contains("[phase: done]"));
        assert!(g.contains("Stop"));
    }

    #[test]
    fn verify_guidance_uses_bash() {
        let g = guidance_verify();
        assert!(g.contains("bash"));
    }

    #[tokio::test]
    async fn execute_returns_guidance_json() {
        let snap = snapshot_ready_to_close();
        let ctx = ToolContext::new(Utf8PathBuf::from("/tmp"), false)
            .with_architect_help_snapshot(snap);
        let out = ArchitectHelpTool
            .execute(&ctx, json!({ "topic": "closure" }))
            .await
            .unwrap();
        assert_eq!(out["topic"], "closure");
        assert_eq!(out["todos_all_terminal"], true);
        assert!(out["guidance"].as_str().unwrap().contains("Architect help"));
    }
}
