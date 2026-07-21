//! Parse SSE OpenAI Chat Completions → `StreamEvent`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use bytes::Bytes;
use drox_types::{StopReason, StreamEvent, ToolUseId, Usage};
use futures::stream::{self, Stream, StreamExt, TryStreamExt};
use serde_json::{json, Value};
use tokio_util::codec::{FramedRead, LinesCodec};
use tokio_util::io::StreamReader;

use crate::error::LlmError;
use crate::openai::protocol::ChatCompletionChunk;

#[derive(Default)]
pub(crate) struct ToolCallAcc {
    pub id: Option<String>,
    pub name: String,
    pub arguments: String,
}

pub(crate) fn events_from_sse<S>(
    bytes_stream: S,
) -> impl Stream<Item = Result<StreamEvent, LlmError>> + Send + 'static
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    let tool_acc = Arc::new(Mutex::new(HashMap::<usize, ToolCallAcc>::new()));
    let usage_acc = Arc::new(Mutex::new(Usage::default()));
    let finish_reason = Arc::new(Mutex::new(None::<String>));

    let io_stream = bytes_stream.map_err(std::io::Error::other);
    let reader = StreamReader::new(io_stream);
    let lines = FramedRead::new(reader, LinesCodec::new());

    let parsed = lines
        .map_err(|e| match e {
            tokio_util::codec::LinesCodecError::Io(io) => LlmError::StreamIo(io),
            tokio_util::codec::LinesCodecError::MaxLineLengthExceeded => LlmError::StreamTerminated,
        })
        .and_then({
            let tool_acc = Arc::clone(&tool_acc);
            let usage_acc = Arc::clone(&usage_acc);
            let finish_reason = Arc::clone(&finish_reason);
            move |line: String| {
                let tool_acc = Arc::clone(&tool_acc);
                let usage_acc = Arc::clone(&usage_acc);
                let finish_reason = Arc::clone(&finish_reason);
                async move {
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed.starts_with(':') {
                        return Ok(Vec::new());
                    }
                    let data = trimmed.strip_prefix("data:").map(str::trim).unwrap_or(trimmed);
                    if data == "[DONE]" {
                        let mut events = Vec::new();
                        {
                            let mut map = tool_acc.lock().expect("tool_acc poisoned");
                            let mut indices: Vec<_> = map.keys().copied().collect();
                            indices.sort_unstable();
                            for idx in indices {
                                if let Some(acc) = map.remove(&idx) {
                                    if !acc.name.is_empty() {
                                        let id = acc
                                            .id
                                            .filter(|s| !s.is_empty())
                                            .map(ToolUseId::from_string)
                                            .unwrap_or_else(ToolUseId::new);
                                        let arguments = parse_arguments_json(&acc.arguments);
                                        events.push(StreamEvent::ToolCall {
                                            id,
                                            name: acc.name,
                                            arguments,
                                        });
                                    }
                                }
                            }
                        }
                        let usage = *usage_acc.lock().expect("usage poisoned");
                        let reason = map_finish_reason(
                            finish_reason.lock().expect("finish poisoned").as_deref(),
                            !events.is_empty(),
                        );
                        events.push(StreamEvent::Stop { reason, usage });
                        return Ok(events);
                    }
                    let chunk: ChatCompletionChunk = serde_json::from_str(data)?;
                    if let Some(u) = chunk.usage {
                        let mut usage = usage_acc.lock().expect("usage poisoned");
                        usage.input_tokens = u.prompt_tokens;
                        usage.output_tokens = u.completion_tokens;
                    }
                    let mut events = Vec::new();
                    for choice in chunk.choices {
                        if let Some(fr) = choice.finish_reason {
                            *finish_reason.lock().expect("finish poisoned") = Some(fr);
                        }
                        let delta = choice.delta;
                        if let Some(thinking) = delta.reasoning_content.filter(|s| !s.is_empty()) {
                            events.push(StreamEvent::ThinkingDelta { text: thinking });
                        }
                        if let Some(content) = delta.content.filter(|s| !s.is_empty()) {
                            events.push(StreamEvent::TextDelta { text: content });
                        }
                        if !delta.tool_calls.is_empty() {
                            let mut map = tool_acc.lock().expect("tool_acc poisoned");
                            for tc in delta.tool_calls {
                                let entry = map.entry(tc.index).or_default();
                                if let Some(id) = tc.id.filter(|s| !s.is_empty()) {
                                    entry.id = Some(id);
                                }
                                if let Some(f) = tc.function {
                                    if let Some(name) = f.name.filter(|s| !s.is_empty()) {
                                        entry.name = name;
                                    }
                                    if let Some(args) = f.arguments {
                                        entry.arguments.push_str(&args);
                                    }
                                }
                            }
                        }
                    }
                    Ok(events)
                }
            }
        });

    let start = stream::once(async { Ok(StreamEvent::Start) });
    start.chain(parsed.flat_map(|res| match res {
        Ok(events) => stream::iter(events.into_iter().map(Ok)).boxed(),
        Err(err) => stream::iter(std::iter::once(Err(err))).boxed(),
    }))
}

fn parse_arguments_json(raw: &str) -> Value {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return json!({});
    }
    serde_json::from_str(trimmed).unwrap_or_else(|_| json!({ "_raw": raw }))
}

pub(crate) fn map_finish_reason(raw: Option<&str>, had_tools: bool) -> StopReason {
    match raw {
        Some("length") => StopReason::MaxTokens,
        Some("tool_calls") => StopReason::ToolUse,
        Some("stop") | None => {
            if had_tools {
                StopReason::ToolUse
            } else {
                StopReason::EndTurn
            }
        }
        Some(_) => StopReason::EndTurn,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openai::protocol::ChatCompletionChunk;

    #[test]
    fn parse_sse_tool_call_and_done() {
        let lines = [
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"file_read","arguments":"{\"p\""}}]}}]}"#,
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\"x\"}"}}]},"finish_reason":"tool_calls"}]}"#,
            "data: [DONE]",
        ];
        let mut acc: HashMap<usize, ToolCallAcc> = HashMap::new();
        let mut usage = Usage::default();
        let mut finish = None;
        let mut emitted = Vec::new();
        for line in lines {
            let data = line.strip_prefix("data: ").unwrap();
            if data == "[DONE]" {
                let mut indices: Vec<_> = acc.keys().copied().collect();
                indices.sort_unstable();
                for idx in indices {
                    let a = acc.remove(&idx).unwrap();
                    emitted.push((a.id.clone(), a.name.clone(), a.arguments.clone()));
                }
                let _ = map_finish_reason(finish.as_deref(), !emitted.is_empty());
                break;
            }
            let chunk: ChatCompletionChunk = serde_json::from_str(data).unwrap();
            for choice in chunk.choices {
                if let Some(fr) = choice.finish_reason {
                    finish = Some(fr);
                }
                for tc in choice.delta.tool_calls {
                    let entry = acc.entry(tc.index).or_default();
                    if let Some(id) = tc.id {
                        entry.id = Some(id);
                    }
                    if let Some(f) = tc.function {
                        if let Some(n) = f.name {
                            entry.name = n;
                        }
                        if let Some(a) = f.arguments {
                            entry.arguments.push_str(&a);
                        }
                    }
                }
            }
            let _ = &usage;
        }
        assert_eq!(emitted.len(), 1);
        assert_eq!(emitted[0].0.as_deref(), Some("call_1"));
        assert_eq!(emitted[0].1, "file_read");
        assert_eq!(emitted[0].2, r#"{"p":"x"}"#);
    }
}
