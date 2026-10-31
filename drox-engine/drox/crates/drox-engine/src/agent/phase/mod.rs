//! Marqueurs de phase `[phase: …]`, inférence hors-phase et buffer ligne.
//!
//! - [`markers`] — parse / inférence / heuristiques workspace
//! - [`buffer`] — buffer ligne pour streaming

mod buffer;
pub(crate) mod markers;

pub(crate) use buffer::PhaseLineBuffer;
pub(crate) use markers::{
    bash_is_inspect_only, counts_as_pre_plan_activity, is_workspace_exploration_tool,
    legacy_removed_phase_marker_line, parse_phase_marker, phase_for_tool, phase_for_tool_call,
    should_infer_phase_from_tool, user_blocks_plain_text,
};
