//! Assainissement des messages utilisateur (format legacy IDE) — pas d'interprétation du contenu.

use drox_types::{Content, Message, Role};

const LEGACY_USER_HEADERS: &[&str] = &["## User request", "## User"];

/// Objectif initial verrouillé quand le message user décrit une tâche concrète.
#[must_use]
pub fn initial_run_objective_for_concrete_edit(user_prompt: &str) -> Option<String> {
    const MAX: usize = 320;
    let literal = sanitize_architect_user_prompt(user_prompt);
    let t = literal.trim();
    if t.is_empty() {
        return None;
    }
    if t.chars().count() <= MAX {
        return Some(t.to_string());
    }
    Some(t.chars().take(MAX).collect())
}

/// Assainit les messages `user` d'un transcript session (retire `## Reminder` legacy).
pub fn sanitize_transcript_user_messages(messages: &mut [Message]) {
    for m in messages {
        if m.role != Role::User {
            continue;
        }
        for block in &mut m.content {
            if let Content::Text { text } = block {
                *text = sanitize_architect_user_prompt(text);
            }
        }
    }
}

/// Retire les en-têtes legacy (`## User request`, `## Reminder`, …) et ne garde que la demande littérale.
#[must_use]
pub fn sanitize_architect_user_prompt(raw: &str) -> String {
    let normalized = raw.replace("\r\n", "\n");
    let without_reminder = strip_section(&normalized, "## Reminder");
    let mut body = without_reminder.trim().to_string();
    for header in LEGACY_USER_HEADERS {
        if let Some(extracted) = extract_section_body(&body, header) {
            body = extracted;
            break;
        }
    }
    body.trim().to_string()
}

fn strip_section(text: &str, header: &str) -> String {
    let Some(idx) = text.find(header) else {
        return text.to_string();
    };
    let mut out = text[..idx].trim_end().to_string();
    let rest = &text[idx + header.len()..];
    if let Some(next) = rest.find("\n## ") {
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(rest[next + 1..].trim_start());
    }
    out
}

fn extract_section_body(text: &str, header: &str) -> Option<String> {
    let idx = text.find(header)?;
    let rest = &text[idx + header.len()..];
    let body_start = rest.strip_prefix('\n').unwrap_or(rest);
    let end = body_start.find("\n## ").unwrap_or(body_start.len());
    Some(body_start[..end].trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_legacy_reminder() {
        let raw = "## User request\n\nSalut\n\n## Reminder\nYou are the **Architect**. Call `workspace_map_read`";
        assert_eq!(sanitize_architect_user_prompt(raw), "Salut");
    }

    #[test]
    fn sanitize_keeps_modern_user_header() {
        assert_eq!(sanitize_architect_user_prompt("## User\n\nSalut"), "Salut");
    }

    #[test]
    fn initial_run_objective_from_diagnostic_user_message() {
        let raw = "## User\n\n**Diagnostic (error)** — `./src/foo.tsx:85:7`\n\nCan you help me fix this issue?";
        let obj = initial_run_objective_for_concrete_edit(raw).expect("objective");
        assert!(obj.contains("Diagnostic"));
        assert!(obj.contains("fix this issue"));
    }
}
