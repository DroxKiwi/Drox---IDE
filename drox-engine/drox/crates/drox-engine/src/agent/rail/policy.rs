//! Tool allowlist per run rail station (English gate messages).

use drox_llm::ToolSpec;

use crate::orchestration::tool_folders::{
    FOLDER_EDIT_FILE, FOLDER_READ_WORKSPACE, FOLDER_VERIFY_PROJECT,
};

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

/// Virtual tool-folder surface → station (must match [`virtual_folder_allowed`]).
#[must_use]
pub fn minimum_station_for_virtual_folder(tool_name: &str) -> Option<RunStation> {
    match tool_name {
        FOLDER_READ_WORKSPACE => Some(RunStation::Read),
        FOLDER_EDIT_FILE => Some(RunStation::Act),
        FOLDER_VERIFY_PROJECT => Some(RunStation::Verify),
        _ => None,
    }
}

/// Whether a collapsed virtual folder may run at `station` (describe / expand).
#[must_use]
pub fn virtual_folder_allowed(station: RunStation, tool_name: &str) -> bool {
    match tool_name {
        FOLDER_READ_WORKSPACE => {
            matches!(station, RunStation::Intent | RunStation::Read)
        }
        FOLDER_EDIT_FILE => station == RunStation::Act,
        FOLDER_VERIFY_PROJECT => station == RunStation::Verify,
        _ => false,
    }
}

/// Minimum station on the linear rail that allows `tool_name` (auto-advance C12).
#[must_use]
pub fn minimum_station_for_tool(tool_name: &str) -> RunStation {
    if let Some(st) = minimum_station_for_virtual_folder(tool_name) {
        return st;
    }
    if tool_name == crate::orchestration::tool_folders::TOOL_INTERNAL_PLAN_WRITE {
        return RunStation::Intent;
    }
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
        RunStation::Act => {
            "Mutate files: if `file_edit`/`file_write` are folded, call `edit_file` \
             with {\"action\":\"describe\"} once, then use the unlocked wire tools; \
             or use notebook_edit / delete_path. Update statuses with `todo_write` when done."
        }
        RunStation::Verify => {
            "Verify with bash or lsp. Update todo statuses with `todo_write` when closing tasks. \
             Do not mutate files here — return to ACT for file_edit/file_write."
        }
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
    if tool_name == crate::orchestration::tool_folders::TOOL_INTERNAL_PLAN_WRITE {
        return true;
    }
    match station {
        RunStation::Intent => {
            tool_name == crate::orchestration::tool_folders::TOOL_INTERNAL_PLAN_WRITE
                || virtual_folder_allowed(station, tool_name)
        }
        RunStation::Propose => false,
        RunStation::Answer => tool_name == "todo_write",
        RunStation::Read => {
            READ_TOOLS.contains(&tool_name) || virtual_folder_allowed(station, tool_name)
        }
        RunStation::Plan => PLAN_TOOLS.contains(&tool_name) || READ_TOOLS.contains(&tool_name),
        RunStation::Act => {
            MUTATION_TOOLS.contains(&tool_name)
                || READ_TOOLS.contains(&tool_name)
                || tool_name == "todo_write"
                || virtual_folder_allowed(station, tool_name)
        }
        RunStation::Verify => {
            VERIFY_TOOLS.contains(&tool_name)
                || tool_name == "todo_write"
                || virtual_folder_allowed(station, tool_name)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::rail::state::RunRailState;
    use crate::agent::rail::station::RunStation;

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
    fn act_allows_todo_write_for_status_updates() {
        assert!(tool_allowed(RunStation::Act, "todo_write"));
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
    fn verify_allows_todo_write() {
        assert!(tool_allowed(RunStation::Verify, "todo_write"));
        assert!(!tool_allowed(RunStation::Verify, "file_write"));
    }

    #[test]
    fn minimum_station_maps_tools() {
        assert_eq!(minimum_station_for_tool("file_read"), RunStation::Read);
        assert_eq!(minimum_station_for_tool("todo_write"), RunStation::Plan);
        assert_eq!(minimum_station_for_tool("file_edit"), RunStation::Act);
        assert_eq!(minimum_station_for_tool("bash"), RunStation::Verify);
        assert_eq!(minimum_station_for_tool(FOLDER_READ_WORKSPACE), RunStation::Read);
        assert_eq!(minimum_station_for_tool(FOLDER_EDIT_FILE), RunStation::Act);
        assert_eq!(minimum_station_for_tool(FOLDER_VERIFY_PROJECT), RunStation::Verify);
    }

    #[test]
    fn virtual_folder_edit_file_allowed_at_act() {
        assert!(virtual_folder_allowed(RunStation::Act, FOLDER_EDIT_FILE));
        assert!(tool_allowed(RunStation::Act, FOLDER_EDIT_FILE));
        assert!(!tool_allowed(RunStation::Read, FOLDER_EDIT_FILE));
    }

    #[test]
    fn virtual_folder_read_workspace_allowed_at_intent_and_read() {
        assert!(virtual_folder_allowed(RunStation::Intent, FOLDER_READ_WORKSPACE));
        assert!(virtual_folder_allowed(RunStation::Read, FOLDER_READ_WORKSPACE));
        assert!(tool_allowed(RunStation::Intent, FOLDER_READ_WORKSPACE));
        assert!(!tool_allowed(RunStation::Act, FOLDER_READ_WORKSPACE));
    }

    #[test]
    fn align_read_workspace_from_intent_targets_read_not_act() {
        use super::super::infer::align_station_from_tools;
        use super::super::transition::OpenTodoCounts;
        let mut state = RunRailState::new();
        align_station_from_tools(
            &mut state,
            &[FOLDER_READ_WORKSPACE],
            OpenTodoCounts::default(),
        );
        assert_eq!(state.station, RunStation::Read);
    }
}
