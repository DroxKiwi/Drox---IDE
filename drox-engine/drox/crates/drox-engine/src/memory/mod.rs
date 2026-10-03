//! Mémoire de session (persist) et DTOs mémoire longue.
//!
//! - [`runtime`] — `MemoryRuntime` / `MemoryTracker` / `persist_run`
//! - [`long`] — `ContextChunkSummaryV1` / `SessionClosureV1`

pub mod long;
pub mod runtime;

pub use long::{ContextChunkSummaryV1, SessionClosureV1};
pub use runtime::{persist_run, MemoryRuntime, MemoryTracker, PersistedRun};
