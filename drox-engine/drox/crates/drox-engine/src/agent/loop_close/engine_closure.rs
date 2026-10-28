//! Clôture portée par le moteur (profils locaux) : un tour sans tool = réponse finale.

use drox_types::Message;
use tokio::sync::mpsc;

use crate::error::EngineError;
use crate::event::{AgentEvent, Phase};

/// Réponse affichée quand le modèle termine sans texte visible.
pub(crate) const ENGINE_CLOSURE_EMPTY_REPLY: &str = "**Run terminé** — le modèle n’a pas rédigé \
     de réponse finale. Les actions effectuées restent visibles dans la trace ci-dessus.";

/// Signe `done`. `surface_reply` : le texte n'est pas encore dans la bulle
/// (tour vide, ou prose restée dans une phase interne) — on l'émet une fois
/// sous `answering`. Un bilan déjà streamé après le thinking ne l'est pas.
/// `push_message` : ajoute un message assistant (tour vide).
pub(crate) async fn emit_engine_closure(
    tx: &mpsc::Sender<Result<AgentEvent, EngineError>>,
    messages: &mut Vec<Message>,
    text: &str,
    surface_reply: bool,
    push_message: bool,
) {
    if surface_reply {
        let _ = tx
            .send(Ok(AgentEvent::PhaseEnter {
                phase: Phase::Answering,
            }))
            .await;
        let _ = tx
            .send(Ok(AgentEvent::TextDelta {
                text: text.to_string(),
            }))
            .await;
    }
    let _ = tx
        .send(Ok(AgentEvent::PhaseEnter { phase: Phase::Done }))
        .await;
    if push_message {
        messages.push(Message::assistant(format!("[phase: answering]\n{text}\n[phase: done]")));
    }
}
