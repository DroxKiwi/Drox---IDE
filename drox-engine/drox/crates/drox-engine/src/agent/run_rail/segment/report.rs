//! Segment report JSON (C8) — internal contract between segment and parent.

use serde::{Deserialize, Serialize};

/// Minimal segment outcome (see `docs/1.4/1.4.0/04-SEGMENTS.md`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SegmentReport {
    pub task_id: String,
    pub status: String,
    pub paths_touched: Vec<String>,
    pub summary: String,
    #[serde(default)]
    pub evidence: String,
}

impl SegmentReport {
    #[must_use]
    pub fn tool_result_json(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or_else(|_| serde_json::json!({}))
    }
}
