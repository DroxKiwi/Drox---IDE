//! Client HTTP OpenAI Chat Completions (couche transport).

use async_trait::async_trait;
use drox_types::Message;
use reqwest::Client;
use futures::StreamExt;
use tracing::{debug, instrument};
use url::Url;

use crate::client::{ChatOptions, LlmClient, StreamHandle};
use crate::config::LlmConfig;
use crate::error::LlmError;
use crate::openai::request::build_request;
use crate::openai::sse::events_from_sse;
use crate::openai::url::openai_chat_completions_url;

/// Client OpenAI-compatible (`/v1/chat/completions`).
pub struct OpenAiCompatibleClient {
    http: Client,
    base_url: Url,
    model: String,
    top_p: Option<f32>,
    presence_penalty: Option<f32>,
    frequency_penalty: Option<f32>,
    seed: Option<i64>,
    num_predict: i64,
    reasoning_effort: Option<String>,
    thinking_budget: Option<u32>,
}

impl OpenAiCompatibleClient {
    pub fn new(config: LlmConfig) -> Result<Self, LlmError> {
        let mut builder = Client::builder().timeout(config.timeout());
        if !config.headers.is_empty() {
            let mut hm = reqwest::header::HeaderMap::with_capacity(config.headers.len());
            for (k, v) in &config.headers {
                let name = reqwest::header::HeaderName::from_bytes(k.as_bytes())
                    .map_err(|e| LlmError::InvalidHeader(format!("name `{k}`: {e}")))?;
                let value = reqwest::header::HeaderValue::from_str(v)
                    .map_err(|e| LlmError::InvalidHeader(format!("value for header `{k}`: {e}")))?;
                hm.insert(name, value);
            }
            builder = builder.default_headers(hm);
        }
        let http = builder.build()?;
        Ok(Self {
            http,
            base_url: config.base_url,
            model: config.model,
            top_p: config.top_p,
            presence_penalty: config.presence_penalty,
            frequency_penalty: config.frequency_penalty,
            seed: config.seed,
            num_predict: config.num_predict,
            reasoning_effort: config.reasoning_effort,
            thinking_budget: config.thinking_budget,
        })
    }

    fn chat_endpoint(&self) -> Result<Url, LlmError> {
        openai_chat_completions_url(&self.base_url)
    }

    #[must_use]
    pub fn configured_model(&self) -> &str {
        &self.model
    }

    #[must_use]
    pub fn server_url(&self) -> &Url {
        &self.base_url
    }
}

#[async_trait]
impl LlmClient for OpenAiCompatibleClient {
    #[instrument(skip(self, messages, options), fields(model = %self.model, msg_count = messages.len(), tools = options.tools.len()))]
    async fn stream_chat(
        &self,
        messages: Vec<Message>,
        options: ChatOptions,
    ) -> Result<StreamHandle, LlmError> {
        let url = self.chat_endpoint()?;
        let payload = build_request(
            &self.model,
            &messages,
            &options,
            self.top_p,
            self.presence_penalty,
            self.frequency_penalty,
            self.seed,
            self.num_predict,
            self.reasoning_effort.as_deref(),
            self.thinking_budget,
        );
        debug!(%url, "POST OpenAI chat/completions");

        let response = self.http.post(url.clone()).json(&payload).send().await?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(LlmError::Api {
                status: status.as_u16(),
                body,
                url: url.to_string(),
            });
        }

        let bytes_stream = response.bytes_stream();
        Ok(events_from_sse(bytes_stream).boxed())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_error_includes_url() {
        let err = LlmError::Api {
            status: 404,
            body: r#"{"detail":"Not Found"}"#.into(),
            url: "http://192.168.1.1:4000/v1/chat/completions".into(),
        };
        let msg = err.to_string();
        assert!(msg.contains("404"), "{msg}");
        assert!(
            msg.contains("192.168.1.1:4000/v1/chat/completions"),
            "{msg}"
        );
    }
}
