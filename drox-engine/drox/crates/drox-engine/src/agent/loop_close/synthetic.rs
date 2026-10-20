//! Clôture propre quand le modèle ignore ForceConclude.

use drox_types::Message;
use tokio::sync::mpsc;

use crate::error::EngineError;
use crate::event::{AgentEvent, Phase};

/// Texte user-facing (FR) + marqueurs phase pour le transcript.
#[must_use]
pub(crate) fn synthetic_done_assistant_text(kind: &str, turns: u32) -> String {
    format!(
        "[phase: answering]\n\
         **Run clôturé automatiquement** — boucle détectée (`{kind}`, {turns} tours). \
         L’agent n’a pas pu progresser malgré les relances. \
         Relance avec une consigne plus courte, ou corrige le blocage (ex. terminal shell pourri).\n\
         [phase: done]"
    )
}

/// Émet answering + texte (sans Stop) — l'appelant persiste puis envoie `Stop`.
pub(crate) async fn emit_synthetic_done(
    tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    messages: &mut Vec<Message>,
    kind: &'static str,
    turns: u32,
) {
    let text = synthetic_done_assistant_text(kind, turns);
    let _ = tx
        .send(Ok(AgentEvent::PhaseEnter {
            phase: Phase::Answering,
        }))
        .await;
    let _ = tx
        .send(Ok(AgentEvent::TextDelta {
            text: text.clone(),
        }))
        .await;
    let _ = tx
        .send(Ok(AgentEvent::PhaseEnter {
            phase: Phase::Done,
        }))
        .await;
    messages.push(Message::assistant(text));
}
