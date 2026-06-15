//! Wire name aliases — hallucinated tool names → real handlers.

/// Resolve LLM tool name before pre-gate / registry execution.
#[must_use]
pub fn resolve_tool_name_alias<'a>(tool_name: &'a str, arguments: &serde_json::Value) -> &'a str {
    if tool_name == "read_file" && !is_folder_describe(arguments) {
        return "file_read";
    }
    tool_name
}

#[must_use]
pub fn is_folder_describe(arguments: &serde_json::Value) -> bool {
    arguments
        .get("action")
        .and_then(|v| v.as_str())
        .is_some_and(|a| a.eq_ignore_ascii_case("describe"))
}
