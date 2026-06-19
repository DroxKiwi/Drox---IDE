//! Arborescence `.drox/` attendue par le moteur — création discrète au démarrage d'un run.

use camino::{Utf8Path, Utf8PathBuf};

use crate::error::SessionError;

/// Sous-dossiers workspace-relative sous `.drox/`.
pub const DROX_DIR: &str = ".drox";
pub const SESSIONS_SUBDIR: &str = "sessions";
pub const AGENT_OUTPUT_SUBDIR: &str = "agent-output";
pub const MEMORY_SESSIONS_SUBDIR: &str = "memory/sessions";
pub const ATTACHMENTS_SUBDIR: &str = "attachments";
pub const LONG_MEMORY_SUBDIR: &str = "long-memory";

const AGENT_OUTPUT_README: &str = r"# Drox — sorties agent (rapports)

Les **exécuteurs éphemères** enregistrent leurs rapports `.md` **uniquement** ici :

```text
.drox/agent-output/<plan_id>/<task_id>/nom-du-rapport.md
```

Exemple : `.drox/agent-output/plan_1748301234/t2/analyse.md`

Chaque plan interne architecte reçoit un **plan_id** ; les tâches `t1`, `t2`, … vivent sous ce dossier. Un nouveau plan ne réutilise pas l'ancien `plan_id`.

Le moteur crée `<plan_id>/<task_id>/` à chaque `delegate_executor` et redirige les `file_write` `.md` hors de ce dossier.

L'**Architecte** lit ces fichiers et en recopie les extraits dans le champ `context` des délégations suivantes — les exécuteurs ne voient pas la conversation utilisateur.
";

/// Résultat de [`ensure_workspace_layout`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkspaceLayoutBootstrap {
    /// Chemins créés lors de cet appel (fichiers ou dossiers nouveaux).
    pub created: Vec<Utf8PathBuf>,
    /// Chemins déjà présents (aucune écriture).
    pub already_present: Vec<Utf8PathBuf>,
}

impl WorkspaceLayoutBootstrap {
    #[must_use]
    pub fn created_count(&self) -> usize {
        self.created.len()
    }
}

/// Assure l'arborescence `.drox/` minimale pour chat, mémoire et rapports agent.
///
/// Journalise en `info` chaque élément **créé** (debug discret côté ops, visible dans les logs moteur).
pub async fn ensure_workspace_layout(workspace: &Utf8Path) -> Result<WorkspaceLayoutBootstrap, SessionError> {
    let drox = workspace.join(DROX_DIR);
    let mut stats = WorkspaceLayoutBootstrap::default();

    let dirs = [
        drox.clone(),
        drox.join(SESSIONS_SUBDIR),
        drox.join(AGENT_OUTPUT_SUBDIR),
        drox.join(MEMORY_SESSIONS_SUBDIR),
        drox.join(ATTACHMENTS_SUBDIR),
        drox.join(LONG_MEMORY_SUBDIR),
    ];
    for dir in dirs {
        ensure_dir(&dir, &mut stats).await?;
    }

    let readme = drox.join(AGENT_OUTPUT_SUBDIR).join("README.md");
    ensure_file(&readme, AGENT_OUTPUT_README, &mut stats).await?;

    if stats.created_count() > 0 {
        tracing::info!(
            workspace = %workspace,
            created = stats.created.len(),
            paths = ?stats
                .created
                .iter()
                .map(|p| p.as_str())
                .collect::<Vec<_>>(),
            "drox: workspace layout initialized (.drox/)"
        );
    } else {
        tracing::debug!(
            workspace = %workspace,
            "drox: workspace layout already complete"
        );
    }

    Ok(stats)
}

/// Répertoire de sortie markdown pour une tâche orchestration (`plan_id` / `task_id`).
#[must_use]
pub fn agent_output_task_dir(workspace: &Utf8Path, plan_id: &str, task_id: &str) -> Utf8PathBuf {
    let plan = sanitize_task_segment(plan_id);
    let task = sanitize_task_segment(task_id);
    workspace
        .join(DROX_DIR)
        .join(AGENT_OUTPUT_SUBDIR)
        .join(plan)
        .join(task)
}

