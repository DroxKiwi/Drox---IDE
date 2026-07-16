//! Tool `session_compact` — compaction LLM du transcript JSONL de la session.
//!
//! Même effet que la commande webview `/compact` (`session.compact` JSON-RPC).
//! L’implémentation **locale** refuse : le client VS Code exécute l’appel via
//! `tool/exec` (fichier `.jsonl` + réglages LLM côté IDE).

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;

use crate::context::ToolContext;
use crate::error::ToolError;
use crate::tool::Tool;

/// Arguments optionnels pour `session_compact`.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct SessionCompactInput {
    /// Motif affiché dans les journaux / permissions (optional).
    #[serde(default)]
    pub reason: Option<String>,
}

/// Tool `session_compact` (stub local).
pub struct SessionCompactTool;

#[async_trait]
impl Tool for SessionCompactTool {
    fn name(&self) -> &str {
        "session_compact"
    }

    fn description(&self) -> &str {
        "Forces an **LLM compaction** on the current session JSONL transcript \
         (`session.compact`) — same pipeline as the `/compact` command. \
         Reduces persisted history and returns a structured summary (objective, \
         files, markdown body). **Execution**: IDE client (Drox extension); \
         unavailable outside delegation. Prefer a moment when the transcript is not \
         under heavy concurrent writes. Format: `{ \"reason\"?: \"…\" }`."
    }

    fn input_schema(&self) -> Value {
        serde_json::to_value(schemars::schema_for!(SessionCompactInput)).unwrap_or(Value::Null)
    }

    async fn execute(&self, _ctx: &ToolContext, input: Value) -> Result<Value, ToolError> {
        let SessionCompactInput { reason: _reason } = serde_json::from_value(input).map_err(
            |e| {
                ToolError::invalid_args(format!(
                    "session_compact: invalid JSON ({e}). Expected: {{ \"reason\"?: \"…\" }}."
                ))
            },
        )?;
        Err(ToolError::invalid_args(
            "session_compact: only available when the IDE client executes this tool \
             via tool/exec (Drox VS Code extension).",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use serde_json::json;

    #[tokio::test]
    async fn local_stub_errors() {
        let t = SessionCompactTool;
        let r = t
            .execute(
                &ToolContext::new(Utf8PathBuf::from("/tmp"), false),
                json!({}),
            )
            .await;
        assert!(r.is_err());
    }
}
