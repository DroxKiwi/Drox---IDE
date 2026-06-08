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

macro_rules! tool_block_dual {
    ($fn:ident, $file:literal, $solo:literal) => {
        #[must_use]
        pub fn $fn(vars: &PromptVars) -> String {
            let raw = if vars.executor_delegation_enabled {
                include_str!($file)
            } else {
                include_str!($solo)
            };
            render_md(vars, raw)
        }
    };
}

tool_block_dual!(todo_write, "todo_write.md", "todo_write_solo.md");
tool_block_dual!(
    workspace_map_read,
    "workspace_map_read.md",
    "workspace_map_read_solo.md"
);
tool_block!(delegate_executor, "delegate_executor.md");
tool_block_dual!(file_read, "file_read.md", "file_read_solo.md");
tool_block_dual!(grep, "grep.md", "grep_solo.md");
tool_block_dual!(lsp, "lsp.md", "lsp_solo.md");
tool_block_dual!(architect_help, "architect_help.md", "architect_help_solo.md");
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
        .filter(|name| {
            vars.executor_delegation_enabled || **name != TOOL_DELEGATE_EXECUTOR
        })
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
pub fn architect_tool_short_description(
    name: &str,
    executor_delegation_enabled: bool,
) -> Option<&'static str> {
    Some(match name {
        TOOL_TODO_WRITE => {
            "Session todo list (full replace). Shape: {\"todos\":[{\"id\",\"content\",\"status\"}]}. See system tool protocols."
        }
        TOOL_WORKSPACE_MAP_READ => {
            "Workspace structure map once before planning. Optional path_prefix. See system tool protocols."
        }
        TOOL_DELEGATE_EXECUTOR if executor_delegation_enabled => {
            "Spawn limited Executor sub-agent(s) for parallel shards. Payload tasks[]. See system tool protocols."
        }
        TOOL_FILE_READ if executor_delegation_enabled => {
            "Read workspace files or executor deliverables. See system tool protocols."
        }
        TOOL_FILE_READ => "Read workspace files. See system tool protocols.",
        TOOL_GREP => "Targeted grep on scope for verify. See system tool protocols.",
        TOOL_LSP => "LSP verify on scope files. See system tool protocols.",
        TOOL_ARCHITECT_HELP if executor_delegation_enabled => {
            "Short orchestration playbook by topic (delegate, plan, closure, …). See system tool protocols."
        }
        TOOL_ARCHITECT_HELP => {
            "Short architect playbook by topic (plan, closure, sanity, …). See system tool protocols."
        }
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
    fn architect_tool_supplements_default_hides_delegate() {
        let s = tool_supplements_all_architect(&PromptVars::default());
        assert!(s.contains("Tool protocol: `todo_write`"));
        assert!(!s.contains("Tool protocol: `delegate_executor`"));
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
    fn architect_tool_supplements_include_delegate_when_enabled() {
        let mut vars = PromptVars::default();
        vars.executor_delegation_enabled = true;
        let s = tool_supplements_all_architect(&vars);
        assert!(s.contains("Tool protocol: `delegate_executor`"));
    }
}
