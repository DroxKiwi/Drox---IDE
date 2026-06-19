//! Wire tool name aliases — normalize hallucinated names before pre-gate / execution.

/// Resolve LLM tool name before pre-gate / registry execution.
#[must_use]
pub fn resolve_tool_name_alias<'a>(tool_name: &'a str, _arguments: &serde_json::Value) -> &'a str {
    if tool_name == "read_file" {
        return "file_read";
    }
    tool_name
}
