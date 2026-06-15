//! Folder-level protocol text (replaces full `T-*` blocks when collapsed).

use crate::agent::{has_internal_plan, ArchitectRunState};
use crate::orchestration::prompts::system::blocks::tools::{
    render_tool_block, TOOL_FILE_READ, TOOL_PROTOCOL_HEADER, TOOL_TODO_WRITE,
};
use crate::orchestration::prompts::vars::PromptVars;
use crate::orchestration::EngineTuning;
use crate::RunStation;

use super::manifest::{folder_one_line_description, folder_wire_tools};
use super::types::{FOLDER_EDIT_FILE, FOLDER_READ_WORKSPACE, FOLDER_VERIFY_PROJECT};

/// Station protocols with optional folder collapse (context diet ACT/READ/VERIFY).
#[must_use]
pub fn tool_supplements_for_station_folders(
    vars: &PromptVars,
    station: RunStation,
    tuning: &EngineTuning,
    state: &ArchitectRunState,
) -> String {
    let body = if !(tuning.tool_folders_enabled && tuning.run_rail_enabled) {
        crate::orchestration::tool_supplements_for_station(vars, station)
    } else {
        match station {
            RunStation::Act => act_protocols(vars, state),
            RunStation::Read | RunStation::Intent => read_protocols(vars, state),
            RunStation::Verify => verify_protocols(vars, state),
            RunStation::Plan | RunStation::Propose => plan_protocols(vars, tuning),
            _ => crate::orchestration::tool_supplements_for_station(vars, station),
        }
    };
    prepend_internal_plan_protocol_when_required(state, body)
}

#[must_use]
fn prepend_internal_plan_protocol_when_required(
    state: &ArchitectRunState,
    body: String,
) -> String {
    if has_internal_plan(state) {
        return body;
    }
    let section = internal_plan_protocol_section();
    if body.trim().is_empty() {
        return format!("{TOOL_PROTOCOL_HEADER}\n\n{section}");
    }
    if body.contains("internal_plan_write") {
        return body;
    }
    let rest = body
        .strip_prefix(TOOL_PROTOCOL_HEADER)
        .map(str::trim_start)
        .filter(|s| !s.is_empty())
        .unwrap_or(body.as_str());
    format!("{TOOL_PROTOCOL_HEADER}\n\n{section}\n\n---\n\n{rest}")
}

fn act_protocols(vars: &PromptVars, state: &ArchitectRunState) -> String {
    let mut sections = Vec::new();
    if state.is_tool_folder_expanded(FOLDER_EDIT_FILE) {
        for name in folder_wire_tools(FOLDER_EDIT_FILE).unwrap_or(&[]) {
            if let Some(block) = render_tool_block(name, vars) {
                sections.push(block);
            }
        }
    } else {
        sections.push(folder_protocol_section(FOLDER_EDIT_FILE));
    }
    for name in [TOOL_TODO_WRITE, TOOL_FILE_READ] {
        if let Some(block) = render_tool_block(name, vars) {
            sections.push(block);
        }
    }
    join_protocol_sections(&sections)
}

fn read_protocols(vars: &PromptVars, state: &ArchitectRunState) -> String {
    let mut sections = Vec::new();
    if state.is_tool_folder_expanded(FOLDER_READ_WORKSPACE) {
        for name in folder_wire_tools(FOLDER_READ_WORKSPACE).unwrap_or(&[]) {
            if let Some(block) = render_tool_block(name, vars) {
                sections.push(block);
            }
        }
    } else {
        sections.push(folder_protocol_section(FOLDER_READ_WORKSPACE));
    }
    if let Some(lsp) = render_tool_block("lsp", vars) {
        sections.push(lsp);
    }
    join_protocol_sections(&sections)
}

fn verify_protocols(vars: &PromptVars, state: &ArchitectRunState) -> String {
    let mut sections = Vec::new();
    if state.is_tool_folder_expanded(FOLDER_VERIFY_PROJECT) {
        for name in folder_wire_tools(FOLDER_VERIFY_PROJECT).unwrap_or(&[]) {
            if let Some(block) = render_tool_block(name, vars) {
                sections.push(block);
            }
        }
    } else {
        sections.push(folder_protocol_section(FOLDER_VERIFY_PROJECT));
    }
    if let Some(todo) = render_tool_block(TOOL_TODO_WRITE, vars) {
        sections.push(todo);
    }
    join_protocol_sections(&sections)
}

fn plan_protocols(vars: &PromptVars, tuning: &EngineTuning) -> String {
    let names = [
        TOOL_TODO_WRITE,
        "architect_help",
        "ask_user_question",
        "workspace_map_read",
        TOOL_FILE_READ,
        "grep",
    ];
    let mut sections: Vec<String> = names
        .iter()
        .filter_map(|n| render_tool_block(n, vars))
        .collect();
    if tuning.tool_folders_enabled {
        sections.push(internal_plan_protocol_section());
    }
    join_protocol_sections(&sections)
}

#[must_use]
fn folder_protocol_section(folder: &str) -> String {
    format!(
        "### Tool folder: `{folder}`\n{}\n",
        folder_one_line_description(folder)
    )
}

#[must_use]
fn internal_plan_protocol_section() -> String {
    include_str!("../prompts/system/blocks/plan/internal_plan_write.md").to_string()
}

#[must_use]
fn join_protocol_sections(sections: &[String]) -> String {
    if sections.is_empty() {
        return String::new();
    }
    format!("{TOOL_PROTOCOL_HEADER}\n\n{}", sections.join("\n\n---\n\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::ArchitectRunState;

    #[test]
    fn act_collapsed_smaller_than_expanded() {
        let vars = PromptVars::default();
        let mut st = ArchitectRunState::new();
        let collapsed = act_protocols(&vars, &st);
        st.expand_tool_folder(FOLDER_EDIT_FILE);
        let expanded = act_protocols(&vars, &st);
        assert!(collapsed.contains("Tool folder: `edit_file`"));
        assert!(!collapsed.contains("Tool protocol: `file_edit`"));
        assert!(expanded.contains("Tool protocol: `file_edit`"));
        assert!(expanded.len() > collapsed.len());
    }
}
