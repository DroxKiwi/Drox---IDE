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
        let params = ToolExecParams {
            run_id: self.run_id.clone(),
            call_id: Uuid::new_v4().to_string(),
            tool_name: self.name.to_string(),
            input,
            workspace: ctx.workspace_root.clone(),
            plan_mode: ctx.plan_mode,
            apply_fs_writes: ctx.apply_fs_writes,
            allow_outside_workspace: ctx.allow_outside_workspace,
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

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use drox_engine::default_tool_registry;
    use drox_tools::ToolContext;
    use serde_json::{Value, json};
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn remote_tool_sends_tool_exec_and_maps_result() {
        let (tx, mut rx) = mpsc::channel::<String>(8);
        let server = Server::new(tx);
        server.set_executable_tools(["bash".to_string()]);

        let inner = default_tool_registry().get("bash").expect("bash in registry");
        let remote = RemoteTool::wrap(server.clone(), &inner, "run_42".to_string());
        let ctx = ToolContext::new(Utf8PathBuf::from("/workspace"), true)
            .with_plan_mode(false);

        let pending = tokio::spawn(async move {
            remote
                .execute(&ctx, json!({ "command": "echo hi" }))
                .await
        });

        let line = rx.recv().await.expect("server should emit tool/exec");
        let parsed: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(parsed["method"], json!("tool/exec"));
        assert_eq!(parsed["params"]["runId"], json!("run_42"));
        assert_eq!(parsed["params"]["toolName"], json!("bash"));
        assert_eq!(parsed["params"]["workspace"], json!("/workspace"));
        assert_eq!(parsed["params"]["applyFsWrites"], json!(true));
        assert!(!parsed["params"]["planMode"].as_bool().unwrap_or(true));

        let id = parsed["id"].as_i64().expect("numeric json-rpc id");
        server
            .handle_line(&format!(
                r#"{{"jsonrpc":"2.0","id":{id},"result":{{"output":{{"stdout":"hi"}},"isError":false}}}}"#
            ))
            .await;

        let out = pending.await.expect("join").expect("tool ok");
        assert_eq!(out["stdout"], json!("hi"));
    }

    #[tokio::test]
    async fn remote_tool_surfaces_client_is_error() {
        let (tx, mut rx) = mpsc::channel::<String>(8);
        let server = Server::new(tx);
        server.set_executable_tools(["file_write".to_string()]);

        let inner = default_tool_registry()
            .get("file_write")
            .expect("file_write in registry");
        let remote = RemoteTool::wrap(server.clone(), &inner, "run_1".to_string());
        let ctx = ToolContext::new(Utf8PathBuf::from("/ws"), false).with_plan_mode(true);

        let pending = tokio::spawn(async move {
            remote
                .execute(
                    &ctx,
                    json!({ "path": "x.txt", "content": "y" }),
                )
                .await
        });

        let line = rx.recv().await.unwrap();
        let parsed: Value = serde_json::from_str(&line).unwrap();
        let id = parsed["id"].as_i64().unwrap();
        assert_eq!(parsed["params"]["planMode"], json!(true));

        server
            .handle_line(&format!(
                r#"{{"jsonrpc":"2.0","id":{id},"result":{{"output":{{"error":"plan mode"}},"isError":true}}}}"#
            ))
            .await;

        let err = pending.await.unwrap().unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("file_write"), "got: {msg}");
        assert!(msg.contains("plan mode"), "got: {msg}");
    }
}
