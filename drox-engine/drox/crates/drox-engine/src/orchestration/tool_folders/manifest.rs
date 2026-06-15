//! Folder → wire tool mapping (miroir `frames-v0.yaml`).

use super::types::{FOLDER_EDIT_FILE, FOLDER_READ_WORKSPACE, FOLDER_VERIFY_PROJECT};

#[must_use]
pub fn folder_wire_tools(folder: &str) -> Option<&'static [&'static str]> {
    match folder {
        FOLDER_EDIT_FILE => Some(&["file_edit", "file_write"]),
        FOLDER_READ_WORKSPACE => Some(&["file_read", "grep", "workspace_map_read"]),
        FOLDER_VERIFY_PROJECT => Some(&["lsp", "grep", "file_read", "bash"]),
        _ => None,
    }
}

#[must_use]
pub fn folder_for_station_when_collapsed(station: crate::RunStation) -> Option<&'static str> {
    use crate::RunStation;
    match station {
        RunStation::Read | RunStation::Intent => Some(FOLDER_READ_WORKSPACE),
        RunStation::Act => Some(FOLDER_EDIT_FILE),
        RunStation::Verify => Some(FOLDER_VERIFY_PROJECT),
        _ => None,
    }
}

#[must_use]
pub fn folder_one_line_description(folder: &str) -> &'static str {
    match folder {
        FOLDER_EDIT_FILE => {
            "Workspace file mutations folder. Call `{\"action\":\"describe\"}` first; wire tools unlock next turn."
        }
        FOLDER_READ_WORKSPACE => {
            "Read-only exploration folder. Call `{\"action\":\"describe\"}` first; wire tools unlock next turn."
        }
        FOLDER_VERIFY_PROJECT => {
            "Verification folder (lsp, grep, bash). Call `{\"action\":\"describe\"}` first; wire tools unlock next turn."
        }
        _ => "Tool folder — call with action describe.",
    }
}
