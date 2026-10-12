//! Profondeur **2** — `cascade/execution/commit/`
//!
//! Canal tools : l’enfant dépose les kinds via `explore_commit` pendant la lecture.
//! Pas de tour JSON prose ici — l’assemble consomme le handle moteur.

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};
use crate::explore::cascade::CascadeStage;

/// Étape « commits progressifs » (documentaire + claims catalogue).
pub struct CommitStage;

impl CommitStage {
	pub const ID: &'static str = "explore.cascade.execution.commit";
}

pub const COMMIT_STAGE_ENTRY: PromptEntry = PromptEntry {
	id: "explore.cascade.execution.commit",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::MustText,
	audience: PromptAudience::ExploreChild,
	when: "explore_child_progressive_commit",
	topics: &["explore", "explore_commit", "cascade"],
	claims: &[
		"explore.commit=tool_channel",
		"explore.report.format=commit_kinds",
	],
	body: "During Explore execution, deposit each requested return kind with \
`explore_commit` after useful tool batches. Each body is mono-kind facts only \
(engine rejects CoT / foreign `## <kind>` paste). Engine L0 fills `paths_read` from \
tool traces when you omit a curated commit. Assemble is 0-LLM glue.",
};

impl CascadeStage for CommitStage {
	fn id() -> &'static str {
		Self::ID
	}

	fn depth() -> u8 {
		2
	}

	fn prompt_entry() -> Option<&'static PromptEntry> {
		Some(&COMMIT_STAGE_ENTRY)
	}

	fn expects() -> &'static str {
		"tool evidence + explore_commit(kind, body) calls"
	}

	fn produces() -> &'static str {
		"ExploreCommitHandle map kind → body (+ L0 paths)"
	}
}
