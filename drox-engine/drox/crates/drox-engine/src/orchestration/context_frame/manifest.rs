//! Built-in frame manifests (v0). Spec: `docs/1.4/1.4.1/1.4.1.3/frames-v0.yaml`.

use super::types::{FrameId, FrameLayerSpec, InjectMode, LayerId};

/// Layers for [`FrameId::ArchitectIterationStart`] — order must match legacy `iteration_start`.
#[must_use]
pub fn architect_iteration_start_layers() -> &'static [FrameLayerSpec] {
    const LAYERS: [FrameLayerSpec; 5] = [
        FrameLayerSpec {
            id: LayerId::CtxRunSnapshot,
            mode: InjectMode::ReplaceMarked,
            requires_rail: false,
        },
        FrameLayerSpec {
            id: LayerId::InternalPlanSnapshot,
            mode: InjectMode::ReplaceMarked,
            requires_rail: false,
        },
        FrameLayerSpec {
            id: LayerId::ToolProtocols,
            mode: InjectMode::ReplaceMarked,
            requires_rail: false,
        },
        FrameLayerSpec {
            id: LayerId::RailTurnHooks,
            mode: InjectMode::StateOnly,
            requires_rail: true,
        },
        FrameLayerSpec {
            id: LayerId::RailSnapshot,
            mode: InjectMode::ReplaceMarked,
            requires_rail: true,
        },
    ];
    &LAYERS
}

#[must_use]
pub fn frame_id_for_iteration_start() -> FrameId {
    FrameId::ArchitectIterationStart
}

/// Layer names for `context_turn_metrics` (stable log field).
#[must_use]
pub fn architect_iteration_start_layer_names() -> &'static [&'static str] {
    &[
        "ctx_run_snapshot",
        "internal_plan_snapshot",
        "tool_protocols",
        "rail_turn_hooks",
        "rail_snapshot",
    ]
}
