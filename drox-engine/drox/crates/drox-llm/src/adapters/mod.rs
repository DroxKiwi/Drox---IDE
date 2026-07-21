//! Adaptateurs catalogue IDE → client protocole.
//!
//! Un fichier par id wizard. La logique wire (Ollama NDJSON / OpenAI SSE)
//! reste dans `crate::ollama` et `crate::openai`.

mod huggingface;
mod lmstudio;
mod mistral;
mod ollama;
mod openai_compatible;
mod ovhcloud;
mod scaleway;
mod vllm;

use std::sync::Arc;

use crate::client::LlmClient;
use crate::config::LlmConfig;
use crate::error::LlmError;

/// Ids catalogue connus (miroir `DroxLlmProviderId` IDE).
pub const CATALOG_PROVIDER_IDS: &[&str] = &[
    ollama::PROVIDER_ID,
    vllm::PROVIDER_ID,
    lmstudio::PROVIDER_ID,
    openai_compatible::PROVIDER_ID,
    huggingface::PROVIDER_ID,
    mistral::PROVIDER_ID,
    scaleway::PROVIDER_ID,
    ovhcloud::PROVIDER_ID,
];

/// Construit le client pour un id catalogue (`DroxLlmProviderId`).
pub fn create_for_provider(
    provider: Option<&str>,
    config: LlmConfig,
) -> Result<Arc<dyn LlmClient>, LlmError> {
    let p = provider.unwrap_or("ollama").trim().to_ascii_lowercase();
    match p.as_str() {
        "" | "ollama" => ollama::create(config),
        "vllm" => vllm::create(config),
        "lmstudio" => lmstudio::create(config),
        "openai_compatible" => openai_compatible::create(config),
        "huggingface" => huggingface::create(config),
        "mistral" => mistral::create(config),
        "scaleway" => scaleway::create(config),
        "ovhcloud" => ovhcloud::create(config),
        // Ids inconnus : même famille OpenAI (serveur custom non listé).
        _ => openai_compatible::create(config),
    }
}
