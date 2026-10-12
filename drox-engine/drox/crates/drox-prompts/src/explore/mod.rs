//! Prompts + **cascade** Explore.
//!
//! ## Voir la cascade
//!
//! Ouvre [`cascade`] : l’arborescence des dossiers **est** le plan d’exécution cible.
//!
//! ```text
//! explore/
//! ├── prompts.rs                 — fiches system (exec + rapport legacy)
//! └── cascade/
//!     ├── execution/             — profondeur 1 (tools on)
//!     │   └── commit/            — profondeur 2 (explore_commit)
//!     └── materialize/           — profondeur 1 (assemble)
//!         ├── fill/<kind>/       — profondeur 2 (fallback JSON, non nominal)
//!         └── assemble/          — profondeur 2 (glue moteur, 0 LLM)
//! ```

mod cascade;
mod prompts;

pub use cascade::{
	AssembleStage, CascadeStage, CodeSnippetsFill, CommitStage, ExecutionStage, FileSummariesFill,
	FillKindStage, GapsFill, KeySymbolsFill, MaterializeStage, PathsReadFill, StructureMapFill,
	COMMIT_STAGE_ENTRY, FILL_ORDER, ROOT_ORDER,
};
pub use cascade::materialize::fill::{FILL_KIND_SYSTEM, FILL_KIND_SYSTEM_ENTRY};
pub use prompts::{
	explore_report_system_prompt, thoroughness_supplement, EXPLORE_REPORT_SYSTEM_ENTRY,
	EXPLORE_REPORT_SYSTEM_PROMPT, EXPLORE_SYSTEM_ENTRY, EXPLORE_SYSTEM_PROMPT,
};
