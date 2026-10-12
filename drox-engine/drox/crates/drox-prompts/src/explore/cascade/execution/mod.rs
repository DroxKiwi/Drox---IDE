//! Profondeur **1** — `cascade/execution/`
//!
//! Gather evidence with tools + progressive [`commit`] via `explore_commit`.
//! Instancie [`EXPLORE_SYSTEM_ENTRY`](crate::explore::EXPLORE_SYSTEM_ENTRY).

pub mod commit;

use crate::entry::PromptEntry;
use crate::explore::cascade::CascadeStage;
use crate::explore::prompts::EXPLORE_SYSTEM_ENTRY;

pub use commit::{CommitStage, COMMIT_STAGE_ENTRY};

/// Étape racine : exécution Explore (tools on).
pub struct ExecutionStage;

impl ExecutionStage {
	pub const ID: &'static str = "explore.cascade.execution";
}

impl CascadeStage for ExecutionStage {
	fn id() -> &'static str {
		Self::ID
	}

	fn depth() -> u8 {
		1
	}

	fn prompt_entry() -> Option<&'static PromptEntry> {
		Some(&EXPLORE_SYSTEM_ENTRY)
	}

	fn expects() -> &'static str {
		"task description (capped) + return_kinds contract + optional must_return"
	}

	fn produces() -> &'static str {
		"tool evidence + explore_commit kinds (L0 paths_read auto) then [phase: answering]"
	}
}
