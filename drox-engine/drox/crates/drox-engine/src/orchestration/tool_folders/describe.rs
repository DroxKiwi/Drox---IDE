//! Folder `describe` responses — option A two-turn expansion.

use crate::orchestration::architect_tool_short_description;

use super::manifest::folder_wire_tools;

#[must_use]
pub fn describe_folder_response(folder: &str) -> String {
    let Some(wire_tools) = folder_wire_tools(folder) else {
        return format!("Unknown tool folder `{folder}`.");
    };
    let mut out = format!("## {folder} folder\n\nSpecialized wire tools available **next turn**:\n");
    for name in wire_tools {
        let hint = architect_tool_short_description(name).unwrap_or("See system tool protocols.");
        out.push_str(&format!("\n- **`{name}`** — {hint}"));
    }
    out.push_str(
        "\n\nCall the wire tool directly on your next turn (not another describe).",
    );
    out
}
