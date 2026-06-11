use drox_tools::ToolContext;
use serde_json::Value;
pub(crate) async fn mirror_workspace_map_from_tool(
    ctx: &ToolContext,
    tool_name: &str,
    output: &Value,
) {
    let Some(store) = ctx.workspace_map.as_ref() else {
        return;
    };
    match tool_name {
        "glob" => store.ingest_glob(output),
        "file_read" => store.ingest_file_read(output),
        "lsp" => store.ingest_lsp(output),
        _ => return,
    }
    store.save_if_dirty().await;
}
