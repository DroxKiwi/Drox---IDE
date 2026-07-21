//! `drox-llm` — client LLM unifié.
//!
//! Streaming SSE/NDJSON, retry/backoff, abstraction provider. Ollama et
//! OpenAI-compatible (vLLM, LM Studio, Mistral, …) derrière le même trait.
//!
//! ## Exemple d'utilisation
//!
//! ```no_run
//! # async fn demo() -> Result<(), drox_llm::LlmError> {
//! use drox_llm::{ChatOptions, LlmClient, LlmConfig, create_llm_client};
//! use drox_types::Message;
//! use futures::StreamExt;
//!
//! let config = LlmConfig::try_from_str("http://localhost:11434", "llama3.2")?;
//! let client = create_llm_client(Some("ollama"), config)?;
//! let messages = vec![Message::user("bonjour")];
//! let mut stream = client.stream_chat(messages, ChatOptions::default()).await?;
//! while let Some(event) = stream.next().await {
//!     println!("{:?}", event?);
//! }
//! # Ok(())
//! # }
//! ```
//!
//! Voir `docs/INVENTAIRE-NOYAU-MOTEUR.md` § 2.2.

pub mod adapters;
pub mod client;
pub mod config;
pub mod error;
pub mod factory;
pub mod ollama;
pub mod openai;
pub mod retry;

pub use client::{ChatOptions, LlmClient, StreamHandle, ToolSpec};
pub use config::LlmConfig;
pub use error::LlmError;
pub use factory::create_llm_client;
pub use ollama::OllamaClient;
pub use openai::{openai_chat_completions_url, OpenAiCompatibleClient};
pub use retry::with_retry;
