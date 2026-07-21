//! Adaptateur catalogue `scaleway` — protocole OpenAI Chat Completions.

use std::sync::Arc;

use crate::client::LlmClient;
use crate::config::LlmConfig;
use crate::error::LlmError;
use crate::openai::OpenAiCompatibleClient;

pub const PROVIDER_ID: &str = "scaleway";

pub fn create(config: LlmConfig) -> Result<Arc<dyn LlmClient>, LlmError> {
    Ok(Arc::new(OpenAiCompatibleClient::new(config)?) as Arc<dyn LlmClient>)
}
