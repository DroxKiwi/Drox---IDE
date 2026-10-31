//! Capture dev d'un appel LLM. N'est appelée que si `AgentConfig::run_capture`.

use std::collections::HashMap;
use std::sync::OnceLock;

use camino::Utf8Path;
use drox_prompts::{all_entries, PromptIntent};
use drox_types::{Content, Message, Role};
use serde_json::{json, Value};
use tokio::fs::OpenOptions;
use tokio::io::AsyncWriteExt;
use tracing::warn;

use super::super::loop_detect::{LoopDecision, PendingToolCall, TurnOutcome};
use super::super::nudges::reply_has_textual_tool_call;

pub(super) fn loop_decision_label(decision: LoopDecision) -> &'static str {
    match decision {
        LoopDecision::Ok => "ok",
        LoopDecision::Warn { .. } => "warn",
        LoopDecision::ForceConclude { .. } => "force_conclude",
        LoopDecision::SyntheticDone { .. } => "synthetic_done",
    }
}

pub(super) async fn append_llm_request(
    path: &Utf8Path,
    turn: usize,
    loop_label: &str,
    before: &[Message],
    transport: &[Message],
) {
    let names = tool_names(transport);
    let messages: Vec<Value> = transport
        .iter()
        .map(|message| message_record(message, &names))
        .collect();
    let record = json!({
        "kind": "llm_request",
        "turn": turn,
        "loop": loop_label,
        "beforeChars": message_chars(before),
        "transportChars": message_chars(transport),
        "duplicateUsersDropped": duplicate_user_pairs(before),
        "danglingToolCalls": dangling_tool_calls(transport),
        "messages": messages,
    });
    append_line(path, &record).await;
}

pub(super) async fn append_llm_result(path: &Utf8Path, turn: usize, outcome: &TurnOutcome) {
    let record = json!({
        "kind": "llm_result",
        "turn": turn,
        "inputTokens": outcome.usage.input_tokens,
        "outputTokens": outcome.usage.output_tokens,
        "phase": outcome.final_phase.map(|phase| phase.as_marker()).unwrap_or(""),
        "textualTool": reply_has_textual_tool_call(&outcome.text),
        "assistantChars": outcome.text.chars().count(),
        "toolCalls": tool_call_groups(&outcome.tool_calls),
    });
    append_line(path, &record).await;
}

async fn append_line(path: &Utf8Path, record: &Value) {
    let line = match serde_json::to_string(record) {
        Ok(mut line) => {
            line.push('\n');
            line
        }
        Err(error) => {
            warn!(%error, "run capture: json");
            return;
        }
    };
    if let Some(parent) = path.parent() {
        if let Err(error) = tokio::fs::create_dir_all(parent.as_std_path()).await {
            warn!(%error, "run capture: dossier");
            return;
        }
    }
    let mut file = match OpenOptions::new()
        .create(true)
        .append(true)
        .open(path.as_std_path())
        .await
    {
        Ok(file) => file,
        Err(error) => {
            warn!(%error, "run capture: ouverture");
            return;
        }
    };
    if let Err(error) = file.write_all(line.as_bytes()).await {
        warn!(%error, "run capture: écriture");
    }
}

fn message_chars(messages: &[Message]) -> usize {
    messages.iter().map(one_message_chars).sum()
}

fn one_message_chars(message: &Message) -> usize {
    message
        .content
        .iter()
        .map(|block| match block {
            Content::Text { text } | Content::ToolResult { content: text, .. } => text.chars().count(),
            Content::ToolUse { input, .. } => input.to_string().chars().count(),
            Content::Image { data, .. } => data.len(),
            _ => 0,
        })
        .sum()
}

fn duplicate_user_pairs(messages: &[Message]) -> u32 {
    let mut dropped = 0u32;
    let mut previous: Option<String> = None;
    for message in messages {
        if message.role != Role::User {
            previous = None;
            continue;
        }
        let text = Content::collapse_text(&message.content);
        if previous.as_deref() == Some(text.as_str()) {
            dropped = dropped.saturating_add(1);
        }
        previous = Some(text);
    }
    dropped
}

