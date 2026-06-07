//! Vérification terrain post-délégation et paquet d'échec structuré (1.3.0).

use camino::Utf8Path;
use serde_json::{json, Value};

use super::delegate_report::DelegateStatus;
use super::executor_deliverable::DeliverableOnDisk;

/// Type de tâche pour le critère de vérité.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DelegateTaskKind {
    /// Création / modification de fichiers source dans `scope`.
    Mutation,
    /// Analyse, lecture, inventaire — livrable `.md` suffit.
    ReadOnly,
}

/// État d'un chemin `scope` sur disque.
#[derive(Debug, Clone)]
pub struct ScopePathCheck {
    pub path: String,
    pub exists: bool,
    pub bytes: u64,
    pub is_file_target: bool,
}

/// Résultat de `post_delegate_truth_check`.
#[derive(Debug, Clone)]
pub struct TruthCheck {
    pub kind: DelegateTaskKind,
    pub scope_checks: Vec<ScopePathCheck>,
    pub agent_output_path: Option<String>,
    pub agent_output_bytes: u64,
    /// Fichiers cibles mutation présents et non vides.
    pub mutation_ok: bool,
    /// Livrable agent-output ou lecture scope OK.
    pub read_deliverable_ok: bool,
}

impl TruthCheck {
    #[must_use]
    pub fn passes_for_completed(&self) -> bool {
        match self.kind {
            DelegateTaskKind::Mutation => self.mutation_ok,
            DelegateTaskKind::ReadOnly => self.read_deliverable_ok,
        }
    }
}

const MUTATION_FILE_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "py", "go", "java", "kt", "cs", "cpp", "c",
    "h", "hpp", "vue", "svelte", "css", "scss", "sass", "less", "html", "sql", "sh", "bash",
    "zsh", "ps1", "dart", "rb", "php", "swift",
];

/// Infère mutation vs lecture à partir du **`scope`** (fichiers source ciblés) — pas de scan du brief.
#[must_use]
pub fn classify_delegate_task(
    scope: &[String],
    _description: &str,
    _deliverable: Option<&str>,
    _instructions: Option<&str>,
) -> DelegateTaskKind {
    let file_targets: Vec<_> = scope
        .iter()
        .filter(|p| scope_path_looks_like_source_file(p))
        .collect();
    if !file_targets.is_empty() {
        return DelegateTaskKind::Mutation;
    }
    DelegateTaskKind::ReadOnly
}

#[must_use]
pub fn scope_path_looks_like_source_file(path: &str) -> bool {
    let p = path.trim().trim_end_matches('/');
    let Some(ext) = p.rsplit('.').next() else {
        return false;
    };
    if ext == p {
        return false;
    }
    let ext = ext.to_ascii_lowercase();
    MUTATION_FILE_EXTENSIONS.contains(&ext.as_str())
}

#[must_use]
pub fn post_delegate_truth_check(
    workspace: &Utf8Path,
    scope: &[String],
    kind: DelegateTaskKind,
    disk: Option<&DeliverableOnDisk>,
    min_deliverable_bytes: u64,
) -> TruthCheck {
    let mut scope_checks = Vec::new();
    let mut mutation_file_targets = 0u32;
    let mut mutation_files_ok = 0u32;

    for raw in scope {
        let norm = normalize_rel(raw);
        if norm.is_empty() || norm.starts_with(".drox/") {
            continue;
        }
        let abs = workspace.join(&norm);
        let is_file_target = scope_path_looks_like_source_file(&norm);
        let (exists, bytes) = path_exists_and_size(&abs);
        if is_file_target {
            mutation_file_targets = mutation_file_targets.saturating_add(1);
            if exists && bytes > 0 {
                mutation_files_ok = mutation_files_ok.saturating_add(1);
            }
        }
        scope_checks.push(ScopePathCheck {
            path: norm,
            exists,
            bytes,
            is_file_target,
        });
    }

    let agent_output_path = disk.map(|d| d.path.clone());
    let agent_output_bytes = disk.map(|d| d.bytes).unwrap_or(0);
    let has_agent_md = agent_output_bytes >= min_deliverable_bytes;

    let mutation_ok = if mutation_file_targets > 0 {
        mutation_files_ok == mutation_file_targets
    } else {
        // Scope = dossiers seulement : exiger au moins un fichier modifié non-md dans scope
        // ou livrable md + au moins un chemin scope existant.
        has_agent_md && scope_checks.iter().any(|c| c.exists)
    };

    let read_deliverable_ok = has_agent_md
        || scope_checks.iter().any(|c| {
            c.exists && (c.bytes > 0 || !c.is_file_target)
        });

    TruthCheck {
        kind,
        scope_checks,
        agent_output_path,
        agent_output_bytes,
        mutation_ok,
        read_deliverable_ok,
    }
}

