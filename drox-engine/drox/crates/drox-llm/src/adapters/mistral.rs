//! Adaptateur catalogue `mistral` — Chat Completions Mistral Cloud.
//!
//! Doc officielle ([Chat](https://docs.mistral.ai/api/#tag/chat)) :
//! - seed → champ wire **`random_seed`** (pas `seed`, sinon 422 `extra_forbidden`)
//! - `top_p` runtime **> 0** (sinon 422 `greater_than`) — on omet si ≤ 0

use std::sync::Arc;

use crate::llm_client::LlmClient;
use crate::config::LlmConfig;
use crate::error::LlmError;
use crate::openai::{OpenAiCompatDialect, OpenAiCompatibleClient};

pub const PROVIDER_ID: &str = "mistral";

pub fn create(config: LlmConfig) -> Result<Arc<dyn LlmClient>, LlmError> {
    Ok(Arc::new(OpenAiCompatibleClient::with_dialect(
        config,
        OpenAiCompatDialect::Mistral,
    )?) as Arc<dyn LlmClient>)
}
