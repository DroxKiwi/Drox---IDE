//! Engine trace JSONL — injection context, routing, LLM turn prep (dev / dogfood).

use std::sync::Arc;

use async_trait::async_trait;
use camino::Utf8PathBuf;
use serde::{Deserialize, Serialize};
use tokio::fs::OpenOptions;
use tokio::io::AsyncWriteExt;

use crate::error::SessionError;

/// Version du schéma engine-trace (incrémenter si rupture).
pub const ENGINE_TRACE_SCHEMA_VERSION: u32 = 1;

/// Bloc system tel qu'injecté dans `messages` à un instant donné.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineSystemBlock {
    pub block_id: String,
    pub char_count: usize,
    pub text: String,
}

/// Routage orchestration (intent probe + gate chain).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRoutingTrace {
    pub architect_gate: String,
    pub start_run: String,
    pub greeting_only: bool,
    pub expects_workspace_mutation: bool,
    pub intent_source: String,
}

/// Contexte complet juste avant un appel LLM.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmTurnPreparedTrace {
    pub iter: u32,
    pub frame_id: String,
    pub layers_applied: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rail_station: Option<String>,
    pub tool_names: Vec<String>,
    pub architect_snapshot_bytes: usize,
    pub tool_protocol_bytes: usize,
    pub rail_snapshot_bytes: usize,
    pub boot_system_bytes: usize,
    pub messages_count: usize,
    pub system_blocks: Vec<EngineSystemBlock>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub internal_plan_step_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub internal_plan_in_progress_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub internal_plan_tools_since_touch: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EngineTracePayload {
    RunRouting(RunRoutingTrace),
    LlmTurnPrepared(LlmTurnPreparedTrace),
}

/// Une ligne du fichier `*.engine-trace.jsonl`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineTraceRecord {
    pub schema_version: u32,
    /// Horodatage ISO 8601 (RFC3339).
    pub timestamp: String,
    #[serde(flatten)]
    pub payload: EngineTracePayload,
}

impl EngineTraceRecord {
    #[must_use]
    pub fn new(payload: EngineTracePayload) -> Self {
        Self {
            schema_version: ENGINE_TRACE_SCHEMA_VERSION,
            timestamp: chrono::Utc::now().to_rfc3339(),
            payload,
        }
    }
}

/// Configuration passée au moteur pour l'engine-trace (injection / routing).
#[derive(Clone)]
pub struct EngineTraceSessionConfig {
    pub sink: Arc<dyn EngineTraceSink>,
}

impl std::fmt::Debug for EngineTraceSessionConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EngineTraceSessionConfig")
            .finish_non_exhaustive()
    }
}

/// Écrit des lignes JSONL engine-trace.
#[async_trait]
pub trait EngineTraceSink: Send + Sync {
    async fn append_record(&self, record: &EngineTraceRecord) -> Result<(), SessionError>;
}

/// Sink fichier `*.engine-trace.jsonl`.
pub struct JsonlEngineTraceSink {
    path: Utf8PathBuf,
}

impl JsonlEngineTraceSink {
    #[must_use]
    pub fn new(path: Utf8PathBuf) -> Self {
        Self { path }
    }

    #[must_use]
    pub fn arc(path: Utf8PathBuf) -> Arc<Self> {
        Arc::new(Self::new(path))
    }

    #[must_use]
    pub fn path(&self) -> &camino::Utf8Path {
        &self.path
    }
}

#[async_trait]
impl EngineTraceSink for JsonlEngineTraceSink {
    async fn append_record(&self, record: &EngineTraceRecord) -> Result<(), SessionError> {
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent.as_std_path()).await?;
        }
        let mut line = serde_json::to_string(record)?;
        line.push('\n');
        let mut f = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.path.as_std_path())
            .await?;
        f.write_all(line.as_bytes()).await?;
        f.flush().await?;
        Ok(())
    }
}

/// Append une ligne sans sink partagé (orchestration boot).
pub async fn append_engine_trace_record(
    path: &camino::Utf8Path,
    record: &EngineTraceRecord,
) -> Result<(), SessionError> {
    JsonlEngineTraceSink::new(path.to_path_buf())
        .append_record(record)
        .await
}

/// Lit tout le engine-trace (lignes invalides ignorées).
pub async fn read_engine_trace(
    path: &camino::Utf8Path,
) -> Result<Vec<EngineTraceRecord>, SessionError> {
    let bytes = tokio::fs::read(path.as_std_path()).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            SessionError::NotFound(path.to_string())
        } else {
            e.into()
        }
    })?;
    let text = String::from_utf8_lossy(&bytes);
    let mut out = Vec::new();
    for (lineno, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<EngineTraceRecord>(line) {
            Ok(rec) if rec.schema_version == ENGINE_TRACE_SCHEMA_VERSION => out.push(rec),
            Ok(rec) => {
                tracing::warn!(
                    line = lineno + 1,
                    schema = rec.schema_version,
                    "skipping engine-trace line with unsupported schema_version"
                );
            }
            Err(e) => {
                tracing::warn!(line = lineno + 1, %e, "skipping malformed engine-trace line");
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn append_and_roundtrip_routing() {
        let dir = tempdir().unwrap();
        let p = Utf8PathBuf::from_path_buf(dir.path().join("t.engine-trace.jsonl")).unwrap();
        let sink = JsonlEngineTraceSink::new(p.clone());
        let rec = EngineTraceRecord::new(EngineTracePayload::RunRouting(RunRoutingTrace {
            architect_gate: "architect_edit".into(),
            start_run: "edit".into(),
            greeting_only: false,
            expects_workspace_mutation: true,
            intent_source: "llm".into(),
        }));
        sink.append_record(&rec).await.unwrap();
        let loaded = read_engine_trace(&p).await.unwrap();
        assert_eq!(loaded.len(), 1);
        assert!(matches!(
            loaded[0].payload,
            EngineTracePayload::RunRouting(_)
        ));
    }
}
