//! Adaptateur catalogue `ollama` (local + cloud) — protocole Ollama.

use std::sync::Arc;

use crate::client::LlmClient;
use crate::config::LlmConfig;
use crate::error::LlmError;
use crate::ollama::OllamaClient;

pub const PROVIDER_ID: &str = "ollama";

pub fn create(config: LlmConfig) -> Result<Arc<dyn LlmClient>, LlmError> {
    Ok(Arc::new(OllamaClient::new(config)?) as Arc<dyn LlmClient>)
}
