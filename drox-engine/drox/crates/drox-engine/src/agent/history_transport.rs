//! Copie envoyée au modèle. Le transcript et l'UI gardent le détail.

use std::collections::HashMap;

use drox_types::{Content, Message, Role, ToolUseId};
use serde_json::Value;

const SLIM_RESULT_CHARS: usize = 400;
const DROP_CALL_KEYS: &[&str] = &[
    "old_string",
    "new_string",
    "content",
    "edits",
    "old_text",
    "new_text",
];

/// Historique allégé pour l'appel LLM suivant.
///
/// Un `file_edit` / `file_write` / `notebook_edit` ne perd son corps que si
/// son résultat confirme `applied: true` et qu'un appel plus récent existe.
/// Un échec (`old_string not found`, chemin invalide) garde `edits` pour
/// que le modèle puisse corriger. Le dernier résultat `glob` / `task`
/// reste entier. Une lecture `file_read` plus ancienne du même chemin est
/// résumée. Deux messages user identiques à la suite n'en font qu'un.
pub(crate) fn for_model(messages: &[Message]) -> Vec<Message> {
    let mut out = dedupe_consecutive_users(messages);
    slim_old_payloads(&mut out);
    out
}

fn dedupe_consecutive_users(messages: &[Message]) -> Vec<Message> {
    let mut out: Vec<Message> = Vec::with_capacity(messages.len());
    for message in messages {
        if message.role == Role::User {
            if let Some(prev) = out.last() {
                if prev.role == Role::User
                    && Content::collapse_text(&prev.content)
                        == Content::collapse_text(&message.content)
                {
                    continue;
                }
            }
        }
        out.push(message.clone());
    }
    out
}

fn slim_old_payloads(messages: &mut [Message]) {
    let mut tool_names: HashMap<ToolUseId, String> = HashMap::new();
    let mut applied: HashMap<ToolUseId, bool> = HashMap::new();
    let mut last_body_call: Option<usize> = None;
    let mut last_glob: Option<usize> = None;
    let mut last_task: Option<usize> = None;
    let mut calls: Vec<(usize, usize)> = Vec::new();
    let mut results: Vec<(usize, usize, String)> = Vec::new();
    let mut read_paths: HashMap<ToolUseId, String> = HashMap::new();
    let mut file_reads: Vec<(usize, usize, String)> = Vec::new();
    let mut last_read_for_path: HashMap<String, usize> = HashMap::new();

    for (mi, message) in messages.iter().enumerate() {
        for (bi, block) in message.content.iter().enumerate() {
            match block {
                Content::ToolUse { id, name, input } => {
                    tool_names.insert(id.clone(), name.clone());
                    if name == "file_read" {
                        if let Some(path) = input.get("path").and_then(Value::as_str) {
                            read_paths.insert(id.clone(), path.to_string());
                        }
                    }
                    if is_body_call(name) {
                        last_body_call = Some(calls.len());
                        calls.push((mi, bi));
                    }
                }
                Content::ToolResult { tool_use_id, content, .. } => {
                    let Some(name) = tool_names.get(tool_use_id).cloned() else {
                        continue;
                    };
                    if is_body_call(&name) {
                        applied.insert(tool_use_id.clone(), result_confirms_apply(content));
                    }
                    if name == "file_read" && content.len() > SLIM_RESULT_CHARS {
                        if let Some(path) = read_paths.get(tool_use_id) {
                            let slot = file_reads.len();
                            last_read_for_path.insert(path.clone(), slot);
                            file_reads.push((mi, bi, path.clone()));
                        }
                    }
                    if (name == "glob" || name == "task") && content.len() > SLIM_RESULT_CHARS {
                        let slot = results.len();
                        if name == "glob" {
                            last_glob = Some(slot);
                        } else {
                            last_task = Some(slot);
                        }
                        results.push((mi, bi, name.clone()));
                    }
                }
                _ => {}
            }
        }
    }

    for (idx, (mi, bi)) in calls.iter().enumerate() {
        if Some(idx) == last_body_call {
            continue;
        }
        let id = match &messages[*mi].content[*bi] {
            Content::ToolUse { id, .. } => id.clone(),
            _ => continue,
        };
        // Pas de résultat, ou résultat non appliqué : le corps sert au retry.
        if applied.get(&id) != Some(&true) {
            continue;
        }
        slim_call_input(&mut messages[*mi].content[*bi]);
    }
    for (idx, (mi, bi, name)) in results.iter().enumerate() {
        let keep = if name == "glob" {
            last_glob == Some(idx)
        } else {
            last_task == Some(idx)
        };
        if keep {
            continue;
        }
        if let Content::ToolResult { content, .. } = &mut messages[*mi].content[*bi] {
            let n = content.len();
            *content = format!("earlier {name} result omitted ({n} chars)");
        }
    }
    for (idx, (mi, bi, path)) in file_reads.iter().enumerate() {
        if last_read_for_path.get(path) == Some(&idx) {
            continue;
        }
        if let Content::ToolResult { content, .. } = &mut messages[*mi].content[*bi] {
            let n = content.len();
            *content = format!("earlier file_read of {path} omitted ({n} chars)");
        }
    }
}

