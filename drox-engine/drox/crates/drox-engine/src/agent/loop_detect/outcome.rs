//! Tour LLM observé par le détecteur anti-boucle.

use drox_types::{StopReason, ToolUseId, Usage};
use serde_json::Value;

use crate::event::Phase;

#[derive(Clone)]
pub(crate) struct PendingToolCall {
    pub(crate) id: ToolUseId,
    pub(crate) name: String,
    pub(crate) arguments: Value,
}

pub(crate) struct TurnOutcome {
    /// Texte assistant **nettoyé** : marqueurs `[phase: ...]` retirés.
    pub(crate) text: String,
    /// Trace *thinking* native — incluse dans l'empreinte stricte.
    pub(crate) thinking: String,
    pub(crate) tool_calls: Vec<PendingToolCall>,
    pub(crate) reason: StopReason,
    pub(crate) usage: Usage,
    pub(crate) final_phase: Option<Phase>,
    pub(crate) saw_answering: bool,
    /// Le texte content a été streamé sur la bulle visible (phase vide ou `answering`),
    /// sans fragment resté dans une phase interne.
    pub(crate) reply_already_visible: bool,
    pub(crate) saw_analyzing: bool,
    pub(crate) saw_testing: bool,
}
