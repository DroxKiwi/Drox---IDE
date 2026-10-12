//! Profondeur **2** — `cascade/materialize/fill/`
//!
//! Un sous-dossier par kind = un micro-tour LLM (template JSON à une clé).
//! N’exécuter que les kinds demandés par le parent (`return_kinds`).

pub mod code_snippets;
pub mod file_summaries;
pub mod gaps;
pub mod key_symbols;
pub mod paths_read;
pub mod structure_map;

pub use code_snippets::CodeSnippetsFill;
pub use file_summaries::FileSummariesFill;
pub use gaps::GapsFill;
pub use key_symbols::KeySymbolsFill;
pub use paths_read::PathsReadFill;
pub use structure_map::StructureMapFill;

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};
use crate::explore::cascade::CascadeStage;

/// Prompt system partagé pour tout fill-kind (une clé JSON).
pub const FILL_KIND_SYSTEM: &str = "\
You fill **one** Explore return kind for the parent agent.\n\
Output a **single JSON object** whose only content keys are the requested kind \
and optional `recommended_next_parent_steps`.\n\
First character `{`. No markdown fences, no preamble, no chain-of-thought.\n\
Copy facts from the evidence notes only — do not invent paths.";

pub const FILL_KIND_SYSTEM_ENTRY: PromptEntry = PromptEntry {
	id: "explore.cascade.fill.system",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::MustText,
	audience: PromptAudience::ExploreChild,
	when: "explore_cascade_fill_kind",
	topics: &["explore", "report", "cascade"],
	claims: &[
		"explore.cascade.fill.format=json_one_kind",
		"explore.report.dump_transcript=forbidden",
	],
	body: FILL_KIND_SYSTEM,
};

/// Interface commune des étapes `fill/<kind>/`.
pub trait FillKindStage: CascadeStage {
	const KIND: &'static str;
	const STAGE_ID: &'static str;

	fn fill_prompt_entry() -> &'static PromptEntry {
		&FILL_KIND_SYSTEM_ENTRY
	}

	/// Squelette user : template JSON à remplir (contrat de forme, pas d’heuristique lexicale).
	fn json_template() -> String {
		format!(
			"{{\"{kind}\":\"\",\"recommended_next_parent_steps\":\"\"}}",
			kind = Self::KIND
		)
	}
}

macro_rules! impl_fill_stage {
	($ty:ident, $kind:literal, $id:literal, $expects:literal, $produces:literal) => {
		impl crate::explore::cascade::CascadeStage for $ty {
			fn id() -> &'static str {
				Self::STAGE_ID
			}
			fn depth() -> u8 {
				2
			}
			fn prompt_entry() -> Option<&'static crate::entry::PromptEntry> {
				Some(Self::fill_prompt_entry())
			}
			fn kind_key() -> Option<&'static str> {
				Some(Self::KIND)
			}
			fn expects() -> &'static str {
				$expects
			}
			fn produces() -> &'static str {
				$produces
			}
		}
		impl FillKindStage for $ty {
			const KIND: &'static str = $kind;
			const STAGE_ID: &'static str = $id;
		}
		impl $ty {
			pub const ID: &'static str = $id;
			pub const KIND_KEY: &'static str = $kind;
		}
	};
}

pub(crate) use impl_fill_stage;
