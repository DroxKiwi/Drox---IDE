//! Cascade Explore — **l’arborescence de ce dossier = la profondeur des étapes**.
//!
//! ```text
//! cascade/
//! ├── execution/                 ← profondeur 1 — tools on
//! │   └── commit/                ← profondeur 2 — explore_commit (canal tools)
//! └── materialize/               ← profondeur 1 — assemble (+ fill legacy optionnel)
//!     ├── fill/<kind>/           ← profondeur 2 — fallback JSON (non nominal)
//!     └── assemble/              ← profondeur 2 — glue moteur, pas de LLM
//! ```
//!
//! Chaque `mod.rs` d’étape est une **interface visuelle** : id, profondeur, prompt
//! (ou `None` si étape engine-only), entrée / sortie attendues.
//!
//! Runner nominal : execution + commit tools → assemble depuis `ExploreCommitHandle`.

mod execution;
pub mod materialize;

pub use execution::{CommitStage, ExecutionStage, COMMIT_STAGE_ENTRY};
pub use materialize::MaterializeStage;
pub use materialize::assemble::AssembleStage;
pub use materialize::fill::{
	CodeSnippetsFill, FileSummariesFill, FillKindStage, GapsFill, KeySymbolsFill, PathsReadFill,
	StructureMapFill,
};

/// Contrat d’une étape de cascade (interface lisible dans l’arborescence).
pub trait CascadeStage {
	/// Id stable (`explore.cascade.execution`, `explore.cascade.fill.paths_read`, …).
	fn id() -> &'static str
	where
		Self: Sized;

	/// Profondeur dans l’arbre (1 = racine cascade, 2 = sous-étape materialize, …).
	fn depth() -> u8
	where
		Self: Sized;

	/// Fiche prompt catalogue, si cette étape parle au LLM.
	fn prompt_entry() -> Option<&'static crate::entry::PromptEntry>
	where
		Self: Sized;

	/// Kind produit (`paths_read`, …) — `None` si étape non-kind (exec / assemble).
	fn kind_key() -> Option<&'static str>
	where
		Self: Sized,
	{
		None
	}

	/// Entrée attendue (doc pour humains + futurs runners).
	fn expects() -> &'static str
	where
		Self: Sized;

	/// Sortie produite.
	fn produces() -> &'static str
	where
		Self: Sized;
}

/// Ordre canonique des étapes racine (profondeur 1).
pub const ROOT_ORDER: &[&str] = &[ExecutionStage::ID, MaterializeStage::ID];

/// Ordre canonique des fills (profondeur 2) — n’exécuter que les kinds demandés.
pub const FILL_ORDER: &[&str] = &[
	PathsReadFill::ID,
	FileSummariesFill::ID,
	StructureMapFill::ID,
	KeySymbolsFill::ID,
	CodeSnippetsFill::ID,
	GapsFill::ID,
];

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn cascade_depths_match_folder_levels() {
		assert_eq!(ExecutionStage::depth(), 1);
		assert_eq!(MaterializeStage::depth(), 1);
		assert_eq!(PathsReadFill::depth(), 2);
		assert_eq!(AssembleStage::depth(), 2);
	}

	#[test]
	fn fill_stages_expose_kind_keys() {
		assert_eq!(PathsReadFill::kind_key(), Some("paths_read"));
		assert_eq!(GapsFill::kind_key(), Some("gaps"));
		assert!(ExecutionStage::kind_key().is_none());
		assert!(AssembleStage::prompt_entry().is_none());
	}
}