/// Ancien layout plat `.drox/agent-output/<task_id>/` (lecture legacy).
#[must_use]
pub fn agent_output_task_dir_legacy(workspace: &Utf8Path, task_id: &str) -> Utf8PathBuf {
    let segment = sanitize_task_segment(task_id);
    workspace
        .join(DROX_DIR)
        .join(AGENT_OUTPUT_SUBDIR)
        .join(segment)
}

#[must_use]
pub fn sanitize_task_segment(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "run".to_string();
    }
    trimmed
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Crée le dossier de tâche exécuteur si besoin ; log `info` à la création.
pub async fn ensure_agent_output_task_dir(
    workspace: &Utf8Path,
    plan_id: &str,
    task_id: &str,
) -> Result<Utf8PathBuf, SessionError> {
    let plan_dir = workspace
        .join(DROX_DIR)
        .join(AGENT_OUTPUT_SUBDIR)
        .join(sanitize_task_segment(plan_id));
    if !plan_dir.is_dir() {
        tokio::fs::create_dir_all(plan_dir.as_std_path())
            .await
            .map_err(SessionError::Io)?;
        tracing::info!(
            workspace = %workspace,
            plan_id = %plan_id,
            output_dir = %plan_dir,
            "drox: orchestration plan output directory created"
        );
    }
    let dir = agent_output_task_dir(workspace, plan_id, task_id);
    if !dir.is_dir() {
        tokio::fs::create_dir_all(dir.as_std_path())
            .await
            .map_err(SessionError::Io)?;
        tracing::info!(
            workspace = %workspace,
            plan_id = %plan_id,
            task_id = %task_id,
            output_dir = %dir,
            "drox: executor output directory created"
        );
    } else {
        tracing::debug!(
            plan_id = %plan_id,
            task_id = %task_id,
            output_dir = %dir,
            "drox: executor output directory ready"
        );
    }
    Ok(dir)
}

fn dir_has_markdown(dir: &Utf8Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir.as_std_path()) else {
        return false;
    };
    entries.filter_map(Result::ok).any(|e| {
        e.path()
            .extension()
            .is_some_and(|ext| ext == "md" || ext == "markdown")
    })
}

/// True si le dossier tâche contient au moins un fichier `.md` (livrable disque).
#[must_use]
pub fn agent_output_task_has_markdown(
    workspace: &Utf8Path,
    plan_id: &str,
    task_id: &str,
) -> bool {
    let dir = agent_output_task_dir(workspace, plan_id, task_id);
    if dir_has_markdown(&dir) {
        return true;
    }
    dir_has_markdown(&agent_output_task_dir_legacy(workspace, task_id))
}

async fn ensure_dir(path: &Utf8Path, stats: &mut WorkspaceLayoutBootstrap) -> Result<(), SessionError> {
    if path.is_dir() {
        stats.already_present.push(path.to_owned());
        return Ok(());
    }
    tokio::fs::create_dir_all(path.as_std_path())
        .await
        .map_err(SessionError::Io)?;
    stats.created.push(path.to_owned());
    Ok(())
}

async fn ensure_file(
    path: &Utf8Path,
    contents: &str,
    stats: &mut WorkspaceLayoutBootstrap,
) -> Result<(), SessionError> {
    if path.is_file() {
        stats.already_present.push(path.to_owned());
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        ensure_dir(parent, stats).await?;
    }
    tokio::fs::write(path.as_std_path(), contents.as_bytes())
        .await
        .map_err(SessionError::Io)?;
    stats.created.push(path.to_owned());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;

    #[tokio::test]
    async fn bootstrap_creates_agent_output_readme() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        let stats = ensure_workspace_layout(&ws).await.unwrap();
        assert!(stats.created_count() > 0);
        assert!(ws.join(".drox/agent-output/README.md").is_file());
    }

    #[tokio::test]
    async fn task_dir_and_markdown_detection() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        ensure_workspace_layout(&ws).await.unwrap();
        let dir = ensure_agent_output_task_dir(&ws, "plan_test", "t2")
            .await
            .unwrap();
        assert!(dir.is_dir());
        assert!(!agent_output_task_has_markdown(&ws, "plan_test", "t2"));
        tokio::fs::write(dir.join("r.md").as_std_path(), b"# x")
            .await
            .unwrap();
        assert!(agent_output_task_has_markdown(&ws, "plan_test", "t2"));
    }
}
