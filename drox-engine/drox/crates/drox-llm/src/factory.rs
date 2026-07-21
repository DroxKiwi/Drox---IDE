//! Point d’entrée factory — délègue aux adaptateurs catalogue.

use std::sync::Arc;

use crate::adapters;
use crate::client::LlmClient;
use crate::config::LlmConfig;
use crate::error::LlmError;

/// `ollama` (ou absent / vide) → adaptateur Ollama ; autres ids → adaptateur dédié.
pub fn create_llm_client(
    provider: Option<&str>,
    config: LlmConfig,
) -> Result<Arc<dyn LlmClient>, LlmError> {
    adapters::create_for_provider(provider, config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_ollama() {
        let cfg = LlmConfig::try_from_str("http://127.0.0.1:11434", "m").unwrap();
        assert!(create_llm_client(None, cfg.clone()).is_ok());
        assert!(create_llm_client(Some(""), cfg.clone()).is_ok());
        assert!(create_llm_client(Some("ollama"), cfg).is_ok());
    }

    #[test]
    fn openai_compatible_ids() {
        let cfg = LlmConfig::try_from_str("http://127.0.0.1:4000", "m").unwrap();
        for id in [
            "openai_compatible",
            "vllm",
            "lmstudio",
            "mistral",
            "huggingface",
            "scaleway",
            "ovhcloud",
        ] {
            assert!(create_llm_client(Some(id), cfg.clone()).is_ok(), "{id}");
        }
    }
}
