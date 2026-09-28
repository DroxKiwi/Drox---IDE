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
    reasoning_effort: Option<&'a str>,
    thinking_budget: Option<u32>,
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
        reasoning_effort,
        thinking_budget,
    }
}

fn messages_to_openai(messages: &[Message]) -> Vec<OpenAiMessage> {
    // Qwen / Jinja templates (via LiteLLM): "System message must be at the beginning".
    // Same policy as Ollama — coalesce leading systems, rewrite mid-run nudges to user.
    normalize_openai_system_order(messages.iter().map(message_to_openai).collect())
}

fn openai_plain_text(content: &Option<Value>) -> String {
    match content {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

/// Templates Jinja stricts (Qwen3 / LiteLLM) : un seul `system`, en tête.
///
/// - Fusionne tous les `system` **de tête** en un seul message initial.
/// - Réécrit tout `system` ultérieur (nudges agent) en `user` préfixé.
fn normalize_openai_system_order(messages: Vec<OpenAiMessage>) -> Vec<OpenAiMessage> {
    let mut leading_systems: Vec<String> = Vec::new();
    let mut rest: Vec<OpenAiMessage> = Vec::new();
    let mut seen_non_system = false;

    for mut m in messages {
        if m.role == "system" {
            let text = openai_plain_text(&m.content);
            if !seen_non_system {
                if !text.is_empty() {
                    leading_systems.push(text);
                }
            } else {
                m.role = "user".into();
                m.content = Some(Value::String(if text.is_empty() {
                    "[System reminder]".into()
                } else {
                    format!("[System reminder]\n{text}")
                }));
                rest.push(m);
            }
            continue;
        }
        seen_non_system = true;
        rest.push(m);
    }

    let mut out = Vec::with_capacity(rest.len() + usize::from(!leading_systems.is_empty()));
    if !leading_systems.is_empty() {
        out.push(OpenAiMessage {
            role: "system".into(),
            content: Some(Value::String(leading_systems.join("\n\n"))),
            tool_calls: Vec::new(),
            tool_call_id: None,
        });
    }
    out.extend(rest);
    out
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
        let req = build_request("m", &msgs, &opts, None, None, None, None, 0, None, None);
        assert_eq!(req.tools.len(), 1);
        assert!(req.stream);
    }

    #[test]
    fn openai_coalesce_leading_systems_and_rewrite_mid_conversation_system() {
        let messages = vec![
            Message::system("Tu es Drox."),
            Message::system("Objectif: tester."),
            Message::user("Salut"),
            Message::assistant("…thinking…"),
            Message::system("Continue — des to-dos sont ouvertes."),
        ];
        let opts = ChatOptions::default();
        let req = build_request("m", &messages, &opts, None, None, None, None, 0, None, None);
        assert_eq!(req.messages.len(), 4);
        assert_eq!(req.messages[0].role, "system");
        let sys = req.messages[0]
            .content
            .as_ref()
            .and_then(|v| v.as_str())
            .unwrap_or("");
        assert!(sys.contains("Tu es Drox."));
        assert!(sys.contains("Objectif: tester."));
        assert_eq!(req.messages[1].role, "user");
        assert_eq!(req.messages[2].role, "assistant");
        assert_eq!(req.messages[3].role, "user");
        let reminder = req.messages[3]
            .content
            .as_ref()
            .and_then(|v| v.as_str())
            .unwrap_or("");
        assert!(
            reminder.starts_with("[System reminder]"),
            "mid-conversation system must become user reminder, got {reminder:?}"
        );
        assert_eq!(
            req.messages.iter().filter(|m| m.role == "system").count(),
            1,
            "exactly one system message, at the beginning"
        );
    }
}
