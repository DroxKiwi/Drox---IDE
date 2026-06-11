//! Tool allowlist per run rail station (English gate messages).

use drox_llm::ToolSpec;

use super::station::RunStation;

const READ_TOOLS: &[&str] = &[
    "file_read",
    "glob",
    "grep",
    "lsp",
    "workspace_map_read",
    "memory_read",
    "memory_list",
    "web_fetch",
    "web_search",
];

const PLAN_TOOLS: &[&str] = &["todo_write", "architect_help"];

const VERIFY_TOOLS: &[&str] = &[
    "bash",
    "lsp",
    "file_read",
    "grep",
    "glob",
    "web_fetch",
    "web_search",
];

const MUTATION_TOOLS: &[&str] = &[
    "file_edit",
    "file_write",
    "notebook_edit",
    "delete_path",
    "copy_path",
    "bash",
    "git_worktree_enter",
    "git_worktree_exit",
];

/// Minimum station on the linear rail that allows `tool_name` (auto-advance C12).
#[must_use]
pub fn minimum_station_for_tool(tool_name: &str) -> RunStation {
    if PLAN_TOOLS.contains(&tool_name) {
        return RunStation::Plan;
    }
    if matches!(tool_name, "file_edit" | "file_write" | "notebook_edit" | "delete_path" | "copy_path" | "git_worktree_enter" | "git_worktree_exit") {
        return RunStation::Act;
    }
    if tool_name == "bash" || tool_name == "lsp" {
        return RunStation::Verify;
    }
    if READ_TOOLS.contains(&tool_name) {
        return RunStation::Read;
    }
    RunStation::Act
}

/// Whether `tool_name` is a workspace mutation tool (ACT / VERIFY routing).
#[must_use]
pub fn is_mutation_tool(tool_name: &str) -> bool {
    MUTATION_TOOLS.contains(&tool_name)
}

/// Keep only tools the model may call in the current station (Phase 4 — before LLM).
#[must_use]
pub fn filter_tool_specs_for_station(specs: Vec<ToolSpec>, station: RunStation) -> Vec<ToolSpec> {
    specs
        .into_iter()
        .filter(|spec| tool_allowed(station, &spec.name))
        .collect()
}

/// Short action hint for `pre_gate` and snapshot (English engine contract).
#[must_use]
pub fn station_action_hint(station: RunStation) -> &'static str {
    match station {
        RunStation::Intent => "Clarify the request, then explore with file_read, glob, or grep.",
        RunStation::Read => "Explore with file_read, glob, grep, lsp, or workspace_map_read.",
        RunStation::Propose => "Propose the approach; wait for the user if depth is complex.",
        RunStation::Plan => "Plan with todo_write; read tools are allowed to refine the plan.",
        RunStation::Act => "Mutate files with file_edit, file_write, notebook_edit, or delete_path.",
        RunStation::Verify => "Verify with bash or lsp.",
        RunStation::Answer => {
            "Reply in [phase: answering], then [phase: done]. \
             With open todos you may call `todo_write` to update statuses; \
             the engine keeps you on ACT while work remains."
        }
    }
}

/// Whether `tool_name` may run in `station`.
#[must_use]
pub fn tool_allowed(station: RunStation, tool_name: &str) -> bool {
    match station {
        RunStation::Intent | RunStation::Propose => false,
        RunStation::Answer => tool_name == "todo_write",
        RunStation::Read => READ_TOOLS.contains(&tool_name),
        RunStation::Plan => PLAN_TOOLS.contains(&tool_name) || READ_TOOLS.contains(&tool_name),
        RunStation::Act => {
            MUTATION_TOOLS.contains(&tool_name) || READ_TOOLS.contains(&tool_name)
        }
        RunStation::Verify => VERIFY_TOOLS.contains(&tool_name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_station_blocks_file_edit() {
        assert!(!tool_allowed(RunStation::Read, "file_edit"));
        assert!(tool_allowed(RunStation::Read, "file_read"));
    }

    #[test]
    fn act_allows_file_edit() {
        assert!(tool_allowed(RunStation::Act, "file_edit"));
    }

    #[test]
    fn plan_allows_todo_write() {
        assert!(tool_allowed(RunStation::Plan, "todo_write"));
        assert!(!tool_allowed(RunStation::Plan, "file_edit"));
    }

    #[test]
    fn filter_specs_hides_skill_list_in_act() {
        let specs = vec![
            ToolSpec {
                name: "file_edit".into(),
                description: String::new(),
                parameters: serde_json::json!({}),
            },
            ToolSpec {
                name: "skill_list".into(),
                description: String::new(),
                parameters: serde_json::json!({}),
            },
        ];
        let filtered = filter_tool_specs_for_station(specs, RunStation::Act);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].name, "file_edit");
    }

    #[test]
    fn answer_allows_todo_write_only() {
        assert!(tool_allowed(RunStation::Answer, "todo_write"));
        assert!(!tool_allowed(RunStation::Answer, "file_write"));
    }

    #[test]
    fn minimum_station_maps_tools() {
        assert_eq!(minimum_station_for_tool("file_read"), RunStation::Read);
        assert_eq!(minimum_station_for_tool("todo_write"), RunStation::Plan);
        assert_eq!(minimum_station_for_tool("file_edit"), RunStation::Act);
        assert_eq!(minimum_station_for_tool("bash"), RunStation::Verify);
    }
}
