//! Fichier `DROX.md` à la racine du workspace (instructions projet humain).

use camino::Utf8Path;

use crate::error::SessionError;

const DROX: &str = "DROX.md";

/// Contenu optionnel du memdir projet.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MemdirFiles {
    pub drox_md: Option<String>,
}

/// Lit `DROX.md` s'il existe sous `workspace`.
pub async fn load_memdir(workspace: &Utf8Path) -> Result<MemdirFiles, SessionError> {
    let drox_path = workspace.join(DROX);

    let drox_md = match tokio::fs::read_to_string(drox_path.as_std_path()).await {
        Ok(s) if !s.trim().is_empty() => Some(s),
        Ok(_) => None,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };

    Ok(MemdirFiles { drox_md })
}

/// Préfixe texte à injecter dans le system prompt (si non vide).
#[must_use]
pub fn memdir_system_prefix(files: &MemdirFiles) -> Option<String> {
    files.drox_md.as_ref().map(|d| {
        format!(
            "The following project instructions file is available:\n\n--- DROX.md ---\n{d}\n"
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn loads_drox_md_only() {
        let dir = tempdir().unwrap();
        let root = Utf8Path::from_path(dir.path()).unwrap();
        tokio::fs::write(root.join(DROX).as_std_path(), "# project\nship it")
            .await
            .unwrap();
        let m = load_memdir(root).await.unwrap();
        assert!(m.drox_md.as_ref().is_some_and(|s| s.contains("ship it")));
        let p = memdir_system_prefix(&m).unwrap();
        assert!(p.contains("DROX.md"));
    }

    #[tokio::test]
    async fn empty_when_missing() {
        let dir = tempdir().unwrap();
        let root = Utf8Path::from_path(dir.path()).unwrap();
        let m = load_memdir(root).await.unwrap();
        assert!(m.drox_md.is_none());
        assert!(memdir_system_prefix(&m).is_none());
    }
}
