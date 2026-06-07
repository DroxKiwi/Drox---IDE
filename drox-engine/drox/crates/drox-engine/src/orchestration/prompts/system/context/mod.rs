//! Contexte run dynamique (`CTX-*`).

mod run_snapshot;

pub use run_snapshot::{
    architect_run_context_block, architect_run_context_block_compaction,
    architect_run_context_block_per_turn,
};
