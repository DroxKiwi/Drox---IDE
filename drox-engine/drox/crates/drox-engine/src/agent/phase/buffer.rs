//! Buffer ligne pour retirer les marqueurs de phase du flux texte.

use crate::event::Phase;

use super::markers::{legacy_removed_phase_marker_line, parse_phase_marker};

/// Buffer line-based pour extraire les marqueurs `[phase: ...]` d'un stream
/// texte arbitrairement fragmenté.
///
/// Pourquoi line-based ? Les marqueurs occupent une ligne entière. En
/// bufferisant jusqu'au `\n`, on parse une fois la ligne complète et on
/// décide : marqueur connu (consommé silencieusement, déclenche `PhaseEnter`),
/// marqueur historique retiré (`reasoning` / `next-move`, ignoré), ou texte
/// ordinaire (`TextDelta`). La latence ajoutée est d'au plus une ligne.
pub(crate) struct PhaseLineBuffer {
    pending: String,
}

impl PhaseLineBuffer {
    pub(crate) const fn new() -> Self {
        Self {
            pending: String::new(),
        }
    }

    /// Consomme un fragment et appelle les callbacks pour chaque ligne
    /// terminée par `\n`. Le reliquat (ligne incomplète) est conservé.
    pub(crate) fn push_chunk<TextSink, PhaseSink>(
        &mut self,
        delta: &str,
        mut on_text: TextSink,
        mut on_phase: PhaseSink,
    ) where
        TextSink: FnMut(String),
        PhaseSink: FnMut(Phase),
    {
        self.pending.push_str(delta);
        while let Some(idx) = self.pending.find('\n') {
            let line: String = self.pending.drain(..=idx).collect();
            // `line` se termine par `\n` ; on parse la ligne SANS ce
            // séparateur pour reconnaître le marqueur.
            let body = line.trim_end_matches('\n');
            if legacy_removed_phase_marker_line(body) {
                continue;
            }
            if let Some(phase) = parse_phase_marker(body) {
                on_phase(phase);
            } else {
                on_text(line);
            }
        }
    }

    /// À appeler en fin de stream : flush le reliquat. Si c'est exactement
    /// un marqueur (sans `\n` final), on l'interprète aussi.
    pub(crate) fn finish<TextSink, PhaseSink>(self, mut on_text: TextSink, mut on_phase: PhaseSink)
    where
        TextSink: FnMut(String),
        PhaseSink: FnMut(Phase),
    {
        if self.pending.is_empty() {
            return;
        }
        if legacy_removed_phase_marker_line(self.pending.trim()) {
            return;
        }
        if let Some(phase) = parse_phase_marker(&self.pending) {
            on_phase(phase);
        } else {
            on_text(self.pending);
        }
    }
}

