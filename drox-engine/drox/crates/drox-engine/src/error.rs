//! Erreurs du moteur agent.

use drox_llm::LlmError;
use drox_tools::ToolError;
use thiserror::Error;

/// Erreur retournée par la boucle agent.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum EngineError {
    #[error("LLM error: {0}")]
    Llm(#[from] LlmError),

    #[error("tool error: {0}")]
    Tool(#[from] ToolError),

    #[error("max iterations reached: {0}")]
    MaxIterations(usize),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("session / transcript: {0}")]
    Session(#[from] drox_session::SessionError),

    /// Sprint M1 — erreur de persistance / compaction de la mémoire de session.
    /// Wrapper textuel : ces échecs sont rares et leur message brut est plus
    /// utile à l'humain qu'une chaîne de types intermédiaires.
    #[error("memory: {0}")]
    Memory(String),

}