/// Ajuste le statut si le rapport dit completed mais la vérité terrain dit non.
#[must_use]
pub fn apply_truth_check_to_status(
    status: DelegateStatus,
    truth: &TruthCheck,
) -> DelegateStatus {
    if status != DelegateStatus::Completed {
        return status;
    }
    if truth.passes_for_completed() {
        return status;
    }
    DelegateStatus::Partial
}

/// Construit le JSON `failure` pour l'architecte (absent si rien à signaler).
#[must_use]
pub fn build_failure_packet(
    task_id: &str,
    status: DelegateStatus,
    truth: &TruthCheck,
    iterations_used: usize,
    delegate_attempts: u32,
    engine_error: Option<&str>,
) -> Option<Value> {
    let verified = status == DelegateStatus::Completed && truth.passes_for_completed();
    if verified {
        return None;
    }

    let kind = match status {
        DelegateStatus::Blocked => "scope_blocked",
        DelegateStatus::Failed => "engine_failed",
        DelegateStatus::Partial if !truth.passes_for_completed() => "deliverable_missing",
        DelegateStatus::Partial => "partial_report",
        DelegateStatus::Completed => "deliverable_missing",
    };

    let summary = match kind {
        "deliverable_missing" => match truth.kind {
            DelegateTaskKind::Mutation => {
                "Report or status claimed success but required scope file(s) are missing or empty"
            }
            DelegateTaskKind::ReadOnly => {
                "Read-only task: no valid agent-output deliverable and no scope evidence on disk"
            }
        },
        "scope_blocked" => "Executor returned blocked — scope too large or brief unrealistic",
        "engine_failed" => "Executor engine error before usable deliverable",
        _ => "Delegation finished without verified deliverable",
    };

    let scope_checked: Vec<Value> = truth
        .scope_checks
        .iter()
        .map(|c| {
            json!({
                "path": c.path,
                "exists": c.exists,
                "bytes": c.bytes,
                "isFileTarget": c.is_file_target,
            })
        })
        .collect();

    let remaining = 2u32.saturating_sub(delegate_attempts);
    let mut recovery_hints = Vec::new();
    match status {
        DelegateStatus::Blocked => {
            recovery_hints.push(
                "Split this todo into smaller shards (≤50 files each) in todo_write, then delegate each"
                    .to_string(),
            );
            recovery_hints.push(
                "Use glob to pick subfolders — do not tell the user the mission is impossible"
                    .to_string(),
            );
        }
        DelegateStatus::Failed => {
            recovery_hints.push(format!(
                "Re-delegate `{task_id}` with a clearer brief ({remaining} attempt(s) left)"
            ));
            if engine_error.is_some() {
                recovery_hints.push(
                    "Or ask_user_question if the failure looks environmental (deps, network)"
                        .to_string(),
                );
            }
        }
        _ => {
            recovery_hints.push(format!(
                "Re-delegate `{task_id}` with explicit file_write/file_edit to scope path(s); {remaining} attempt(s) left"
            ));
            recovery_hints.push(
                "Verify with file_read on scope before marking todo completed".to_string(),
            );
            if truth.kind == DelegateTaskKind::Mutation {
                recovery_hints.push(
                    "Do not mark completed while scope target files are missing".to_string(),
                );
            }
        }
    }

    Some(json!({
        "kind": kind,
        "summary": summary,
        "scopeChecked": scope_checked,
        "agentOutput": truth.agent_output_path,
        "agentOutputBytes": truth.agent_output_bytes,
        "iterationsUsed": iterations_used,
        "delegateAttempts": delegate_attempts,
        "recoveryHints": recovery_hints,
    }))
}

