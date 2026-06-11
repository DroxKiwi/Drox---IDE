//! Arborescence **system prompts** orchestration (`role_split`).
//!
//! ```text
//! system/
//!   blocks/          # un .md par morceau injectable (+ rendu `{vars}`)
//!     gates/         # discuss · edit assemblage
//!     discuss/       # suppléments discuss (read_budget)
//!     edit/          # G3 core (rail solo)
//!   gates/           # assemblage par RunSpec gate
//! ```

pub mod blocks;
pub mod context;
pub mod gates;

pub use context::{
    architect_run_context_block, architect_run_context_block_compaction,
    architect_run_context_block_per_turn,
};
