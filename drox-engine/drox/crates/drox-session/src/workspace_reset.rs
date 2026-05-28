//! Réinitialisation des données Drox **locales au workspace** (sessions chat, carte, mémoire).

use camino::Utf8Path;

use crate::error::SessionError;
use crate::paths::workspace_sessions_dir;

const WORKSPACE_MAP_FILE: &str = "workspace-map.json";
const LONG_MEMORY_SUBDIR: &str = "long-memory";
const MEMORY_SESSIONS_SUBDIR: &str = "memory/sessions";
const ATTACHMENTS_SUBDIR: &str = "attachments";
const COURSE_CYCLES_SUBDIR: &str = "course-cycles";
/// Rapports `.md` exécuteur / sous-agents (aligné `drox_tools::AGENT_OUTPUT_DIR`).
const AGENT_OUTPUT_SUBDIR: &str = "agent-output";

/// Statistiques renvoyées après [`reset_workspace_drox_data`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkspaceResetStats {
    pub sessions_files_removed: usize,
    pub workspace_map_removed: bool,
    pub long_memory_cleared: bool,
    pub memory_sessions_files_removed: usize,
    pub attachments_cleared: bool,
    pub course_cycles_cleared: bool,
    pub agent_output_cleared: bool,
}

/// Réinitialise `.drox/` pour le workspace.
///
/// Supprime **tout** le contenu de `.drox/` sauf `.drox/.env`.
pub async fn reset_workspace_drox_data(workspace: &Utf8Path) -> Result<WorkspaceResetStats, SessionError> {
    let drox_dir = workspace.join(".drox");
    let mut stats = WorkspaceResetStats::default();

    stats.sessions_files_removed = count_session_artifacts(&workspace_sessions_dir(workspace)).await;
    stats.workspace_map_removed = drox_dir.join(WORKSPACE_MAP_FILE).exists();
    stats.long_memory_cleared = drox_dir.join(LONG_MEMORY_SUBDIR).exists();
    stats.memory_sessions_files_removed = count_md_files(&drox_dir.join(MEMORY_SESSIONS_SUBDIR)).await;
    stats.attachments_cleared = drox_dir.join(ATTACHMENTS_SUBDIR).exists();
    stats.course_cycles_cleared = drox_dir.join(COURSE_CYCLES_SUBDIR).exists();
    stats.agent_output_cleared = drox_dir.join(AGENT_OUTPUT_SUBDIR).exists();

    clear_drox_dir_except_env(&drox_dir).await?;

    Ok(stats)
}

async fn count_session_artifacts(dir: &Utf8Path) -> usize {
    let Ok(mut read) = tokio::fs::read_dir(dir.as_std_path()).await else {
        return 0;
    };
    let mut n = 0usize;
    while let Ok(Some(entry)) = read.next_entry().await {
        let name = entry.file_name();
        let s = name.to_string_lossy();
        if s.starts_with("ses_") && (s.ends_with(".jsonl") || s.ends_with(".ui-stats.json")) {
            n += 1;
        }
    }
    n
}

async fn count_md_files(dir: &Utf8Path) -> usize {
    let Ok(mut read) = tokio::fs::read_dir(dir.as_std_path()).await else {
        return 0;
    };
    let mut n = 0usize;
    while let Ok(Some(entry)) = read.next_entry().await {
        if entry
            .path()
            .extension()
            .is_some_and(|e| e == "md")
        {
            n += 1;
        }
    }
    n
}

async fn clear_drox_dir_except_env(drox_dir: &Utf8Path) -> Result<(), SessionError> {
    let Ok(mut read) = tokio::fs::read_dir(drox_dir.as_std_path()).await else {
        return Ok(());
    };
    while let Some(entry) = read.next_entry().await? {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == ".env" {
            continue;
        }
        let file_type = entry.file_type().await?;
        if file_type.is_dir() {
            tokio::fs::remove_dir_all(entry.path()).await?;
        } else {
            tokio::fs::remove_file(entry.path()).await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use crate::paths::transcript_path;
    use drox_types::SessionId;

    #[tokio::test]
    async fn reset_removes_sessions_map_attachments_and_cycles() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = Utf8PathBuf::try_from(tmp.path().join("ws")).unwrap();
        tokio::fs::create_dir_all(ws.join(".drox").join("sessions").as_std_path())
            .await
            .unwrap();
        tokio::fs::create_dir_all(ws.join(".drox").join("attachments").as_std_path())
            .await
            .unwrap();
        tokio::fs::create_dir_all(ws.join(".drox").join("course-cycles").join("c1").as_std_path())
            .await
            .unwrap();
        tokio::fs::create_dir_all(ws.join(".drox").join("agent-output").join("t2").as_std_path())
            .await
            .unwrap();
        tokio::fs::write(
            ws.join(".drox")
                .join("agent-output")
                .join("t2")
                .join("rapport.md")
                .as_std_path(),
            b"# rapport",
        )
        .await
        .unwrap();
        let id = SessionId::from_string("ses_testreset00001".into());
        let p = transcript_path(&workspace_sessions_dir(&ws), &id);
        tokio::fs::write(p.as_std_path(), b"{}\n").await.unwrap();
        tokio::fs::write(
            ws.join(".drox").join(WORKSPACE_MAP_FILE).as_std_path(),
            br#"{"version":1,"nodes":[]}"#,
        )
        .await
        .unwrap();
        tokio::fs::write(ws.join(".drox").join(".env").as_std_path(), b"DROX_SERVER=http://127.0.0.1:11434")
            .await
            .unwrap();
        tokio::fs::write(ws.join(".drox").join("random.tmp").as_std_path(), b"x")
            .await
            .unwrap();

        let stats = reset_workspace_drox_data(&ws).await.unwrap();
        assert!(stats.workspace_map_removed);
        assert!(stats.attachments_cleared);
        assert!(stats.course_cycles_cleared);
        assert!(stats.agent_output_cleared);
        assert!(!ws.join(".drox").join(WORKSPACE_MAP_FILE).exists());
        assert!(!ws.join(".drox").join("attachments").exists());
        assert!(!ws.join(".drox").join("course-cycles").exists());
        assert!(!ws.join(".drox").join("agent-output").exists());
        assert!(!ws.join(".drox").join("random.tmp").exists());
        assert!(ws.join(".drox").join(".env").exists());
    }
}
