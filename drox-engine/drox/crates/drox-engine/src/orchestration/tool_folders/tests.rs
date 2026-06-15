//! Tool folders — unit tests.

use serde_json::json;

use crate::agent::ArchitectRunState;
use crate::orchestration::tool_folders::{
    apply_tool_folder_specs, resolve_tool_name_alias, try_execute_virtual_tool,
    FOLDER_EDIT_FILE,
};
use crate::orchestration::EngineTuning;
use crate::RunStation;
use drox_llm::ToolSpec;

#[test]
fn read_file_alias_maps_to_file_read() {
    assert_eq!(
        resolve_tool_name_alias("read_file", &json!({"path": "a.ts"})),
        "file_read"
    );
}

#[test]
fn read_file_describe_stays_virtual() {
    assert_eq!(
        resolve_tool_name_alias("read_file", &json!({"action": "describe"})),
        "read_file"
    );
}

#[test]
fn act_collapsed_specs_hide_file_edit_until_describe() {
    let tuning = EngineTuning::default();
    let st = ArchitectRunState::new();
    let specs = vec![
        ToolSpec {
            name: "file_edit".into(),
            description: String::new(),
            parameters: json!({}),
        },
        ToolSpec {
            name: "file_write".into(),
            description: String::new(),
            parameters: json!({}),
        },
    ];
    let out = apply_tool_folder_specs(specs, RunStation::Act, &tuning, &st);
    assert!(out.iter().any(|s| s.name == FOLDER_EDIT_FILE));
    assert!(!out.iter().any(|s| s.name == "file_edit"));
}

#[test]
fn edit_file_describe_expands_folder() {
    let tuning = EngineTuning::default();
    let mut st = ArchitectRunState::new();
    let value = try_execute_virtual_tool(
        &tuning,
        Some(RunStation::Act),
        &mut st,
        FOLDER_EDIT_FILE,
        &json!({"action": "describe"}),
    )
    .expect("ok");
    assert!(value.get("expanded").and_then(|v| v.as_bool()).unwrap_or(false));
    assert!(st.is_tool_folder_expanded(FOLDER_EDIT_FILE));
}
