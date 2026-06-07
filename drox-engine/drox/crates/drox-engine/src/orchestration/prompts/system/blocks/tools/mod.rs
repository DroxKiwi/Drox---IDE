//! Blocs protocole outil (`T-*`) — complètent le schéma function calling.

use super::{join_sections, render_md};
use crate::orchestration::prompts::vars::PromptVars;

/// Noms d'outils allowlist architecte (wire = nom tool).
pub const TOOL_TODO_WRITE: &str = "todo_write";
pub const TOOL_WORKSPACE_MAP_READ: &str = "workspace_map_read";
pub const TOOL_DELEGATE_EXECUTOR: &str = "delegate_executor";
pub const TOOL_FILE_READ: &str = "file_read";
pub const TOOL_GREP: &str = "grep";
pub const TOOL_LSP: &str = "lsp";
pub const TOOL_ARCHITECT_HELP: &str = "architect_help";
pub const TOOL_ASK_USER_QUESTION: &str = "ask_user_question";

const ALL_ARCHITECT_TOOL_BLOCKS: &[&str] = &[
    TOOL_TODO_WRITE,
    TOOL_WORKSPACE_MAP_READ,
    TOOL_DELEGATE_EXECUTOR,
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
tool_block!(delegate_executor, "delegate_executor.md");
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
        TOOL_DELEGATE_EXECUTOR => delegate_executor(vars),
        TOOL_FILE_READ => file_read(vars),
        TOOL_GREP => grep(vars),
        TOOL_LSP => lsp(vars),
        TOOL_ARCHITECT_HELP => architect_help(vars),
        TOOL_ASK_USER_QUESTION => ask_user_question(vars),
        _ => return None,
    };
    Some(body)
}

/// Outils soumis au cap « reads before delegate ».
#[must_use]
pub fn is_architect_read_tool_for_delegate_cap(tool_name: &str) -> bool {
    matches!(
        tool_name,
        "file_read" | "glob" | "grep" | "lsp" | "workspace_map_read"
    )
}

/// Tous les blocs protocole outil architecte (injectés une fois au boot run).
#[must_use]
pub fn tool_supplements_all_architect(vars: &PromptVars) -> String {
    let sections: Vec<String> = ALL_ARCHITECT_TOOL_BLOCKS
        .iter()
        .filter_map(|name| render_tool_block(name, vars))
        .collect();
    if sections.is_empty() {
        return String::new();
    }
    format!(
        "## Architect tool protocols (engine)\n\n{}",
        join_sections(&sections)
    )
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
        TOOL_DELEGATE_EXECUTOR => {
            "Spawn limited Executor sub-agent(s) for parallel shards. Payload tasks[]. See system tool protocols."
        }
        TOOL_FILE_READ => "Read workspace files or executor deliverables. See system tool protocols.",
        TOOL_GREP => "Targeted grep on scope for verify. See system tool protocols.",
        TOOL_LSP => "LSP verify on scope files. See system tool protocols.",
        TOOL_ARCHITECT_HELP => "Short orchestration playbook by topic. See system tool protocols.",
        TOOL_ASK_USER_QUESTION => {
            "Ask user; use [cycle: user_check] for sanity. See system tool protocols."
        }
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_architect_tool_supplements_include_delegate_and_todo() {
        let s = tool_supplements_all_architect(&PromptVars::default());
        assert!(s.contains("Tool protocol: `todo_write`"));
        assert!(s.contains("Tool protocol: `delegate_executor`"));
        assert!(s.contains("Tool protocol: `workspace_map_read`"));
    }
}
