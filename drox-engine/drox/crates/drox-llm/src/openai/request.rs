//! Mapping messages / tools → payload OpenAI Chat Completions.

use drox_types::{Content, Message, Role};
use serde_json::{json, Value};

use crate::client::ChatOptions;
use crate::openai::protocol::{
    ChatCompletionRequest, OpenAiFunctionCallOut, OpenAiMessage, OpenAiToolCallOut,
    OpenAiToolFunction, OpenAiToolSpec,
};

pub(crate) fn build_request<'a>(
    model: &'a str,
    messages: &[Message],
    options: &'a ChatOptions,
    top_p: Option<f32>,
    presence_penalty: Option<f32>,
    frequency_penalty: Option<f32>,
    seed: Option<i64>,
    num_predict: i64,
) -> ChatCompletionRequest<'a> {
    let max_tokens = options
        .max_tokens
        .or_else(|| (num_predict > 0).then_some(num_predict as u32));
    ChatCompletionRequest {
        model,
        messages: messages_to_openai(messages),
        stream: true,
        temperature: options.temperature,
        max_tokens,
        stop: options.stop_sequences.clone(),
        tools: options
            .tools
            .iter()
            .map(|t| OpenAiToolSpec {
                kind: "function",
                function: OpenAiToolFunction {
                    name: &t.name,
                    description: &t.description,
                    parameters: &t.parameters,
                },
            })
            .collect(),
        top_p,
        presence_penalty,
        frequency_penalty,
        seed,
    }
}

fn messages_to_openai(messages: &[Message]) -> Vec<OpenAiMessage> {
    messages.iter().map(message_to_openai).collect()
}

pub(crate) fn message_to_openai(m: &Message) -> OpenAiMessage {
    match m.role {
        Role::Tool => {
            let mut text = String::new();
            let mut tool_call_id = None;
            for block in &m.content {
                if let Content::ToolResult {
                    tool_use_id,
                    content,
                    ..
                } = block
                {
                    tool_call_id = Some(tool_use_id.as_str().to_owned());
                    if !text.is_empty() {
                        text.push('\n');
                    }
                    text.push_str(content);
                } else if let Content::Text { text: t } = block {
                    text.push_str(t);
                }
            }
            OpenAiMessage {
                role: "tool".into(),
                content: Some(Value::String(text)),
                tool_calls: Vec::new(),
                tool_call_id,
            }
        }
        Role::Assistant => {
            let mut text = String::new();
            let mut tool_calls = Vec::new();
            let mut parts: Vec<Value> = Vec::new();
            for block in &m.content {
                match block {
                    Content::Text { text: t } => {
                        text.push_str(t);
                        parts.push(json!({ "type": "text", "text": t }));
                    }
                    Content::ToolUse { id, name, input } => {
                        tool_calls.push(OpenAiToolCallOut {
                            id: id.as_str().to_owned(),
                            kind: "function",
                            function: OpenAiFunctionCallOut {
                                name: name.clone(),
                                arguments: input.to_string(),
                            },
                        });
                    }
                    Content::Image { mime, data } => {
                        parts.push(json!({
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:{mime};base64,{data}")
                            }
                        }));
                    }
                    _ => {}
                }
            }
            let content = if parts.iter().any(|p| p.get("type") == Some(&json!("image_url"))) {
                Some(Value::Array(parts))
            } else if text.is_empty() && !tool_calls.is_empty() {
                None
            } else {
                Some(Value::String(text))
            };
            OpenAiMessage {
                role: "assistant".into(),
                content,
                tool_calls,
                tool_call_id: None,
            }
        }
        Role::User => {
            let mut text = String::new();
            let mut parts: Vec<Value> = Vec::new();
            let mut has_image = false;
            for block in &m.content {
                match block {
                    Content::Text { text: t } => {
                        text.push_str(t);
                        parts.push(json!({ "type": "text", "text": t }));
                    }
                    Content::Image { mime, data } => {
                        has_image = true;
                        parts.push(json!({
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:{mime};base64,{data}")
                            }
                        }));
                    }
                    _ => {}
                }
            }
            OpenAiMessage {
                role: "user".into(),
                content: Some(if has_image {
                    Value::Array(parts)
                } else {
                    Value::String(text)
                }),
                tool_calls: Vec::new(),
                tool_call_id: None,
            }
        }
        Role::System => OpenAiMessage {
            role: "system".into(),
            content: Some(Value::String(Content::collapse_text(&m.content))),
            tool_calls: Vec::new(),
            tool_call_id: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::ToolSpec;
    use drox_types::ToolUseId;
    use serde_json::json;

    #[test]
    fn message_assistant_tool_use_round_trip_fields() {
        let id = ToolUseId::from_string("call_abc".into());
        let msg = Message::new(
            Role::Assistant,
            vec![
                Content::text("reading"),
                Content::ToolUse {
                    id: id.clone(),
                    name: "file_read".into(),
                    input: json!({ "path": "a.rs" }),
                },
            ],
        );
        let wire = message_to_openai(&msg);
        assert_eq!(wire.role, "assistant");
        assert_eq!(wire.tool_calls.len(), 1);
        assert_eq!(wire.tool_calls[0].id, "call_abc");
        assert_eq!(wire.tool_calls[0].function.name, "file_read");
    }

    #[test]
    fn message_tool_result_keeps_call_id() {
        let id = ToolUseId::from_string("call_abc".into());
        let msg = Message::tool_result(id, "ok", false);
        let wire = message_to_openai(&msg);
        assert_eq!(wire.role, "tool");
        assert_eq!(wire.tool_call_id.as_deref(), Some("call_abc"));
        assert_eq!(wire.content, Some(Value::String("ok".into())));
    }

    #[test]
    fn build_request_includes_tools() {
        let msgs = vec![Message::user("hi")];
        let opts = ChatOptions::default().with_tools(vec![ToolSpec {
            name: "bash".into(),
            description: "run".into(),
            parameters: json!({ "type": "object" }),
        }]);
        let req = build_request("m", &msgs, &opts, None, None, None, None, 0);
        assert_eq!(req.tools.len(), 1);
        assert!(req.stream);
    }
}
