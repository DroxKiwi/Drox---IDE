//! Copie envoyée au modèle. Le transcript et l'UI gardent le détail.

use std::collections::HashMap;

use drox_types::{Content, Message, Role, ToolUseId};
use serde_json::Value;

use super::situation::{normalize_path_key, path_from_file_tool};

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
/// résumée ; une lecture d'avant une écriture appliquée du même chemin aussi.
/// Seul le dernier `bash` reste entier : les précédents tiennent en une ligne.
/// Deux messages user identiques à la suite n'en font qu'un.
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
    let mut file_reads: Vec<(usize, usize, String, String)> = Vec::new();
    let mut last_read_for_path: HashMap<String, usize> = HashMap::new();
    let mut write_paths: HashMap<ToolUseId, String> = HashMap::new();
    let mut writes: Vec<(usize, usize, String)> = Vec::new();
    let mut bash_commands: HashMap<ToolUseId, String> = HashMap::new();
    let mut bash_results: Vec<(usize, usize)> = Vec::new();

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
                    if let Some(path) = path_from_file_tool(name, input) {
                        write_paths.insert(id.clone(), normalize_path_key(&path));
                    }
                    if name == "bash" {
                        if let Some(command) = input.get("command").and_then(Value::as_str) {
                            bash_commands.insert(id.clone(), command.to_string());
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
                        let did_apply = result_confirms_apply(content);
                        applied.insert(tool_use_id.clone(), did_apply);
                        if did_apply {
                            if let Some(path) = write_paths.get(tool_use_id) {
                                writes.push((mi, bi, path.clone()));
                            }
                        }
                    }
                    if name == "bash" {
                        bash_results.push((mi, bi));
                    }
                    if name == "file_read" && content.len() > SLIM_RESULT_CHARS {
                        if let Some(path) = read_paths.get(tool_use_id) {
                            let slot = file_reads.len();
                            let key = normalize_path_key(path);
                            last_read_for_path.insert(key.clone(), slot);
                            file_reads.push((mi, bi, path.clone(), key));
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
    for (idx, (mi, bi, path, key)) in file_reads.iter().enumerate() {
        let superseded = writes.iter().any(|(wmi, wbi, wpath)| {
            wpath == key && (*wmi > *mi || (*wmi == *mi && *wbi > *bi))
        });
        if !superseded && last_read_for_path.get(key) == Some(&idx) {
            continue;
        }
        if let Content::ToolResult { content, .. } = &mut messages[*mi].content[*bi] {
            let n = content.len();
            *content = if superseded {
                format!(
                    "earlier file_read of {path} omitted ({n} chars) — a later write replaced this copy"
                )
            } else {
                format!("earlier file_read of {path} omitted ({n} chars)")
            };
        }
    }
    let last_bash = bash_results.len().saturating_sub(1);
    for (idx, (mi, bi)) in bash_results.iter().enumerate() {
        if idx == last_bash {
            continue;
        }
        let command = match &messages[*mi].content[*bi] {
            Content::ToolResult { tool_use_id, .. } => {
                bash_commands.get(tool_use_id).map(String::as_str)
            }
            _ => None,
        };
        if let Content::ToolResult { content, .. } = &mut messages[*mi].content[*bi] {
            *content = bash_one_liner(content, command.unwrap_or(""));
        }
    }
}

fn bash_one_liner(content: &str, command: &str) -> String {
    let cmd = one_line(command, 100);
    let (exit, stdout) = bash_exit_and_stdout(content);
    let detail = one_line(&stdout, 80);
    match exit {
        Some(code) if !detail.is_empty() => {
            format!("earlier bash omitted (exit {code}): {cmd} — {detail}")
        }
        Some(code) if !cmd.is_empty() => format!("earlier bash omitted (exit {code}): {cmd}"),
        Some(code) => format!("earlier bash omitted (exit {code})"),
        None if !cmd.is_empty() => format!("earlier bash omitted: {cmd}"),
        None => format!("earlier bash omitted ({} chars)", content.len()),
    }
}

fn bash_exit_and_stdout(content: &str) -> (Option<i64>, String) {
    let Some(start) = content.find('{') else {
        return (None, String::new());
    };
    let Ok(value) = serde_json::from_str::<Value>(&content[start..]) else {
        return (None, String::new());
    };
    let exit = value.get("exit_code").and_then(Value::as_i64);
    let stdout = value
        .get("stdout")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    (exit, stdout)
}

fn one_line(text: &str, max: usize) -> String {
    let flat: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= max {
        return flat;
    }
    let cut = flat.chars().take(max).collect::<String>();
    format!("{cut}…")
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
    fn write_supersedes_earlier_file_read_and_old_bash_is_one_line() {
        let big = "x".repeat(500);
        let (read_id, read_use) = call("file_read", json!({"path": "atelier_rust/src/json.rs"}));
        let (write_id, write_use) = call(
            "file_write",
            json!({"path": "atelier_rust/src/json.rs", "content": "new"}),
        );
        let (bash1, bash_use1) = call("bash", json!({"command": "atelier.exe devis PL-04"}));
        let (bash2, bash_use2) = call("bash", json!({"command": "atelier.exe devis PL-11"}));
        let err = r#"remote tool error: {"command":"atelier.exe devis PL-04","exit_code":1,"stdout":"erreur : pièce sans code\n"}"#;
        let messages = vec![
            Message::new(Role::Assistant, vec![read_use]),
            Message::new(Role::Tool, vec![result(read_id, &big)]),
            Message::new(Role::Assistant, vec![write_use]),
            Message::new(
                Role::Tool,
                vec![result(write_id, r#"{"applied":true,"bytes_written":3}"#)],
            ),
            Message::new(Role::Assistant, vec![bash_use1]),
            Message::new(Role::Tool, vec![result(bash1, err)]),
            Message::new(Role::Assistant, vec![bash_use2]),
            Message::new(Role::Tool, vec![result(bash2, err)]),
        ];
        let out = for_model(&messages);
        match &out[1].content[0] {
            Content::ToolResult { content, .. } => {
                assert!(content.contains("later write replaced this copy"));
            }
            _ => panic!("read"),
        }
        match &out[5].content[0] {
            Content::ToolResult { content, .. } => {
                assert!(content.starts_with("earlier bash omitted (exit 1):"));
                assert!(content.contains("PL-04"));
                assert!(content.contains("pièce sans code"));
                assert!(!content.contains("remote tool error"));
            }
            _ => panic!("bash1"),
        }
        match &out[7].content[0] {
            Content::ToolResult { content, .. } => assert!(content.contains("remote tool error")),
            _ => panic!("bash2"),
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
