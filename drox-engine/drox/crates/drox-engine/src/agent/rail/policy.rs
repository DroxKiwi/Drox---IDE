//! Rail inference helpers — station hints and tool classification (observateur, no ACL).

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

const PLAN_TOOLS: &[&str] = &[
    crate::orchestration::internal_plan_tool::TOOL_INTERNAL_PLAN_WRITE,
    "architect_help",
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

/// Minimum station on the linear rail inferred from a tool call (auto-advance C12).
#[must_use]
pub fn minimum_station_for_tool(tool_name: &str) -> RunStation {
    if tool_name == crate::orchestration::internal_plan_tool::TOOL_INTERNAL_PLAN_WRITE {
        return RunStation::Intent;
    }
    if PLAN_TOOLS.contains(&tool_name) {
        return RunStation::Plan;
    }
    if matches!(
        tool_name,
        "file_edit"
            | "file_write"
            | "notebook_edit"
            | "delete_path"
            | "copy_path"
            | "git_worktree_enter"
            | "git_worktree_exit"
    ) {
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

/// Informational hint for rail snapshot (not a gate).
#[must_use]
pub fn station_action_hint(station: RunStation) -> &'static str {
    match station {
        RunStation::Intent => "Clarify the request; explore with file_read, grep, or workspace_map_read.",
        RunStation::Read => "Exploring — use file_read, grep, lsp, workspace_map_read as needed.",
        RunStation::Propose => "Propose the approach; wait for the user if depth is complex.",
        RunStation::Plan => "Plan with `internal_plan_write`; read tools remain available.",
        RunStation::Act => {
            "Apply changes with file_edit / file_write; then verify before answering."
        }
        RunStation::Verify => {
            "Verify: discover a project check (`bash`, `lsp` on edited files), or document `[verify: waived]`."
        }
        RunStation::Answer => {
            "Reply in [phase: answering], then [phase: done]. `internal_plan_write` allowed for status updates."
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minimum_station_maps_tools() {
        assert_eq!(minimum_station_for_tool("file_read"), RunStation::Read);
        assert_eq!(
            minimum_station_for_tool(
                crate::orchestration::internal_plan_tool::TOOL_INTERNAL_PLAN_WRITE
            ),
            RunStation::Intent
        );
        assert_eq!(minimum_station_for_tool("file_edit"), RunStation::Act);
        assert_eq!(minimum_station_for_tool("bash"), RunStation::Verify);
    }

    #[test]
    fn mutation_tool_detection() {
        assert!(is_mutation_tool("file_edit"));
        assert!(!is_mutation_tool("file_read"));
    }
}
