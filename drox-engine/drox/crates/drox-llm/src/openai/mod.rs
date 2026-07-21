//! Protocole OpenAI Chat Completions (types wire + client + SSE).
//!
//! Couche **protocole** — pas un adaptateur catalogue. Les ids wizard
//! (`vllm`, `lmstudio`, …) passent par `crate::adapters`.

mod client;
mod protocol;
mod request;
mod sse;
mod url;

pub use client::OpenAiCompatibleClient;
pub use url::openai_chat_completions_url;
