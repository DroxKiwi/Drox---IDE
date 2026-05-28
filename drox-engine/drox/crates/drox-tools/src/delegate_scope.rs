//! Comptage synchrone pour gate `delegate_executor` (scope trop large).

use std::path::Path;

use camino::{Utf8Path, Utf8PathBuf};
use drox_session::DroxIgnoreMatcher;
use glob::glob;

use crate::path_util::resolve_under_workspace;

/// Plafond de fichiers par délégation exécuteur (gate architecte).
pub const DELEGATE_SCOPE_MAX_FILES: usize = 50;

/// Compte les fichiers sous les chemins `scope` (s'arrête à `limit + 1`).
#[must_use]
pub fn count_files_in_delegate_scope(
    workspace: &Utf8Path,
    scope_paths: &[String],
    drox_ignore: Option<&DroxIgnoreMatcher>,
    limit: usize,
) -> usize {
    let mut total = 0usize;
    for raw in scope_paths {
        if total > limit {
            break;
        }
        let trimmed = raw.trim().replace('\\', "/");
        if trimmed.is_empty() {
            continue;
        }
        let Ok(resolved) = resolve_under_workspace(workspace, &trimmed) else {
            continue;
        };
        if resolved.is_file() {
            if !is_ignored_path(workspace, &resolved, drox_ignore) {
                total += 1;
            }
            continue;
        }
        if !resolved.is_dir() {
            continue;
        }
        let mut pattern = resolved.join("**/*").to_string();
        if pattern.contains('\\') {
            pattern = pattern.replace('\\', "/");
        }
        let Ok(entries) = glob(&pattern) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(utf) = Utf8PathBuf::from_path_buf(entry) else {
                continue;
            };
            if !utf.is_file() {
                continue;
            }
            if is_ignored_path(workspace, &utf, drox_ignore) {
                continue;
            }
            total += 1;
            if total > limit {
                return total;
            }
        }
    }
    total
}

fn is_ignored_path(
    workspace: &Utf8Path,
    abs: &Utf8Path,
    drox_ignore: Option<&DroxIgnoreMatcher>,
) -> bool {
    let Some(m) = drox_ignore else {
        return false;
    };
    let Ok(rel) = abs.strip_prefix(workspace) else {
        return m.is_ignored(abs.as_std_path());
    };
    m.is_ignored(Path::new(rel.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn counts_files_under_scope_dir() {
        let dir = tempdir().unwrap();
        let root = Utf8Path::from_path(dir.path()).unwrap();
        let comp = root.join("src/components");
        fs::create_dir_all(comp.join("ui").as_std_path()).unwrap();
        for i in 0..5 {
            fs::write(comp.join(format!("C{i}.tsx")).as_std_path(), "x").unwrap();
        }
        fs::write(comp.join("ui/B.tsx").as_std_path(), "x").unwrap();
        let n = count_files_in_delegate_scope(
            root,
            &["src/components".into()],
            None,
            DELEGATE_SCOPE_MAX_FILES,
        );
        assert_eq!(n, 6);
    }

    #[test]
    fn stops_at_limit_plus_one() {
        let dir = tempdir().unwrap();
        let root = Utf8Path::from_path(dir.path()).unwrap();
        let comp = root.join("src/components");
        fs::create_dir_all(&comp).unwrap();
        for i in 0..60 {
            fs::write(comp.join(format!("C{i}.tsx")).as_std_path(), "x").unwrap();
        }
        let n = count_files_in_delegate_scope(
            root,
            &["src/components".into()],
            None,
            DELEGATE_SCOPE_MAX_FILES,
        );
        assert_eq!(n, 51);
    }
}
