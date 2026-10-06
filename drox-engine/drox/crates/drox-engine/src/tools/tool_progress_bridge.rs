//! Pont `ToolProgressSink` → `AgentEvent::ToolProgress` (+ enfants Explore).

use std::sync::Arc;

use drox_tools::{ShellProgressUpdate, ToolProgressSink};
use drox_types::ToolUseId;
use serde_json::Value;
use tokio::sync::mpsc;

use crate::event::AgentEvent;
use crate::EngineError;

/// Forwarder branché sur le `ToolContext` pendant un tool call.
#[derive(Clone)]
pub struct ToolProgressBridge {
    tx: mpsc::Sender<Result<AgentEvent, EngineError>>,
    id: ToolUseId,
    name: String,
}

impl ToolProgressBridge {
    #[must_use]
    pub fn new(
        tx: mpsc::Sender<Result<AgentEvent, EngineError>>,
        id: ToolUseId,
        name: impl Into<String>,
    ) -> Arc<Self> {
        Arc::new(Self {
            tx,
            id,
            name: name.into(),
        })
    }
}

fn child_tool_id(raw: &str) -> ToolUseId {
	let trimmed = raw.trim();
	if trimmed.is_empty() {
		ToolUseId::new()
	} else {
		ToolUseId::from_string(trimmed.to_string())
	}
}

impl ToolProgressSink for ToolProgressBridge {
    fn report_shell(&self, update: ShellProgressUpdate) {
        let _ = self.tx.try_send(Ok(AgentEvent::ToolProgress {
            id: self.id.clone(),
            name: self.name.clone(),
            output: update.output,
            full_output: update.full_output,
            elapsed_ms: update.elapsed_ms,
            total_lines: update.total_lines,
        }));
    }

    fn report_child_tool_start(&self, id: &str, name: &str, arguments: &Value) {
        let _ = self.tx.try_send(Ok(AgentEvent::SubagentChildToolStart {
            parent_id: self.id.clone(),
            id: child_tool_id(id),
            name: name.to_string(),
            arguments: arguments.clone(),
        }));
    }

    fn report_child_tool_finish(&self, id: &str, output: &Value, is_error: bool) {
        let _ = self.tx.try_send(Ok(AgentEvent::SubagentChildToolFinish {
            parent_id: self.id.clone(),
            id: child_tool_id(id),
            output: output.clone(),
            is_error,
        }));
    }

    fn report_child_text_delta(&self, text: &str) {
        if text.is_empty() {
            return;
        }
        let _ = self.tx.try_send(Ok(AgentEvent::SubagentChildTextDelta {
            parent_id: self.id.clone(),
            text: text.to_string(),
        }));
    }
}
