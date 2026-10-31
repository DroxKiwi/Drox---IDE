//! Clôture anti-boucle : ForceConclude (drive) + SyntheticDone.
//!
//! Séparé de [`super::loop_detect`] pour garder le détecteur pur et `drive` mince.
//! [`engine_closure`] : clôture moteur des profils locaux (tour sans tool).

mod engine_closure;
mod synthetic;

pub(crate) use engine_closure::{
    emit_engine_closure, ENGINE_CLOSURE_EMPTY_REPLY, ENGINE_CLOSURE_TEXTUAL_TOOL_REPLY,
};
pub(crate) use synthetic::emit_synthetic_done;
