//! Validation des batches `delegate_executor` + `parallel_with`.

use std::collections::HashSet;

/// Plafond produit pour `max_parallel_executors`.
pub const MAX_PARALLEL_EXECUTORS_CAP: usize = 100;

/// Normalise un chemin workspace pour comparaison de chevauchement.
#[must_use]
pub fn normalize_scope_path(raw: &str) -> String {
    let mut p = raw.trim().replace('\\', "/");
    while p.starts_with("./") {
        p = p[2..].to_string();
    }
    p.trim_matches('/').to_lowercase()
}

/// Dernier segment ressemble à un fichier (extension) plutôt qu'à un dossier de scope.
#[must_use]
fn scope_path_looks_like_file(normalized: &str) -> bool {
    let last = normalized.rsplit('/').next().unwrap_or(normalized);
    last.contains('.') && !last.ends_with('.')
}

/// Conflit batch : même chemin, ou un scope **dossier** qui englobe l'autre.
///
/// Deux **fichiers** distincts sous le même dossier (ex. `src/a.ts` + `src/b.ts`) ne
/// se chevauchent pas — l'ancienne règle « tout préfixe commun » bloquait à tort ce cas.
#[must_use]
pub fn scope_paths_overlap(a: &str, b: &str) -> bool {
    let a = normalize_scope_path(a);
    let b = normalize_scope_path(b);
    if a.is_empty() || b.is_empty() {
        return false;
    }
    if a == b {
        return true;
    }
    if scope_path_looks_like_file(&a) && scope_path_looks_like_file(&b) {
        return false;
    }
    a.starts_with(&format!("{b}/")) || b.starts_with(&format!("{a}/"))
}

/// Tous les chemins de scope du batch sont deux à deux disjoints.
#[must_use]
pub fn batch_scopes_disjoint(scopes_per_task: &[Vec<String>]) -> bool {
    let mut flat: Vec<String> = Vec::new();
    for scope in scopes_per_task {
        for raw in scope {
            let norm = normalize_scope_path(raw);
            if norm.is_empty() {
                continue;
            }
            for existing in &flat {
                if scope_paths_overlap(existing, &norm) {
                    return false;
                }
            }
            flat.push(norm);
        }
    }
    true
}

/// Valide un batch avant lancement parallèle.
pub fn validate_parallel_batch(
    task_ids: &[String],
    scopes_per_task: &[Vec<String>],
    max_parallel: usize,
) -> Result<(), String> {
    let n = task_ids.len();
    if n < 2 {
        return Err("parallel batch requires at least 2 tasks".to_string());
    }
    if n > max_parallel {
        return Err(format!(
            "batch has {n} tasks but max parallel executors is {max_parallel} — reduce `parallel_with` or raise `nexus.drox.orchestration.maxParallelExecutors`"
        ));
    }
    if n > MAX_PARALLEL_EXECUTORS_CAP {
        return Err(format!(
            "batch size {n} exceeds engine cap ({MAX_PARALLEL_EXECUTORS_CAP})"
        ));
    }
    let mut seen = HashSet::new();
    for id in task_ids {
        let t = id.trim();
        if t.is_empty() {
            return Err("task_id must not be empty in batch".to_string());
        }
        if !seen.insert(t.to_string()) {
            return Err(format!("duplicate task_id `{t}` in batch"));
        }
    }
    if !batch_scopes_disjoint(scopes_per_task) {
        return Err(
            "batch scopes overlap — duplicate paths or nested directory scopes conflict; \
             different files in the same folder are allowed (e.g. src/a.ts + src/b.ts)"
                .to_string(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_prefix_overlap() {
        assert!(scope_paths_overlap("src/components", "src/components/Button.tsx"));
        assert!(scope_paths_overlap("src", "src/styles"));
        assert!(!scope_paths_overlap("src/components", "src/styles"));
    }

    #[test]
    fn sibling_files_under_same_folder_do_not_overlap() {
        assert!(!scope_paths_overlap(
            "src/components/Button.tsx",
            "src/components/Modal.tsx"
        ));
        assert!(!scope_paths_overlap(
            "src/vs/workbench/contrib/drox/browser/media/droxChat/07-log.js",
            "src/vs/workbench/contrib/drox/browser/media/droxChat/09-host.js",
        ));
    }

    #[test]
    fn batch_sibling_files_ok() {
        let scopes = vec![
            vec!["src/components/Button.tsx".into()],
            vec!["src/components/Modal.tsx".into()],
        ];
        assert!(batch_scopes_disjoint(&scopes));
        assert!(validate_parallel_batch(&["t1".into(), "t2".into()], &scopes, 2).is_ok());
    }

    #[test]
    fn batch_disjoint_ok() {
        let scopes = vec![
            vec!["src/components/".into()],
            vec!["src/styles/".into()],
        ];
        assert!(batch_scopes_disjoint(&scopes));
    }

    #[test]
    fn batch_overlap_rejected() {
        let scopes = vec![vec!["src/".into()], vec!["src/styles/".into()]];
        assert!(!batch_scopes_disjoint(&scopes));
    }

    #[test]
    fn validate_respects_max_parallel() {
        let ids = vec!["t1".into(), "t2".into(), "t3".into()];
        let scopes = vec![vec!["a/".into()], vec!["b/".into()], vec!["c/".into()]];
        assert!(validate_parallel_batch(&ids, &scopes, 2).is_err());
    }
}
