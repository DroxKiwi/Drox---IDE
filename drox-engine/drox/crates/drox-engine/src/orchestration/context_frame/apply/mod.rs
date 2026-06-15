//! Frame apply handlers — one submodule per trigger.

mod gate_nudge;
mod iteration;

pub use gate_nudge::append_gate_nudge;
pub use iteration::{apply_architect_iteration_start, ArchitectIterationInput};
