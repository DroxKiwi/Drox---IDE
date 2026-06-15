//! Context Frame — déclaration et application des injections system par tour.
//!
//! Spec : `docs/1.4/1.4.1/1.4.1.3/` · Phase 2 = parité avec l'inline `iteration_start`.

mod apply;
mod manifest;
mod types;

pub use apply::{append_gate_nudge, apply_architect_iteration_start, ArchitectIterationInput};
pub use manifest::{
    architect_iteration_start_layer_names, architect_iteration_start_layers,
    frame_id_for_iteration_start,
};
pub use types::{FrameId, FrameLayerSpec, FrameTrigger, InjectMode, LayerId, NudgeId};

#[cfg(test)]
mod tests;
