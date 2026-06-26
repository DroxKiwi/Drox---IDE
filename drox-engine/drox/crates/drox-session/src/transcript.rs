//! Append-only JSONL + sink async pour le moteur.

use std::sync::Arc;

use async_trait::async_trait;
use camino::Utf8PathBuf;
use drox_types::Message;
use tokio::fs::OpenOptions;
use tokio::io::AsyncWriteExt;

use crate::error::SessionError;
use crate::record::ChatMessageRecord;

/// Écrit des lignes JSONL dans un fichier de transcript.
#[async_trait]
pub trait TranscriptSink: Send + Sync {
    /// Ajoute une ligne (message + métadonnées).
    async fn append_record(&self, record: &ChatMessageRecord) -> Result<(), SessionError>;
}

/// Sink concret : un fichier `.jsonl` (append + création récursive du parent).
pub struct JsonlTranscriptSink {
    path: Utf8PathBuf,
}

impl JsonlTranscriptSink {
    #[must_use]
    #[allow(clippy::missing_const_for_fn)] // Utf8PathBuf : pas de const stable ici
    pub fn new(path: Utf8PathBuf) -> Self {
        Self { path }
    }

    /// Partage ce sink derrière un `Arc` (pour `TranscriptSessionConfig`).
    #[must_use]
    pub fn arc(path: Utf8PathBuf) -> Arc<Self> {
        Arc::new(Self::new(path))
    }

    pub fn path(&self) -> &camino::Utf8Path {
        &self.path
    }
}

#[async_trait]
impl TranscriptSink for JsonlTranscriptSink {
    async fn append_record(&self, record: &ChatMessageRecord) -> Result<(), SessionError> {
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent.as_std_path()).await?;
        }
        let mut line = serde_json::to_string(record)?;
        line.push('\n');
        let mut f = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.path.as_std_path())
            .await?;
        f.write_all(line.as_bytes()).await?;
        f.flush().await?;
        Ok(())
    }
}

/// Lit tout le transcript et retourne les messages dans l'ordre.
///
/// Les lignes invalides ou avec un `schema_version` inconnu sont ignorées
/// (journal `tracing::warn` si la feature `tracing` est utilisée).
pub async fn read_transcript(path: &camino::Utf8Path) -> Result<Vec<Message>, SessionError> {
    let bytes = tokio::fs::read(path.as_std_path()).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            SessionError::NotFound(path.to_string())
        } else {
            e.into()
        }
    })?;
    let text = String::from_utf8_lossy(&bytes);
    let mut out = Vec::new();
    for (lineno, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<ChatMessageRecord>(line) {
            Ok(rec) if rec.schema_version == crate::record::TRANSCRIPT_SCHEMA_VERSION => {
                out.push(rec.message);
            }
            Ok(rec) => {
                tracing::warn!(
                    line = lineno + 1,
                    schema = rec.schema_version,
                    "skipping transcript line with unsupported schema_version"
                );
            }
            Err(e) => {
                tracing::warn!(line = lineno + 1, %e, "skipping malformed transcript line");
            }
        }
    }
    Ok(out)
}

/// Réécrit le transcript (remplace le fichier).
pub async fn write_transcript(
    path: &camino::Utf8Path,
    messages: &[Message],
) -> Result<(), SessionError> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent.as_std_path()).await?;
    }
    let mut buf = String::new();
    for msg in messages {
        let record = ChatMessageRecord::new(msg);
        buf.push_str(&serde_json::to_string(&record)?);
        buf.push('\n');
    }
    tokio::fs::write(path.as_std_path(), buf).await?;
    Ok(())
}

/// Conserve les messages jusqu'au dernier `user` inclus ; retire la suite.
#[must_use]
pub fn truncate_after_last_user(messages: &[Message]) -> Vec<Message> {
    use drox_types::Role;
    let mut last_user = None;
    for (i, msg) in messages.iter().enumerate() {
        if msg.role == Role::User {
            last_user = Some(i);
        }
    }
    match last_user {
        Some(i) => messages[..=i].to_vec(),
        None => messages.to_vec(),
    }
}

/// Configuration passée au moteur : où écrire + à partir de quel index de
/// message ignorer (reprise : ne pas ré-écrire l'historique déjà sur disque).
#[derive(Clone)]
pub struct TranscriptSessionConfig {
    pub sink: Arc<dyn TranscriptSink>,
    /// Index du premier message de `messages` à persister (0 = tout).
    pub append_from_message_index: usize,
}

impl std::fmt::Debug for TranscriptSessionConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TranscriptSessionConfig")
            .field("append_from_message_index", &self.append_from_message_index)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use drox_types::{Content, Role};
    use tempfile::tempdir;

    #[tokio::test]
    async fn append_and_roundtrip() {
        let dir = tempdir().unwrap();
        let p = Utf8PathBuf::from_path_buf(dir.path().join("t.jsonl")).unwrap();
        let sink = JsonlTranscriptSink::new(p.clone());
        let m = Message::user("hello");
        let rec = ChatMessageRecord::new(&m);
        sink.append_record(&rec).await.unwrap();
        let loaded = read_transcript(&p).await.unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].role, Role::User);
        assert_eq!(Content::collapse_text(&loaded[0].content), "hello");
    }

    #[test]
    fn truncate_after_last_user_keeps_prefix() {
        let messages = vec![
            Message::user("a"),
            Message::assistant("b"),
            Message::user("c"),
            Message::assistant("d"),
        ];
        let truncated = truncate_after_last_user(&messages);
        assert_eq!(truncated.len(), 3);
        assert_eq!(truncated[2].role, Role::User);
        assert_eq!(Content::collapse_text(&truncated[2].content), "c");
    }
}
