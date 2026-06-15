//! `architect.*.gate_nudge` — append system nudges with observability.

use drox_types::Message;

use super::super::types::{FrameId, NudgeId};

/// Append a gate nudge at end of history (parity with legacy `Message::system` append).
pub fn append_gate_nudge(
    messages: &mut Vec<Message>,
    nudge_id: NudgeId,
    text: impl Into<String>,
) {
    let body = text.into();
    tracing::debug!(
        target: "drox.context",
        frame_id = FrameId::ArchitectGateNudge.as_str(),
        nudge_id = nudge_id.as_str(),
        bytes = body.len(),
        "context_frame_gate_nudge"
    );
    messages.push(Message::system(body));
}
