//! Titre d'affichage dérivé du premier message utilisateur d'un transcript.

use camino::Utf8Path;
use drox_types::{Content, Message, Role};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::error::SessionError;
use crate::record::ChatMessageRecord;

const DEFAULT_MAX_TITLE_CHARS: usize = 48;

/// Lit le transcript JSONL jusqu'au premier message `user` avec du texte.
pub async fn peek_session_display_title(
    path: &Utf8Path,
    max_chars: Option<usize>,
) -> Result<Option<String>, SessionError> {
    let max_chars = max_chars.unwrap_or(DEFAULT_MAX_TITLE_CHARS);
    let file = match tokio::fs::File::open(path.as_std_path()).await {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let mut lines = BufReader::new(file).lines();
    while let Some(line) = lines.next_line().await? {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(rec) = serde_json::from_str::<ChatMessageRecord>(line) else {
            continue;
        };
        if !matches!(rec.message.role, Role::User) {
            continue;
        }
        let plain = message_plain_text(&rec.message);
        let trimmed = plain.trim();
        if trimmed.chars().count() >= 3 {
            return Ok(Some(truncate_display_title(trimmed, max_chars)));
        }
    }
    Ok(None)
}

fn message_plain_text(message: &Message) -> String {
    Content::collapse_text(&message.content)
}

fn truncate_display_title(input: &str, max_chars: usize) -> String {
    let one_line = input.split_whitespace().collect::<Vec<_>>().join(" ");
    let char_count = one_line.chars().count();
    if char_count <= max_chars {
        return one_line;
    }
    let mut out: String = one_line.chars().take(max_chars.saturating_sub(1)).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use drox_types::Message;
    use tempfile::tempdir;

    #[tokio::test]
    async fn peek_finds_first_user_line() {
        let dir = tempdir().unwrap();
        let p = Utf8PathBuf::from_path_buf(dir.path().join("ses_test.jsonl")).unwrap();
        let rec = ChatMessageRecord::new(&Message::user(
            "Analyser l'arborescence du projet site-kdds",
        ));
        tokio::fs::write(&p, format!("{}\n", serde_json::to_string(&rec).unwrap()))
            .await
            .unwrap();
        let title = peek_session_display_title(&p, Some(36))
            .await
            .unwrap()
            .unwrap();
        assert!(title.contains("Analyser"));
        assert!(title.ends_with('…') || title.len() <= 36);
    }
}
