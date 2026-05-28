//! Handler `workspace.reset` — purge données Drox locales au workspace.

use drox_engine::reset_workspace_drox_data;
use serde::Serialize;
use serde_json::Value;

use crate::jsonrpc::handlers::common::{decode_required, resolve_workspace};
use crate::jsonrpc::{ENGINE_ERROR, RpcError};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResetResultDto {
    pub sessions_files_removed: usize,
    pub workspace_map_removed: bool,
    pub long_memory_cleared: bool,
    pub memory_sessions_files_removed: usize,
    pub attachments_cleared: bool,
    pub course_cycles_cleared: bool,
    pub agent_output_cleared: bool,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResetParams {
    pub workspace: camino::Utf8PathBuf,
}

pub async fn workspace_reset(params: Option<Value>) -> Result<Value, RpcError> {
    let p: WorkspaceResetParams = decode_required(
        params,
        "workspace.reset requires { workspace }",
    )?;
    let workspace = resolve_workspace(Some(p.workspace))?;
    let stats = reset_workspace_drox_data(&workspace)
        .await
        .map_err(|e| RpcError::new(ENGINE_ERROR, format!("workspace.reset failed: {e}")))?;
    let dto = WorkspaceResetResultDto {
        sessions_files_removed: stats.sessions_files_removed,
        workspace_map_removed: stats.workspace_map_removed,
        long_memory_cleared: stats.long_memory_cleared,
        memory_sessions_files_removed: stats.memory_sessions_files_removed,
        attachments_cleared: stats.attachments_cleared,
        course_cycles_cleared: stats.course_cycles_cleared,
        agent_output_cleared: stats.agent_output_cleared,
    };
    serde_json::to_value(dto).map_err(|e| RpcError::new(ENGINE_ERROR, e.to_string()))
}
