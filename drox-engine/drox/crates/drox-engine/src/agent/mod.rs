//! Boucle agent : orchestre `LlmClient` ↔ `ToolRegistry`.
//!
//! Sprint A (refonte 2026-05-13). Le moteur ne s'appuie plus sur des
//! heuristiques de détection de « réponses paresseuses » (regex de phrases
//! type « je vais explorer… »). À la place :
//!
//! 1. Le modèle peut annoncer des transitions via des marqueurs ligne
//!    `[phase: nom]` (`reading`, `planning`, `acting`, `verifying`,
//!    `clarifying`, `answering`, `done`). Les anciens marqueurs `reasoning` et
//!    `next-move` sont ignorés (ligne retirée sans effet). Voir
//!    [`crate::event::Phase`].
//! 2. `consume_stream` parse ces marqueurs ligne par ligne, les **retire** du
//!    texte assistant, et émet `AgentEvent::PhaseEnter`.
//! 3. La boucle agent applique **une seule règle de continuation** : si un
//!    tour assistant se termine **sans `tool_call`** et **sans** avoir signé
//!    `[phase: done]`, on injecte un rappel `system` et on relance l'LLM
//!    **une fois**. Si la relance reste muette, on accepte la réponse pour
//!    ne pas tourner indéfiniment ; sinon la borne dure reste
//!    `max_iterations`.

mod core;
mod helpers;
mod rail;
mod state;
mod edit_start;
mod diagnostic_target;
mod gates;
mod r#loop;
mod nudges;
mod phases;
mod stream;
mod final_answer_guard;

#[cfg(test)]
mod tests;

pub(crate) use phases::{parse_phase_marker, strip_phase_protocol_lines};
pub use state::{ArchitectRunState, ARCHITECT_RUN_SNAPSHOT_MARKER};
pub use rail::RunStation;
pub use edit_start::{apply_architect_edit_start, ArchitectEditStartOutcome};
pub use diagnostic_target::DiagnosticTarget;
pub use core::{Agent, AgentConfig, AgentStream};

pub(crate) use state::internal_plan::{
    has_internal_plan, ingest_internal_plan,
    internal_plan_shape_guard, internal_plan_trace_summary, record_internal_plan_tool_touch,
    stale_internal_plan_nudge,
};
pub(crate) use rail::{on_turn_start, refresh_snapshot, OpenWorkCounts};
pub(crate) use state::{
    internal_plan_snapshot_for_station, log_context_turn_metrics, refresh_architect_run_snapshot,
    refresh_internal_plan_snapshot, refresh_tool_protocol_snapshot,
};

#[cfg(test)]
pub(crate) use rail::is_run_rail_snapshot_message;
#[cfg(test)]
pub(crate) use state::{
    is_architect_run_snapshot_message, is_tool_protocol_snapshot_message,
};

pub(crate) use helpers::{
    build_tool_specs, confirm_with_user, first_user_text, last_user_text,
    mirror_workspace_map_from_tool, push_tool_error_tracked,
};

use serde_json::Value;

/// Corps du message `role = tool` renvoyé au LLM après exécution réussie.
pub(crate) fn format_tool_result_for_llm(tool_name: &str, value: &Value) -> String {
    let serialized = serde_json::to_string(value).unwrap_or_default();
    format!(
        "[drox: tool result \"{tool_name}\" — JSON below; this is not a user message]\n{serialized}",
    )
}
