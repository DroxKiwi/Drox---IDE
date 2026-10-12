//! Profondeur **2** — `cascade/materialize/assemble/`
//!
//! **Pas de LLM.** Colle les sorties `fill/*` → artefacts `.md` + manifest + index.
//! Sortie juste : kinds manquants → `kinds_incomplete` (pas d’abort Explore).

use crate::entry::PromptEntry;
use crate::explore::cascade::CascadeStage;

/// Glue moteur post-fill.
pub struct AssembleStage;

impl AssembleStage {
	pub const ID: &'static str = "explore.cascade.assemble";
}

impl CascadeStage for AssembleStage {
	fn id() -> &'static str {
		Self::ID
	}

	fn depth() -> u8 {
		2
	}

	fn prompt_entry() -> Option<&'static PromptEntry> {
		None
	}

	fn expects() -> &'static str {
		"map kind → string body (from fill stages); missing keys allowed"
	}

	fn produces() -> &'static str {
		"<kind>.md + manifest.json + index.jsonl (honest incomplete stubs; no conclusion.md)"
	}
}
