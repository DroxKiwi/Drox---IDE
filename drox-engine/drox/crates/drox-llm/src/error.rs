//! Hiérarchie d'erreurs du client LLM.

use thiserror::Error;

/// Erreurs renvoyées par les implémentations de `LlmClient`.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum LlmError {
    #[error("HTTP transport error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("LLM API error (status {status}) at {url}: {body}")]
    Api {
        status: u16,
        body: String,
        url: String,
    },

    #[error("invalid URL: {0}")]
    InvalidUrl(#[from] url::ParseError),

    #[error("stream terminated unexpectedly")]
    StreamTerminated,

    #[error("stream I/O error: {0}")]
    StreamIo(#[from] std::io::Error),

    #[error("retry exhausted after {attempts} attempts: {source}")]
    RetryExhausted {
        attempts: u32,
        #[source]
        source: Box<Self>,
    },

    #[error("invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("invalid HTTP header: {0}")]
    InvalidHeader(String),
}

impl LlmError {
    /// Indique si l'erreur justifie un retry (réseau transient, etc.).
    pub fn is_retryable(&self) -> bool {
        match self {
            Self::Http(err) => {
                err.is_timeout()
                    || err.is_connect()
                    || err.is_request()
                    || err
                        .status()
                        .is_some_and(|s| s.is_server_error() || s.as_u16() == 429)
            }
            Self::StreamTerminated | Self::StreamIo(_) => true,
            Self::Api { status, .. } => *status >= 500 || *status == 429,
            Self::Json(_)
            | Self::InvalidUrl(_)
            | Self::InvalidConfig(_)
            | Self::InvalidHeader(_)
            | Self::RetryExhausted { .. } => false,
        }
    }

    /// Contexte provider saturé (overflow fenêtre).
    #[must_use]
    pub fn is_context_length_exceeded(&self) -> bool {
        match self {
            Self::Api { status, body, .. } => {
                let lower = body.to_ascii_lowercase();
                *status == 413
                    || *status == 422
                    || (*status == 400
                        && (lower.contains("context") || lower.contains("token")))
                    || lower.contains("context length")
                    || lower.contains("maximum context")
                    || lower.contains("context_window")
                    || lower.contains("too many tokens")
            }
            Self::RetryExhausted { source, .. } => source.is_context_length_exceeded(),
            _ => false,
        }
    }
}
