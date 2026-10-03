//! Helpers privés : condensé transcript, troncature, extraction métadonnées.

use std::fmt::Write as _;

use drox_tools::SessionNote;
use drox_types::{Content, Message, Role};

use tracing::debug;

use super::types::{CompactionConfig, TRUNCATE_SUFFIX};

/// Aplatit la conversation en un blob texte signé par rôle. Coupe les
/// `tool_result` trop gros (le modèle de compaction n'en a pas besoin du
/// dump complet, juste de l'intention).
///
/// Format produit :
///
/// ```text
/// === Conversation transcript ===
/// [user] Help me refactor the auth layer
/// [assistant] [phase: reading] …
/// [assistant tool_call] file_read { "path": "src/auth.rs" }
/// [tool_result tool_id=abc] (1234 bytes) <troncated content>
/// [assistant] [phase: planning] …
/// …
///
/// === Pinned notes from the model ===
/// - Décision sqlx > diesel : compat tokio
/// ```
pub(crate) fn condense_messages_for_summary(
    messages: &[Message],
    notes: &[SessionNote],
    config: &CompactionConfig,
    for_live_summarize: bool,
) -> String {
    let tool_truncate = if for_live_summarize {
        config.summarize_tool_result_truncate_chars
    } else {
        config.tool_result_truncate_chars
    };
    let mut out = String::with_capacity(messages.len() * 256);
    out.push_str("=== Conversation transcript ===\n");
    for msg in messages {
        let role_tag = match msg.role {
            Role::System => "system",
            Role::User => "user",
            Role::Assistant => "assistant",
            Role::Tool => "tool_result",
        };
        for block in &msg.content {
            match block {
                Content::Text { text } => {
                    if text.trim().is_empty() {
                        continue;
                    }
                    let _ = writeln!(out, "[{role_tag}] {text}");
                }
                Content::Image { mime, data } => {
                    let _ = writeln!(
                        out,
                        "[{role_tag} image] {mime} ({} bytes base64)",
                        data.len()
                    );
                }
                Content::ToolUse { name, input, .. } => {
                    let args = serde_json::to_string(input).unwrap_or_else(|_| "{}".into());
                    let args_truncated = truncate_chars(&args, 400);
                    let _ = writeln!(out, "[assistant tool_call] {name} {args_truncated}");
                }
                Content::ToolResult {
                    tool_use_id,
                    content,
                    is_error,
                } => {
                    let len_hint = content.len();
                    let body = truncate_chars(content, tool_truncate);
                    let err_tag = if *is_error { " ERROR" } else { "" };
                    let _ = writeln!(
                        out,
                        "[tool_result id={tool_use_id}{err_tag}] ({len_hint} bytes) {body}",
                    );
                }
                _ => {}
            }
        }
    }
    if !notes.is_empty() {
        out.push_str("\n=== Pinned notes from the model (session_note) ===\n");
        for n in notes {
            let _ = writeln!(out, "- {}", n.content);
        }
    }
    out
}

/// Tronque une string en caractères (pas en bytes, important pour UTF-8).
/// Ajoute un suffixe explicite si tronqué.
pub(crate) fn truncate_chars(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max_chars).collect();
    out.push_str(TRUNCATE_SUFFIX);
    out
}

/// Extrait l'`objective` (1 ligne) et la liste `files_touched` du markdown
/// produit par le modèle.
///
/// Conventions attendues (cf. `COMPACTION_PROMPT`) :
///
/// - `## Objective` (ou `## Objectif`) puis le contenu sur les lignes
///   suivantes — on prend la **première ligne non vide** de cette section.
/// - `## Files touched` (ou `## Fichiers touchés`) puis une liste markdown
///   `- path/un` / `- path/deux`.
///
/// Tolérant : si une section manque, on dégrade silencieusement (chaîne
/// vide / vec vide). Le body markdown brut reste persisté.
pub(crate) fn extract_metadata(markdown: &str) -> (String, Vec<String>) {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut objective = String::new();
    let mut files: Vec<String> = Vec::new();
    let mut state = SectionState::Other;
    for line in lines {
        let trimmed = line.trim();
        if let Some(h) = trimmed.strip_prefix("## ").or_else(|| trimmed.strip_prefix("# ")) {
            let head = h.trim().to_ascii_lowercase();
            state = match head.as_str() {
                "objective" | "objectif" | "goal" => SectionState::Objective,
                "files touched"
                | "files_touched"
                | "fichiers touchés"
                | "fichiers touches"
                | "fichiers" => SectionState::Files,
                _ => SectionState::Other,
            };
            continue;
        }
        match state {
            SectionState::Objective => {
                if objective.is_empty() && !trimmed.is_empty() {
                    objective = trimmed.trim_start_matches("- ").trim().to_string();
                }
            }
            SectionState::Files => {
                if let Some(item) = trimmed.strip_prefix("- ") {
                    let path = item.trim().trim_matches(|c: char| c == '`' || c == '"');
                    if !path.is_empty() {
                        files.push(path.to_string());
                    }
                }
            }
            SectionState::Other => {}
        }
    }
    debug!(
        objective_len = objective.len(),
        files_count = files.len(),
        "compaction: metadata extracted from summary"
    );
    (objective, files)
}

#[derive(Clone, Copy)]
enum SectionState {
    Objective,
    Files,
    Other,
}

