//! Provider Ollama (`/api/chat` NDJSON streaming).

mod wire;
mod chat;

pub use chat::OllamaClient;
