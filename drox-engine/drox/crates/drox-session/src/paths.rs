//! Chemins par défaut (`~/.drox/sessions/…`).

use camino::Utf8PathBuf;

use drox_types::SessionId;

use crate::error::SessionError;

/// Transcripts chat du workspace : `<workspace>/.drox/sessions/`.
#[must_use]
pub fn workspace_sessions_dir(workspace: &camino::Utf8Path) -> Utf8PathBuf {
    workspace.join(".drox").join("sessions")
}

/// Répertoire par défaut : `~/.drox/sessions` (créé à la demande par les writers).
pub fn default_sessions_dir() -> Result<Utf8PathBuf, SessionError> {
    let home = dirs::home_dir().ok_or(SessionError::NoHomeDir)?;
    let joined = home.join(".drox").join("sessions");
    Utf8PathBuf::try_from(joined).map_err(|_| SessionError::InvalidPath)
}

/// Chemin du fichier JSONL pour une session donnée.
#[must_use]
pub fn transcript_path(sessions_dir: &camino::Utf8Path, session_id: &SessionId) -> Utf8PathBuf {
    sessions_dir.join(format!("{session_id}.jsonl"))
}

/// Fichier auxiliaire : derniers compteurs UI (↑ / ↓ / ctx) pour cette session.
#[must_use]
pub fn session_ui_stats_path(sessions_dir: &camino::Utf8Path, session_id: &SessionId) -> Utf8PathBuf {
    sessions_dir.join(format!("{session_id}.ui-stats.json"))
}
