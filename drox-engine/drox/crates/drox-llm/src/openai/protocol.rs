//! Wire types OpenAI Chat Completions (request + SSE chunks).

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize)]
pub(super) struct ChatCompletionRequest<'a> {
    pub model: &'a str,
    pub messages: Vec<OpenAiMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub stop: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<OpenAiToolSpec<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,
}

#[derive(Debug, Serialize)]
pub(super) struct OpenAiToolSpec<'a> {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub function: OpenAiToolFunction<'a>,
}

#[derive(Debug, Serialize)]
pub(super) struct OpenAiToolFunction<'a> {
    pub name: &'a str,
    pub description: &'a str,
    pub parameters: &'a Value,
}

#[derive(Debug, Serialize)]
pub(super) struct OpenAiMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Value>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tool_calls: Vec<OpenAiToolCallOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub(super) struct OpenAiToolCallOut {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub function: OpenAiFunctionCallOut,
}

#[derive(Debug, Serialize)]
pub(super) struct OpenAiFunctionCallOut {
    pub name: String,
    /// OpenAI exige une **string** JSON pour `arguments`.
    pub arguments: String,
}

/// Chunk SSE `data: {…}` (stream=true).
#[derive(Debug, Deserialize)]
pub(super) struct ChatCompletionChunk {
    #[serde(default)]
    pub choices: Vec<ChatCompletionChoice>,
    #[serde(default)]
    pub usage: Option<OpenAiUsage>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ChatCompletionChoice {
    #[serde(default)]
    pub delta: ChatCompletionDelta,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub(super) struct ChatCompletionDelta {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub reasoning_content: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<ChatCompletionToolCallDelta>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ChatCompletionToolCallDelta {
    #[serde(default)]
    pub index: usize,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub function: Option<ChatCompletionFunctionDelta>,
}

#[derive(Debug, Default, Deserialize)]
pub(super) struct ChatCompletionFunctionDelta {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct OpenAiUsage {
    #[serde(default)]
    pub prompt_tokens: u32,
    #[serde(default)]
    pub completion_tokens: u32,
}

/// Réponse non-stream (test connexion / fallback).
#[derive(Debug, Deserialize)]
#[allow(dead_code)] // parse JSON non-stream (tests + probes)
pub struct ChatCompletionResponse {
    #[serde(default)]
    pub choices: Vec<ChatCompletionNonStreamChoice>,
    #[serde(default)]
    pub usage: Option<OpenAiUsage>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ChatCompletionNonStreamChoice {
    #[serde(default)]
    pub message: Option<ChatCompletionNonStreamMessage>,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ChatCompletionNonStreamMessage {
    #[serde(default)]
    pub content: Option<String>,
}
