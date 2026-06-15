//! Tool folders — virtual LLM surface, wire expansion, internal plan hook.

mod aliases;
mod describe;
mod folder_exec;
mod gate;
mod manifest;
mod protocols;
mod specs;
mod types;

pub use aliases::{is_folder_describe, resolve_tool_name_alias};
pub use folder_exec::try_execute_virtual_tool;
pub use gate::{is_virtual_folder_tool, tool_folder_pre_gate};
pub use manifest::{folder_for_station_when_collapsed, folder_one_line_description, folder_wire_tools};
pub use protocols::tool_supplements_for_station_folders;
pub use specs::{apply_tool_folder_specs, internal_plan_write_spec, TOOL_INTERNAL_PLAN_WRITE};
pub use types::{FOLDER_EDIT_FILE, FOLDER_READ_WORKSPACE, FOLDER_VERIFY_PROJECT};

#[cfg(test)]
mod tests;
