//! Spill / stub des gros `tool_result` (parent) — concentration **C1** + **F1/F2**.
//!
//! ## Rôles
//!
//! | Module | Rôle |
//! |--------|------|
//! | [`thresholds`] | Seuils spill (read-heavy vs Explore delivery) |
//! | [`slim_task`] | Outcome `task` borné pour le LLM (C2) |
//! | [`format`] | Émission post-outil → inline ou spill+stub |
//! | [`hot_snip`] | Snip chaud hors fenêtre (F2 : préserver merge Explore) |
//!
//! ## Seuils
//!
//! - Lecture lourde (`file_read`, `grep`, …) : **8 KiB**.
//! - Divers (`bash`, …) : **24 KiB**.
//! - Livraison Explore (`task`, `explore_artifact_read`) — **F1** : **64 KiB**
//!   (ne pas annuler le merge / kind qu’Explore vient de livrer).

mod format;
mod hot_snip;
mod slim_task;
mod thresholds;

#[cfg(test)]
mod tests;

pub(crate) use format::format_tool_result_for_llm;
pub(crate) use hot_snip::stub_for_hot_snip;

/// Seuils exposés pour asserts tests / `loop_tests`.
#[cfg(test)]
pub(crate) use thresholds::{
	spill_threshold_for_tool, EXPLORE_DELIVERY_SPILL_THRESHOLD_BYTES,
	READ_HEAVY_SPILL_THRESHOLD_BYTES, TOOL_RESULT_SPILL_THRESHOLD_BYTES,
};
