//! ACT segments — isolated executor slices (C7/C8).
//!
//! Design: `drox-engine/docs/1.4/1.4.0/04-SEGMENTS.md`

mod persist;
mod report;
mod runner;
mod trigger;

pub use report::SegmentReport;
pub use runner::{run_act_segment, segment_tool_result_message};
pub use trigger::{evaluate_segment_spawn, mutation_target_bytes, SegmentSpawnRequest};
