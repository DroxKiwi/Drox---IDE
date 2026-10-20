//! Protocole OpenAI Chat Completions (types wire + client + SSE).
//!
//! Couche **protocole** — pas un adaptateur catalogue. Les ids wizard
//! (`vllm`, `lmstudio`, …) passent par `crate::adapters`.

mod dialect;
mod http_client;
mod wire;
mod request;
mod sse;
mod url;

pub use dialect::OpenAiCompatDialect;
pub use http_client::OpenAiCompatibleClient;
pub use url::openai_chat_completions_url;