#[must_use]
pub fn recovery_checkpoint_block(
    task_id: &str,
    status: &str,
    truth: &TruthCheck,
    failure: Option<&Value>,
    delegate_attempts: u32,
) -> String {
    let mut block = format!(
        "## Architect — recovery required (task `{task_id}`)\n\
         Last delegate: **{status}** — engine verified: **no**.\n"
    );
    if let Some(f) = failure {
        if let Some(s) = f.get("summary").and_then(|v| v.as_str()) {
            block.push_str(&format!("- Failure: {s}\n"));
        }
        if let Some(hints) = f.get("recoveryHints").and_then(|v| v.as_array()) {
            block.push_str("- Do **one** of:\n");
            for (i, h) in hints.iter().enumerate() {
                if let Some(s) = h.as_str() {
                    block.push_str(&format!("  {}. {s}\n", i + 1));
                }
            }
        }
    }
    if !truth.scope_checks.is_empty() {
        block.push_str("- Scope on disk:\n");
        for c in truth.scope_checks.iter().take(5) {
            let flag = if c.exists { "OK" } else { "MISSING" };
            block.push_str(&format!("  - `{path}` — {flag} ({bytes} B)\n", path = c.path, bytes = c.bytes));
        }
    }
    if let Some(p) = truth.agent_output_path.as_ref() {
        block.push_str(&format!(
            "- Agent-output: `{p}` ({bytes} B)\n",
            bytes = truth.agent_output_bytes
        ));
    }
    block.push_str(&format!(
        "- Re-delegate attempts used: {delegate_attempts}/2\n\
         Suggested: read deliverable, re-delegate with narrower scope, fix yourself with `file_edit`/`bash`, or adjust `todo_write`.\n"
    ));
    block
}

fn normalize_rel(path: &str) -> String {
    path.trim()
        .trim_start_matches(r"\\?\")
        .replace('\\', "/")
        .trim()
        .trim_matches('/')
        .to_string()
}

fn path_exists_and_size(abs: &Utf8Path) -> (bool, u64) {
    let p = abs.as_std_path();
    if p.is_file() {
        return p.metadata().map(|m| (true, m.len())).unwrap_or((true, 0));
    }
    if p.is_dir() {
        return (true, 0);
    }
    (false, 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use std::fs;

    #[test]
    fn classify_mutation_from_scope_file() {
        let kind = classify_delegate_task(
            &["app/src/hook.ts".into()],
            "List dependencies",
            None,
            None,
        );
        assert_eq!(kind, DelegateTaskKind::Mutation);
    }

    #[test]
    fn classify_read_only_analysis() {
        let kind = classify_delegate_task(
            &["app-kdds-main/src".into()],
            "Lister les dépendances",
            Some("Tableau deps"),
            None,
        );
        assert_eq!(kind, DelegateTaskKind::ReadOnly);
    }

    #[test]
    fn mutation_missing_file_downgrades_completed() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        let scope = vec!["src/missing.ts".into()];
        let truth = post_delegate_truth_check(&ws, &scope, DelegateTaskKind::Mutation, None, 64);
        assert!(!truth.mutation_ok);
        let status = apply_truth_check_to_status(DelegateStatus::Completed, &truth);
        assert_eq!(status, DelegateStatus::Partial);
    }

    #[test]
    fn mutation_ok_when_scope_file_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        let dir = ws.join("src");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("hook.ts"), b"export {}").unwrap();
        let scope = vec!["src/hook.ts".into()];
        let truth = post_delegate_truth_check(&ws, &scope, DelegateTaskKind::Mutation, None, 64);
        assert!(truth.mutation_ok);
    }

    #[test]
    fn read_only_directory_scope_exists_counts_as_deliverable() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        let dir = ws.join("app-kdds-main/src");
        fs::create_dir_all(&dir).unwrap();
        let scope = vec!["app-kdds-main/src".into()];
        let truth = post_delegate_truth_check(&ws, &scope, DelegateTaskKind::ReadOnly, None, 64);
        assert!(truth.read_deliverable_ok);
        assert!(truth.passes_for_completed());
    }

    #[test]
    fn disk_only_completed_downgrades_for_mutation() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        let disk = DeliverableOnDisk {
            path: ".drox/agent-output/plan_1/t1/report.md".into(),
            bytes: 200,
            content: "# ok".into(),
        };
        let scope = vec!["src/never-created.ts".into()];
        let truth =
            post_delegate_truth_check(&ws, &scope, DelegateTaskKind::Mutation, Some(&disk), 64);
        let status = apply_truth_check_to_status(DelegateStatus::Completed, &truth);
        assert_eq!(status, DelegateStatus::Partial);
        let failure = build_failure_packet("t1", status, &truth, 3, 1, None).unwrap();
        assert_eq!(
            failure.get("kind").and_then(|v| v.as_str()),
            Some("deliverable_missing")
        );
    }
}
