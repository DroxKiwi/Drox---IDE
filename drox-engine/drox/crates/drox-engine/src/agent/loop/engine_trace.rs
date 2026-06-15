// Engine trace — capture injection context before each LLM call.

use crate::agent::state::{
    measure_context_snapshot_bytes, TOOL_PROTOCOL_SNAPSHOT_MARKER,
};
use crate::RunStation;

const ARCHITECT_RUN_SNAPSHOT_MARKER: &str = "## Architect run snapshot (engine)";
const INTERNAL_WORK_PLAN_MARKER: &str = "## Internal work plan (engine only)";
const RUN_RAIL_SNAPSHOT_MARKER: &str = "## Run rail (engine)";
const COMPACTION_CHECKPOINT_MARKER: &str = "## Context compaction checkpoint";

impl Agent {
    pub(crate) async fn trace_llm_turn_prepared(
        &self,
        iter: u32,
        messages: &[Message],
        tool_names: &[String],
        frame_id: &str,
        layers_applied: &[&str],
        rail_station: Option<RunStation>,
        internal_plan_summary: Option<(u32, Option<String>, u32)>,
    ) -> Result<(), crate::error::EngineError> {
        let Some(cfg) = self.config.engine_trace.as_ref() else {
            return Ok(());
        };

        let (architect_bytes, tool_protocol_bytes, rail_bytes) =
            measure_context_snapshot_bytes(messages);
        let boot_system_bytes = boot_system_bytes(messages);
        let system_blocks = collect_system_blocks(messages);

        let (internal_plan_step_count, internal_plan_in_progress_id, internal_plan_tools_since_touch) =
            match internal_plan_summary {
                Some((count, in_progress, touch)) if count > 0 => {
                    (Some(count), in_progress, Some(touch))
                }
                _ => (None, None, None),
            };

        let payload = drox_session::EngineTracePayload::LlmTurnPrepared(
            drox_session::LlmTurnPreparedTrace {
                iter,
                frame_id: frame_id.to_string(),
                layers_applied: layers_applied.iter().map(|s| (*s).to_string()).collect(),
                rail_station: rail_station.map(|s| s.as_str().to_string()),
                tool_names: tool_names.to_vec(),
                architect_snapshot_bytes: architect_bytes,
                tool_protocol_bytes,
                rail_snapshot_bytes: rail_bytes,
                boot_system_bytes,
                messages_count: messages.len(),
                system_blocks,
                internal_plan_step_count,
                internal_plan_in_progress_id,
                internal_plan_tools_since_touch,
            },
        );

        let record = drox_session::EngineTraceRecord::new(payload);
        cfg.sink
            .append_record(&record)
            .await
            .map_err(EngineError::Session)?;

        debug!(
            target: "drox.context",
            iter,
            frame_id,
            tools = tool_names.len(),
            messages = messages.len(),
            "engine_trace_llm_turn_prepared"
        );
        Ok(())
    }
}

fn system_text(m: &Message) -> String {
    if matches!(m.role, Role::System) {
        Content::collapse_text(&m.content)
    } else {
        String::new()
    }
}

#[must_use]
pub(crate) fn boot_system_byte_count(messages: &[Message]) -> usize {
    boot_system_bytes(messages)
}

fn boot_system_bytes(messages: &[Message]) -> usize {
    let user_idx = messages
        .iter()
        .position(|m| matches!(m.role, Role::User))
        .unwrap_or(messages.len());
    messages
        .iter()
        .take(user_idx)
        .filter(|m| matches!(m.role, Role::System))
        .map(|m| system_text(m).len())
        .sum()
}

#[must_use]
fn classify_system_block(text: &str) -> &'static str {
    if text.contains(ARCHITECT_RUN_SNAPSHOT_MARKER) {
        "ctx_run_snapshot"
    } else if text.contains(TOOL_PROTOCOL_SNAPSHOT_MARKER) {
        "tool_protocols"
    } else if text.contains(RUN_RAIL_SNAPSHOT_MARKER) {
        "rail_snapshot"
    } else if text.contains(INTERNAL_WORK_PLAN_MARKER) {
        "internal_plan"
    } else if text.contains(COMPACTION_CHECKPOINT_MARKER) {
        "compaction_checkpoint"
    } else if text.contains("Re-perspective") || text.contains("gate nudge") {
        "gate_nudge"
    } else {
        "boot_or_other"
    }
}

#[must_use]
pub(crate) fn collect_system_blocks(messages: &[Message]) -> Vec<drox_session::EngineSystemBlock> {
    let mut blocks = Vec::new();
    let mut boot_idx = 0u32;
    let mut dynamic_idx = 0u32;
    for m in messages {
        if !matches!(m.role, Role::System) {
            continue;
        }
        let text = system_text(m);
        if text.is_empty() {
            continue;
        }
        let block_id = match classify_system_block(&text) {
            "boot_or_other" => {
                boot_idx += 1;
                format!("boot_{boot_idx}")
            }
            id => {
                dynamic_idx += 1;
                format!("{id}_{dynamic_idx}")
            }
        };
        blocks.push(drox_session::EngineSystemBlock {
            block_id,
            char_count: text.len(),
            text,
        });
    }
    blocks
}

#[cfg(test)]
mod engine_trace_tests {
    use super::*;

    #[test]
    fn collect_system_blocks_classifies_snapshots() {
        let messages = vec![
            Message::system("G3 core prompt"),
            Message::system(format!(
                "{ARCHITECT_RUN_SNAPSHOT_MARKER}\n\nobjective: test"
            )),
            Message::system(format!(
                "{TOOL_PROTOCOL_SNAPSHOT_MARKER}\n\nT-file_read"
            )),
            Message::user("hello"),
        ];
        let blocks = collect_system_blocks(&messages);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].block_id, "boot_1");
        assert!(blocks[1].block_id.starts_with("ctx_run_snapshot"));
        assert!(blocks[2].block_id.starts_with("tool_protocols"));
    }
}
