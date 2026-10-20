//! Anti-boucle turn-à-turn (empreintes + familles bash/grep).
//!
//! Arbo n+1 : détection ici ; clôture propre dans [`super::loop_close`].

mod decision;
mod detector;
mod fingerprint;
mod outcome;

pub(crate) use decision::LoopDecision;
pub(crate) use detector::LoopDetector;
#[cfg(test)]
pub(crate) use fingerprint::normalize_bash_command_for_loop;
pub(crate) use outcome::{PendingToolCall, TurnOutcome};
