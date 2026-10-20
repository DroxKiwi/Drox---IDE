//! Clôture anti-boucle : ForceConclude (drive) + SyntheticDone.
//!
//! Séparé de [`super::loop_detect`] pour garder le détecteur pur et `drive` mince.

mod synthetic;

pub(crate) use synthetic::emit_synthetic_done;
