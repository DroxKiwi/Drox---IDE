//! Décisions du détecteur — escalade vers clôture de run.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LoopDecision {
    /// Tour normal, pas de répétition.
    Ok,
    /// Soft Prefer — injecter un nudge, relancer le LLM.
    Warn { kind: &'static str },
    /// MustText + tools off au prochain tour — forcer answering/done.
    ForceConclude { kind: &'static str },
    /// Clôture moteur propre (Stop) — plus d'`EngineError::LoopDetected` ici.
    SyntheticDone { kind: &'static str, turns: u32 },
}

/// Mappe un compteur de strikes (1-based après incrément) vers l'escalade.
#[must_use]
pub(crate) fn escalate(kind: &'static str, strike: u32) -> LoopDecision {
    match strike {
        0 => LoopDecision::Ok,
        1 => LoopDecision::Warn { kind },
        2 => LoopDecision::ForceConclude { kind },
        n => LoopDecision::SyntheticDone {
            kind,
            turns: n.saturating_add(1),
        },
    }
}