fn tool_names(messages: &[Message]) -> HashMap<String, String> {
    let mut names = HashMap::new();
    for message in messages {
        for block in &message.content {
            if let Content::ToolUse { id, name, .. } = block {
                names.insert(id.as_str().to_string(), name.clone());
            }
        }
    }
    names
}

fn dangling_tool_calls(messages: &[Message]) -> bool {
    let mut open = Vec::new();
    for message in messages {
        for block in &message.content {
            match block {
                Content::ToolUse { id, .. } => open.push(id.as_str().to_string()),
                Content::ToolResult { tool_use_id, .. } => {
                    open.retain(|id| id != tool_use_id.as_str());
                }
                _ => {}
            }
        }
    }
    !open.is_empty()
}

fn message_record(message: &Message, names: &HashMap<String, String>) -> Value {
    let chars = one_message_chars(message);
    match message.role {
        Role::System => {
            let text = Content::collapse_text(&message.content);
            let (id, kind) = classify_system(&text);
            json!({
                "role": "system",
                "id": id,
                "kind": kind,
                "chars": chars,
                "text": text,
            })
        }
        Role::User => json!({
            "role": "user",
            "chars": chars,
            "text": Content::collapse_text(&message.content),
        }),
        Role::Assistant => {
            let tools: Vec<&str> = message
                .content
                .iter()
                .filter_map(|block| match block {
                    Content::ToolUse { name, .. } => Some(name.as_str()),
                    _ => None,
                })
                .collect();
            json!({
                "role": "assistant",
                "chars": chars,
                "text": Content::collapse_text(&message.content),
                "tools": tools,
            })
        }
        Role::Tool => {
            let mut name = String::new();
            let mut error = false;
            let mut text = String::new();
            for block in &message.content {
                if let Content::ToolResult {
                    content,
                    is_error,
                    tool_use_id,
                } = block
                {
                    text.push_str(content);
                    error |= *is_error;
                    if name.is_empty() {
                        name = names
                            .get(tool_use_id.as_str())
                            .cloned()
                            .unwrap_or_else(|| tool_use_id.as_str().to_string());
                    }
                }
            }
            json!({
                "role": "tool",
                "name": name,
                "error": error,
                "chars": chars,
                "text": text,
            })
        }
    }
}

fn classify_system(text: &str) -> (&'static str, &'static str) {
    if let Some(found) = catalog().get(text) {
        return *found;
    }
    ("unmatched", "system")
}

fn catalog() -> &'static HashMap<String, (&'static str, &'static str)> {
    static INDEX: OnceLock<HashMap<String, (&'static str, &'static str)>> = OnceLock::new();
    INDEX.get_or_init(|| {
        let mut index = HashMap::new();
        for entry in all_entries() {
            if entry.body.contains("dynamic body") {
                continue;
            }
            let kind = match entry.intent {
                PromptIntent::Rescue => "nudge",
                _ if entry.id.contains(".core") => "prompt",
                _ => "system",
            };
            index.insert(entry.body.to_string(), (entry.id, kind));
        }
        index
    })
}

fn tool_call_groups(calls: &[PendingToolCall]) -> Vec<Value> {
    let mut order = Vec::new();
    let mut groups: HashMap<String, Group> = HashMap::new();
    for call in calls {
        let group = groups.entry(call.name.clone()).or_insert_with(|| {
            order.push(call.name.clone());
            Group {
                count: 0,
                identical: true,
                truncated: 0,
                first: String::new(),
            }
        });
        group.count = group.count.saturating_add(1);
        if call.arguments.get("_raw").is_some() {
            group.truncated = group.truncated.saturating_add(1);
        }
        let rendered = call.arguments.to_string();
        if group.first.is_empty() {
            group.first = rendered;
        } else if group.first != rendered {
            group.identical = false;
        }
    }
    order
        .into_iter()
        .filter_map(|name| {
            let group = groups.remove(&name)?;
            Some(json!({
                "name": name,
                "count": group.count,
                "identical": group.identical,
                "truncated": group.truncated,
            }))
        })
        .collect()
}

struct Group {
    count: u32,
    identical: bool,
    truncated: u32,
    first: String,
}
