//! Wrapper `Tool` qui délègue l'exécution au client connecté en JSON-RPC.
//!
//! Pour chaque tool listé dans `clientCapabilities.executableTools`, le serveur
//! remplace l'implémentation locale par un [`RemoteTool`] qui envoie une
//! requête `tool/exec` au client et attend la réponse.
//!
//! Le nom, la description et le schéma JSON sont **copiés** du tool original
//! pour que le modèle voie la même signature des deux côtés.

use std::sync::Arc;

use async_trait::async_trait;
use drox_tools::{DynTool, Tool, ToolContext, ToolError};
use serde_json::Value;
use tracing::warn;
use uuid::Uuid;

use super::protocol::{ToolExecParams, ToolExecResult};
use super::server::Server;

/// Tool qui ré-émet l'appel vers le client via `tool/exec`.
pub struct RemoteTool {
    name: Arc<str>,
    description: Arc<str>,
    schema: Value,
    read_only: bool,
    server: Server,
    run_id: String,
}

impl RemoteTool {
    /// Construit un wrapper à partir d'un tool local : on récupère `name`,
    /// `description` et `input_schema`, on garde le `Server` pour pouvoir
    /// envoyer la requête `tool/exec`, et le `run_id` pour le corréler.
    #[must_use]
    pub fn wrap(server: Server, inner: &DynTool, run_id: String) -> Self {
        Self {
            name: Arc::from(inner.name()),
            description: Arc::from(inner.description()),
            schema: inner.input_schema(),
            read_only: inner.is_read_only(),
            server,
            run_id,
        }
    }
}

#[async_trait]
impl Tool for RemoteTool {
    fn name(&self) -> &str {
        &self.name
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn input_schema(&self) -> Value {
        self.schema.clone()
    }

    fn is_read_only(&self) -> bool {
        self.read_only
    }

    async fn execute(&self, ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        log_malformed_client_tool_input(self.name.as_ref(), &input);
        let params = ToolExecParams {
            run_id: self.run_id.clone(),
            call_id: Uuid::new_v4().to_string(),
            tool_name: self.name.to_string(),
            input,
            workspace: ctx.workspace_root.clone(),
            plan_mode: ctx.plan_mode,
            apply_fs_writes: ctx.apply_fs_writes,
        };

        let value = self
            .server
            .send_request("tool/exec", &params)
            .await
            .map_err(|e| {
                ToolError::remote(format!("`{}`: {} (code={})", self.name, e.message, e.code))
            })?;

        let result: ToolExecResult = serde_json::from_value(value).map_err(|e| {
            ToolError::remote(format!("`{}`: invalid `tool/exec` result: {e}", self.name))
        })?;

        if result.is_error {
            return Err(ToolError::remote(format!(
                "`{}`: client reported tool error: {}",
                self.name, result.output
            )));
        }
        Ok(result.output)
    }
}

/// Diagnostic C9 — `file_edit` with empty payload before `tool/exec` (see docs/1.4/archive/1.4.0/INVESTIGATION-file-edit.md).
fn log_malformed_client_tool_input(tool_name: &str, input: &Value) {
    if tool_name != "file_edit" {
        return;
    }
    let Some(obj) = input.as_object() else {
        warn!(
            tool = tool_name,
            input_preview = %truncate_json_preview(input),
            "file_edit: tool/exec input is not a JSON object"
        );
        return;
    };
    let has_path = obj
        .get("path")
        .or_else(|| obj.get("file_path"))
        .and_then(|v| v.as_str())
        .is_some_and(|s| !s.trim().is_empty());
    let edits = obj.get("edits").and_then(|v| v.as_array());
    let has_edits = edits.is_some_and(|a| !a.is_empty());
    if !has_path || !has_edits {
        warn!(
            tool = tool_name,
            has_path,
            edits_len = edits.map(|a| a.len()).unwrap_or(0),
            input_preview = %truncate_json_preview(input),
            "file_edit: tool/exec input missing path or non-empty edits array"
        );
    }
}

fn truncate_json_preview(value: &Value) -> String {
    let s = value.to_string();
    const MAX: usize = 400;
    if s.len() <= MAX {
        s
    } else {
        format!("{}…", &s[..MAX])
    }
}
