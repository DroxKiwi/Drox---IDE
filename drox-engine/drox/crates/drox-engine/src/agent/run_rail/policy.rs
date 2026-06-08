//! Tool allowlist per run rail station (English gate messages).

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

/// Whether `tool_name` may run in `station`.
#[must_use]
pub fn tool_allowed(station: RunStation, tool_name: &str) -> bool {
    match station {
        RunStation::Intent | RunStation::Propose | RunStation::Answer => false,
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
}
