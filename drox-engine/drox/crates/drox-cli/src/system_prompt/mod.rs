//! Assemblage du system prompt et registre d'outils par profil d'exécution.
//!
//! Phase 2 refactoring — Medium = comportement actuel ; voir
//! `docs/plans/REFACTO-STRUCTURE-CODE.md`.

mod assemble;
pub(crate) mod registry;

pub use assemble::{AssembleInput, assemble_system_prompt};
pub use registry::{RegistryBuildInput, build_registry_for_run};
