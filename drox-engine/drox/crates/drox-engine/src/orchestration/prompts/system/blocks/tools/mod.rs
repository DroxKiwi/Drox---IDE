//! Blocs protocole outil (`T-*`) — complètent le schéma function calling.

use super::{join_sections, render_md};
use crate::orchestration::prompts::vars::PromptVars;

/// Noms d'outils allowlist architecte (wire = nom tool).
pub const TOOL_TODO_WRITE: &str = "todo_write";
pub const TOOL_WORKSPACE_MAP_READ: &str = "workspace_map_read";
pub const TOOL_FILE_EDIT: &str = "file_edit";
pub const TOOL_FILE_WRITE: &str = "file_write";
pub const TOOL_FILE_READ: &str = "file_read";
pub const TOOL_GREP: &str = "grep";
pub const TOOL_LSP: &str = "lsp";
pub const TOOL_ARCHITECT_HELP: &str = "architect_help";
pub const TOOL_ASK_USER_QUESTION: &str = "ask_user_question";

const ALL_ARCHITECT_TOOL_BLOCKS: &[&str] = &[
    TOOL_TODO_WRITE,
    TOOL_WORKSPACE_MAP_READ,
    TOOL_FILE_EDIT,
    TOOL_FILE_WRITE,
    TOOL_FILE_READ,
    TOOL_GREP,
    TOOL_LSP,
    TOOL_ARCHITECT_HELP,
    TOOL_ASK_USER_QUESTION,
];

macro_rules! tool_block {
    ($fn:ident, $file:literal) => {
        #[must_use]
        pub fn $fn(vars: &PromptVars) -> String {
            render_md(vars, include_str!($file))
        }
    };
}

tool_block!(todo_write, "todo_write.md");
tool_block!(workspace_map_read, "workspace_map_read.md");
tool_block!(file_edit, "file_edit.md");
tool_block!(file_write, "file_write.md");
tool_block!(file_read, "file_read.md");
tool_block!(grep, "grep.md");
tool_block!(lsp, "lsp.md");
tool_block!(architect_help, "architect_help.md");
tool_block!(ask_user_question, "ask_user_question.md");

#[must_use]
pub fn render_tool_block(name: &str, vars: &PromptVars) -> Option<String> {
    let body = match name {
        TOOL_TODO_WRITE => todo_write(vars),
        TOOL_WORKSPACE_MAP_READ => workspace_map_read(vars),
        TOOL_FILE_EDIT => file_edit(vars),
        TOOL_FILE_WRITE => file_write(vars),
        TOOL_FILE_READ => file_read(vars),
        TOOL_GREP => grep(vars),
        TOOL_LSP => lsp(vars),
        TOOL_ARCHITECT_HELP => architect_help(vars),
        TOOL_ASK_USER_QUESTION => ask_user_question(vars),
        _ => return None,
    };
    Some(body)
}

/// Marker header — must match [`crate::agent::state::TOOL_PROTOCOL_SNAPSHOT_MARKER`].
pub const TOOL_PROTOCOL_HEADER: &str = "## Architect tool protocols (engine)";

/// Tous les blocs protocole outil architecte (runs sans rail).
#[must_use]
pub fn tool_supplements_all_architect(vars: &PromptVars) -> String {
    tool_supplements_for_tool_names(vars, ALL_ARCHITECT_TOOL_BLOCKS)
}

/// Protocoles outil scoped à la station rail courante (context diet).
#[must_use]
pub fn tool_supplements_for_station(
    vars: &PromptVars,
    station: crate::RunStation,
) -> String {
    tool_supplements_for_tool_names(vars, station_tool_block_names(station))
}

#[must_use]
fn station_tool_block_names(station: crate::RunStation) -> &'static [&'static str] {
    use crate::RunStation;
    match station {
        RunStation::Intent | RunStation::Read => &[
            TOOL_WORKSPACE_MAP_READ,
            TOOL_FILE_READ,
            TOOL_GREP,
            TOOL_LSP,
        ],
        RunStation::Propose | RunStation::Plan => &[
            TOOL_TODO_WRITE,
            TOOL_ARCHITECT_HELP,
            TOOL_ASK_USER_QUESTION,
            TOOL_WORKSPACE_MAP_READ,
            TOOL_FILE_READ,
            TOOL_GREP,
        ],
        RunStation::Act => &[
            TOOL_FILE_EDIT,
            TOOL_FILE_WRITE,
            TOOL_TODO_WRITE,
            TOOL_FILE_READ,
        ],
        RunStation::Verify => &[TOOL_LSP, TOOL_GREP, TOOL_FILE_READ],
        RunStation::Answer => &[TOOL_TODO_WRITE],
    }
}

#[must_use]
fn tool_supplements_for_tool_names(vars: &PromptVars, names: &[&str]) -> String {
    let sections: Vec<String> = names
        .iter()
        .filter_map(|name| render_tool_block(name, vars))
        .collect();
    if sections.is_empty() {
        return String::new();
    }
    format!("{TOOL_PROTOCOL_HEADER}\n\n{}", join_sections(&sections))
}

/// Description courte pour l'API LLM (architecte) — détail procédural dans les blocs `T-*`.
#[must_use]
pub fn architect_tool_short_description(name: &str) -> Option<&'static str> {
    Some(match name {
        TOOL_TODO_WRITE => {
            "Session todo list (full replace). Shape: {\"todos\":[{\"id\",\"content\",\"status\"}]}. See system tool protocols."
        }
        TOOL_WORKSPACE_MAP_READ => {
            "Workspace structure map once before planning. Optional path_prefix. See system tool protocols."
        }
        TOOL_FILE_EDIT => "Apply targeted edits to workspace files. See system tool protocols.",
        TOOL_FILE_WRITE => "Create or replace a workspace file. See system tool protocols.",
        TOOL_FILE_READ => "Read workspace files. See system tool protocols.",
        TOOL_GREP => "Targeted grep on scope for verify. See system tool protocols.",
        TOOL_LSP => "LSP verify on scope files. See system tool protocols.",
        TOOL_ARCHITECT_HELP => {
            "Short architect playbook by topic (plan, closure, verify, …). See system tool protocols."
        }
        TOOL_ASK_USER_QUESTION => {
            "Ask user to run a manual smoke check. See system tool protocols."
        }
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn architect_tool_supplements_include_core_protocols() {
        let s = tool_supplements_all_architect(&PromptVars::default());
        assert!(s.contains("Tool protocol: `todo_write`"));
        assert!(s.contains("Tool protocol: `file_edit`"));
        assert!(s.contains("Tool protocol: `file_write`"));
        assert!(!s.contains("delegate_executor"));
        assert!(s.contains("Tool protocol: `workspace_map_read`"));
    }

    #[test]
    fn architect_tool_supplements_solo_blocks_no_delegate_mentions() {
        let s = tool_supplements_all_architect(&PromptVars::default());
        assert!(!s.contains("sub-agent"));
        assert!(!s.contains("Executor sub-agent"));
    }

    #[test]
    fn station_tool_supplements_read_smaller_than_act() {
        use crate::RunStation;
        let vars = PromptVars::default();
        let read = tool_supplements_for_station(&vars, RunStation::Read);
        let act = tool_supplements_for_station(&vars, RunStation::Act);
        assert!(read.contains("file_read"));
        assert!(!read.contains("Tool protocol: `file_edit`"));
        assert!(act.contains("Tool protocol: `file_edit`"));
        assert!(act.len() < tool_supplements_all_architect(&vars).len());
    }
}