fn is_body_call(name: &str) -> bool {
    matches!(name, "file_edit" | "file_write" | "notebook_edit")
}

fn slim_call_input(block: &mut Content) {
    let Content::ToolUse { input, .. } = block else {
        return;
    };
    let Some(obj) = input.as_object() else {
        return;
    };
    let mut dropped = 0usize;
    let mut slim = obj.clone();
    for key in DROP_CALL_KEYS {
        if let Some(value) = slim.remove(*key) {
            dropped += value.to_string().len();
        }
    }
    // Un objet réduit à `path` ressemble à un nouvel appel. Le marqueur
    // dit que le corps a déjà été appliqué.
    slim.insert(
        "edit_body".into(),
        Value::String(format!("omitted after apply ({dropped} chars)")),
    );
    *input = Value::Object(slim);
}

fn result_confirms_apply(content: &str) -> bool {
    let Some(start) = content.find('{') else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<Value>(&content[start..]) else {
        return false;
    };
    value.get("applied").and_then(Value::as_bool) == Some(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_types::ToolUseId;
    use serde_json::json;

    fn call(name: &str, input: Value) -> (ToolUseId, Content) {
        let id = ToolUseId::new();
        (
            id.clone(),
            Content::ToolUse {
                id,
                name: name.into(),
                input,
            },
        )
    }

    fn result(id: ToolUseId, content: &str) -> Content {
        Content::ToolResult {
            tool_use_id: id,
            content: content.into(),
            is_error: false,
        }
    }

    #[test]
    fn drops_old_file_edit_body_keeps_last() {
        let old = json!({"path": "a.py", "old_string": "x".repeat(50), "new_string": "y".repeat(50)});
        let recent = json!({"path": "b.py", "old_string": "keep", "new_string": "me"});
        let (id1, use1) = call("file_edit", old);
        let (id2, use2) = call("file_edit", recent);
        let messages = vec![
            Message::new(Role::Assistant, vec![use1]),
            Message::new(Role::Tool, vec![result(id1, r#"{"applied":true,"edits_applied":1}"#)]),
            Message::new(Role::Assistant, vec![use2]),
            Message::new(Role::Tool, vec![result(id2, r#"{"applied":true,"edits_applied":1}"#)]),
        ];
        let out = for_model(&messages);
        match &out[0].content[0] {
            Content::ToolUse { input, .. } => {
                assert_eq!(input["path"], "a.py");
                assert!(input.get("old_string").is_none());
                assert!(input.get("new_string").is_none());
                assert!(input["edit_body"].as_str().unwrap().starts_with("omitted after apply"));
            }
            _ => panic!("tool use"),
        }
        match &out[2].content[0] {
            Content::ToolUse { input, .. } => assert_eq!(input["new_string"], "me"),
            _ => panic!("tool use"),
        }
    }

    #[test]
    fn keeps_file_edit_body_when_apply_failed() {
        let failed = json!({"path": "a.py", "old_string": "anchor", "new_string": "next"});
        let later = json!({"path": "a.py", "old_string": "other", "new_string": "try"});
        let (id1, use1) = call("file_edit", failed);
        let (_id2, use2) = call("file_edit", later);
        let messages = vec![
            Message::new(Role::Assistant, vec![use1]),
            Message::new(
                Role::Tool,
                vec![result(id1, "edit failed: edit #0: old_string not found")],
            ),
            Message::new(Role::Assistant, vec![use2]),
        ];
        let out = for_model(&messages);
        match &out[0].content[0] {
            Content::ToolUse { input, .. } => assert_eq!(input["old_string"], "anchor"),
            _ => panic!("tool use"),
        }
        match &out[2].content[0] {
            Content::ToolUse { input, .. } => assert_eq!(input["new_string"], "try"),
            _ => panic!("tool use"),
        }
    }

    #[test]
    fn keeps_latest_file_read_of_same_path() {
        let big = "x".repeat(500);
        let (a1, use1) = call("file_read", json!({"path": "atelier/pricing.py"}));
        let (a2, use2) = call("file_read", json!({"path": "atelier/pricing.py"}));
        let (b, use_b) = call("file_read", json!({"path": "main.py"}));
        let messages = vec![
            Message::new(Role::Assistant, vec![use1]),
            Message::new(Role::Tool, vec![result(a1, &big)]),
            Message::new(Role::Assistant, vec![use_b]),
            Message::new(Role::Tool, vec![result(b, &big)]),
            Message::new(Role::Assistant, vec![use2]),
            Message::new(Role::Tool, vec![result(a2, &big)]),
        ];
        let out = for_model(&messages);
        match &out[1].content[0] {
            Content::ToolResult { content, .. } => {
                assert!(content.starts_with("earlier file_read of atelier/pricing.py"));
            }
            _ => panic!("result"),
        }
        match &out[3].content[0] {
            Content::ToolResult { content, .. } => assert_eq!(content.len(), 500),
            _ => panic!("result"),
        }
        match &out[5].content[0] {
            Content::ToolResult { content, .. } => assert_eq!(content.len(), 500),
            _ => panic!("result"),
        }
    }

    #[test]
    fn drops_old_large_glob_keeps_last() {
        let big = "p".repeat(500);
        let (g1, use1) = call("glob", json!({"pattern": "*"}));
        let (g2, use2) = call("glob", json!({"pattern": "*.py"}));
        let messages = vec![
            Message::new(Role::Assistant, vec![use1]),
            Message::new(Role::Tool, vec![result(g1, &big)]),
            Message::new(Role::Assistant, vec![use2]),
            Message::new(Role::Tool, vec![result(g2, &big)]),
        ];
        let out = for_model(&messages);
        match &out[1].content[0] {
            Content::ToolResult { content, .. } => {
                assert!(content.starts_with("earlier glob result omitted"));
            }
            _ => panic!("result"),
        }
        match &out[3].content[0] {
            Content::ToolResult { content, .. } => assert_eq!(content.len(), 500),
            _ => panic!("result"),
        }
    }

    #[test]
    fn drops_consecutive_duplicate_user() {
        let messages = vec![
            Message::user("Salut"),
            Message::user("Salut"),
            Message::user("suite"),
        ];
        let out = for_model(&messages);
        assert_eq!(out.len(), 2);
        assert_eq!(Content::collapse_text(&out[0].content), "Salut");
        assert_eq!(Content::collapse_text(&out[1].content), "suite");
    }
}
