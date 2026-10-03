//! Marqueurs de phase `[phase: …]`, inférence hors-phase et buffer ligne.
//!
//! - [`markers`] — parse / inférence / heuristiques workspace
//! - [`buffer`] — buffer ligne pour streaming

mod buffer;
pub(crate) mod markers;

pub(crate) use buffer::PhaseLineBuffer;
pub(crate) use markers::{
    bash_is_inspect_only, is_workspace_exploration_tool, legacy_removed_phase_marker_line,
    parse_phase_marker, phase_for_tool, phase_for_tool_call, user_blocks_plain_text,
    user_prompt_suggests_workspace_analysis,
};
