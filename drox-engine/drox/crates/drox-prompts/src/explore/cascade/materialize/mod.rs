//! Profondeur **1** — `cascade/materialize/`
//!
//! Branche tools-off : pour chaque kind demandé → [`fill`], puis [`assemble`] (moteur).
//!
//! Aujourd’hui le moteur utilise encore un tour monolytique (`explore.report_synthesis`) ;
//! cette arbo décrit la **cible** cascade fill-par-kind.

pub mod assemble;
pub mod fill;

use crate::entry::PromptEntry;
use crate::explore::cascade::CascadeStage;
use crate::explore::prompts::EXPLORE_REPORT_SYSTEM_ENTRY;

/// Étape racine materialize (conteneur). Prompt legacy monolytique tant que fill/* n’est pas branché.
pub struct MaterializeStage;

impl MaterializeStage {
	pub const ID: &'static str = "explore.cascade.materialize";
}

impl CascadeStage for MaterializeStage {
	fn id() -> &'static str {
		Self::ID
	}

	fn depth() -> u8 {
		1
	}

	fn prompt_entry() -> Option<&'static PromptEntry> {
		// Bridge : encore le system rapport monolytique jusqu’au runner cascade.
		Some(&EXPLORE_REPORT_SYSTEM_ENTRY)
	}

	fn expects() -> &'static str {
		"telegraphic notes from execution (+ optional prior fill outputs when cascading)"
	}

	fn produces() -> &'static str {
		"kind artefacts under .drox/subagents/… + artifacts_inline merge (via assemble)"
	}
}
