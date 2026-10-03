//! Outils côté moteur : hooks, orchestration parallèle, pont de progression.
//!
//! Réexportés à la racine du crate sous les anciens noms (`tool_hooks`, …)
//! pour garder `lib.rs` stable.

pub mod hooks;
pub mod orchestration;
pub mod progress;

pub use hooks::*;
pub use orchestration::{
    partition_tool_calls, ToolCallBatch, DEFAULT_MAX_PARALLEL_TOOL_CALLS,
};
pub use progress::*;
