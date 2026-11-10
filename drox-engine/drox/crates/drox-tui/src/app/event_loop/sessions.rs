//! Liste des sessions hors TUI.

use anyhow::Context;
use drox_session::{default_sessions_dir, list_sessions};

/// Liste les sessions puis quitte (mode `--list-sessions`).
pub async fn print_sessions_list(session_dir: Option<camino::Utf8PathBuf>) -> anyhow::Result<()> {
    let dir = match session_dir {
        Some(d) => d,
        None => default_sessions_dir().context("répertoire sessions")?,
    };
    let entries = list_sessions(&dir).await.context("liste sessions")?;
    if entries.is_empty() {
        println!("(aucune session)");
    } else {
        for e in entries {
            println!("{} — {} o — {:?}", e.id, e.size_bytes, e.path);
        }
    }
    Ok(())
}
