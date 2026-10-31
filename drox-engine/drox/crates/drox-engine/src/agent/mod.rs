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
//!
//! ## Carte des sous-modules
//!
//! | Module | Rôle |
//! |--------|------|
//! | [`config`] | `AgentConfig` (prompt, iterations, permissions, mémoire…) |
//! | [`run`] | Struct [`Agent`], API publique, boucle, cycle de vie |
//! | [`phase`] | Marqueurs `[phase:…]`, buffer streaming, inférence hors-phase |
//! | [`gates`] | Filets todo / mutation code / professeur / `session_end` |
//! | [`nudges`] | Prompts système de relance (done, testing, intent-write…) |
//! | [`hallucination`] | Détection des tool_calls qui miment `[phase:…]` |
//! | [`loop_detect`] | Anti-boucle d'empreintes (texte + tool_calls) |
//! | [`loop_close`] | ForceConclude / SyntheticDone (clôture run propre) |
//! | [`consume_llm_stream`] | Consommation du stream LLM → événements agent |
//! | [`dispatch`] | Erreurs outil, confirmation user, specs exposées au LLM |
//! | [`tool_result_spill`] | Spill/stub gros tool results (C1 · F1/F2 Explore delivery) |

pub mod config;
pub mod context_load;
pub mod dispatch;
pub mod tool_result_spill;
pub mod gates;
pub mod hallucination;
pub mod loop_close;
pub mod loop_detect;
pub mod nudges;
pub mod phase;
pub mod run;
pub mod history_transport;
pub mod session_intent;
pub mod situation;
pub mod consume_llm_stream;
mod todo_text_salvage;

#[cfg(test)]
mod tests;

pub use config::{normalize_engine_profile, AgentConfig, EngineProfile};
pub use run::{Agent, AgentStream};

// Réexports minimaux pour `tests` (`use super::*`).
#[cfg(test)]
pub(crate) use gates::{record_counts_as_code_mutation, requires_todo_write_gate};
#[cfg(test)]
pub(crate) use hallucination::is_hallucinated_phase_tool_call;
#[cfg(test)]
pub(crate) use loop_detect::{
    normalize_bash_command_for_loop, LoopDecision, LoopDetector, PendingToolCall, TurnOutcome,
};
#[cfg(test)]
pub(crate) use nudges::step_by_step_todo_nudge;
#[cfg(test)]
pub(crate) use phase::{
    legacy_removed_phase_marker_line, parse_phase_marker, phase_for_tool, PhaseLineBuffer,
};
#[cfg(test)]
pub(crate) use consume_llm_stream::consume_stream;
