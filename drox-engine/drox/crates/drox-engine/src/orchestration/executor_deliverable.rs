//! Contrat A — clôture exécuteur sur livrable disque (`.drox/agent-output/<plan_id>/<task_id>/`).

use std::fs;
use std::path::Path;

use camino::Utf8Path;
use drox_tools::{
    agent_output_deliverable_path, agent_output_dir_for_plan_task, agent_output_dir_for_segment,
};
use serde_json::Value;

/// Taille minimale preset `normal` (E2) — préférer [`EngineTuning::min_deliverable_bytes`].
pub const MIN_DELIVERABLE_BYTES: u64 = 64;

/// Livrable `.md` trouvé sur disque pour une tâche déléguée.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeliverableOnDisk {
    pub path: String,
    pub bytes: u64,
    pub content: String,
}

/// Chemin canonique recommandé (prompt Architecte / Exécuteur).
#[must_use]
pub fn canonical_deliverable_path(plan_id: &str, task_id: &str, task_label: &str) -> String {
    agent_output_deliverable_path(plan_id, task_id, task_label)
}

/// Préfixe POSIX du dossier livrable pour une tâche (layout courant).
#[must_use]
pub fn deliverable_dir_prefix(plan_id: &str, task_id: &str) -> String {
    agent_output_dir_for_plan_task(plan_id, task_id)
        .to_string()
        .replace('\\', "/")
}

/// Préfixe legacy `.drox/agent-output/<task_id>/` (runs antérieurs).
#[must_use]
pub fn deliverable_dir_prefix_legacy(task_id: &str) -> String {
    agent_output_dir_for_segment(task_id)
        .to_string()
        .replace('\\', "/")
}

#[must_use]
pub fn normalize_workspace_rel(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .trim_start_matches("./")
        .to_string()
}

/// `true` si `rel` est un markdown sous le dossier livrable de la tâche.
#[must_use]
pub fn path_is_task_deliverable_md(rel: &str, plan_id: &str, task_id: &str) -> bool {
    let norm = normalize_workspace_rel(rel);
    for dir in [
        deliverable_dir_prefix(plan_id, task_id),
        deliverable_dir_prefix_legacy(task_id),
    ] {
        let dir_slash = format!("{dir}/");
        if norm.starts_with(&dir_slash) {
            let lower = norm.to_ascii_lowercase();
            if lower.ends_with(".md") || lower.ends_with(".markdown") {
                return true;
            }
        }
    }
    false
}

/// Après `file_write` / `file_edit` réussi : chemin relatif si livrable valide.
#[must_use]
pub fn deliverable_path_from_tool_success(
    tool_name: &str,
    call_arguments: &Value,
    output: &Value,
    plan_id: &str,
    task_id: &str,
    workspace: &Utf8Path,
    min_deliverable_bytes: u64,
) -> Option<String> {
    if !matches!(tool_name, "file_write" | "file_edit") {
        return None;
    }
    if output.get("applied") == Some(&Value::Bool(false)) {
        return None;
    }
    let raw_path = output
        .get("path")
        .and_then(|v| v.as_str())
        .or_else(|| call_arguments.get("path").and_then(|v| v.as_str()))?;
    let rel = workspace_relative_path(workspace, raw_path)?;
    if !path_is_task_deliverable_md(&rel, plan_id, task_id) {
        return None;
    }
    let bytes = output
        .get("bytes_written")
        .and_then(|v| v.as_u64())
        .or_else(|| file_size_on_disk(workspace, &rel));
    if bytes.unwrap_or(0) < min_deliverable_bytes {
        return None;
    }
    Some(rel)
}

fn scan_deliverable_dir(
    workspace: &Utf8Path,
    dir_rel: &str,
    preferred_rel: Option<&str>,
    min_deliverable_bytes: u64,
) -> Option<DeliverableOnDisk> {
    let dir_abs = workspace.join(dir_rel);
    let dir_std = dir_abs.as_std_path();
    if !dir_std.is_dir() {
        return None;
    }
    let mut candidates: Vec<(String, u64, String)> = Vec::new();
    let entries = fs::read_dir(dir_std).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name()?.to_string_lossy();
        let lower = name.to_ascii_lowercase();
        if !lower.ends_with(".md") && !lower.ends_with(".markdown") {
            continue;
        }
        let meta = entry.metadata().ok()?;
        let bytes = meta.len();
        if bytes < min_deliverable_bytes {
            continue;
        }
        let rel = format!("{dir_rel}/{}", name.replace('\\', "/"));
        let content = fs::read_to_string(&path).unwrap_or_default();
        candidates.push((rel, bytes, content));
    }
    if candidates.is_empty() {
        return None;
    }
    candidates.sort_by(|a, b| {
        let a_pref = preferred_rel.is_some_and(|p| a.0 == p);
        let b_pref = preferred_rel.is_some_and(|p| b.0 == p);
        let a_legacy = a.0.ends_with("/report.md");
        let b_legacy = b.0.ends_with("/report.md");
        b_pref
            .cmp(&a_pref)
            .then_with(|| b_legacy.cmp(&a_legacy))
            .then_with(|| b.1.cmp(&a.1))
            .then_with(|| a.0.cmp(&b.0))
    });
    let (path, bytes, content) = candidates.into_iter().next()?;
    Some(DeliverableOnDisk {
        path,
        bytes,
        content,
    })
}

/// Cherche le meilleur livrable `.md` existant pour `plan_id`/`task_id`.
#[must_use]
pub fn find_deliverable_on_disk(
    workspace: &Utf8Path,
    plan_id: &str,
    task_id: &str,
    preferred_filename: Option<&str>,
    min_deliverable_bytes: u64,
) -> Option<DeliverableOnDisk> {
    let dir_rel = deliverable_dir_prefix(plan_id, task_id);
    let preferred_rel = preferred_filename.map(|name| format!("{dir_rel}/{name}"));
    scan_deliverable_dir(
        workspace,
        &dir_rel,
        preferred_rel.as_deref(),
        min_deliverable_bytes,
    )
}

/// Rapport synthétique pour l'Architecte quand le moteur clôt sur le fichier.
#[must_use]
pub fn synthesize_executor_report_from_disk(
    task_id: &str,
    deliverable: &DeliverableOnDisk,
    excerpt_max_chars: usize,
) -> String {
    let excerpt = excerpt_deliverable(&deliverable.content, excerpt_max_chars);
    format!(
        "## Executor report · {task_id}\n\n\
         **Status:** completed\n\n\
         **Deliverable check:** met — on-disk deliverable\n\n\
         **What I did:**\n\
         - Wrote the task deliverable to `{path}` ({bytes} bytes)\n\n\
         **Evidence:**\n\
         - `{path}`\n\n\
         **Deep notes:**\n\
         {excerpt}",
        path = deliverable.path,
        bytes = deliverable.bytes,
        excerpt = excerpt,
    )
}

#[must_use]
pub fn executor_deliverable_closure_notice(task_id: &str, deliverable_path: &str) -> String {
    format!(
        "[Deliverable contract] Task `{task_id}` — deliverable on disk at `{deliverable_path}`. \
         Engine closing this Executor run."
    )
}

fn excerpt_deliverable(content: &str, excerpt_max_chars: usize) -> String {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return "*(file empty)*".to_string();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= excerpt_max_chars {
        return trimmed.to_string();
    }
    let cut: String = chars.into_iter().take(excerpt_max_chars).collect();
    format!("{cut}…")
}

fn workspace_relative_path(workspace: &Utf8Path, raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        let root = fs::canonicalize(workspace.as_std_path()).ok()?;
        let target = fs::canonicalize(path).ok()?;
        let rel = target.strip_prefix(&root).ok()?;
        return Some(rel.to_string_lossy().replace('\\', "/"));
    }
    Some(normalize_workspace_rel(trimmed))
}

fn file_size_on_disk(workspace: &Utf8Path, rel: &str) -> Option<u64> {
    let abs = workspace.join(rel);
    fs::metadata(abs.as_std_path()).ok().map(|m| m.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    const PLAN: &str = "plan_test";
    const LABEL: &str = "Lister deps production/dev (package.json)";

    #[test]
    fn canonical_path_uses_plan_task_and_label() {
        assert_eq!(
            canonical_deliverable_path(PLAN, "t2", LABEL),
            ".drox/agent-output/plan_test/t2/Lister deps production-dev (package.json).md"
        );
    }

    #[test]
    fn path_is_task_deliverable_md_accepts_any_md_in_task_dir() {
        assert!(path_is_task_deliverable_md(
            ".drox/agent-output/plan_test/t2/configuration-nextjs.md",
            PLAN,
            "t2"
        ));
        assert!(path_is_task_deliverable_md(
            ".drox/agent-output/plan_test/t2/report.md",
            PLAN,
            "t2"
        ));
        assert!(path_is_task_deliverable_md(
            ".drox/agent-output/t2/report.md",
            PLAN,
            "t2"
        ));
        assert!(!path_is_task_deliverable_md(
            ".drox/agent-output/plan_test/t1/report.md",
            PLAN,
            "t2"
        ));
        assert!(!path_is_task_deliverable_md("README.md", PLAN, "t2"));
    }

    #[test]
    fn find_deliverable_prefers_task_title_md() {
        let dir = tempdir().unwrap();
        let root = Utf8Path::from_path(dir.path()).unwrap();
        let task_dir = root.join(".drox/agent-output/plan_test/t2");
        std::fs::create_dir_all(task_dir.as_std_path()).unwrap();
        let title = "Composants src_components (ui).md";
        std::fs::write(
            task_dir.join(title).as_std_path(),
            "# Report\n\n".to_string() + &"line\n".repeat(20),
        )
        .unwrap();
        std::fs::write(
            task_dir.join("report.md").as_std_path(),
            "x".repeat(80),
        )
        .unwrap();
        let found = find_deliverable_on_disk(root, PLAN, "t2", Some(title), MIN_DELIVERABLE_BYTES)
            .unwrap();
        assert_eq!(
            found.path,
            format!(".drox/agent-output/plan_test/t2/{title}")
        );
    }

    #[test]
    fn find_deliverable_ignores_legacy_flat_layout() {
        let dir = tempdir().unwrap();
        let root = Utf8Path::from_path(dir.path()).unwrap();
        let task_dir = root.join(".drox/agent-output/t2");
        std::fs::create_dir_all(task_dir.as_std_path()).unwrap();
        std::fs::write(
            task_dir.join("report.md").as_std_path(),
            "# Report\n\n".to_string() + &"line\n".repeat(20),
        )
        .unwrap();
        assert!(find_deliverable_on_disk(root, PLAN, "t2", None, MIN_DELIVERABLE_BYTES).is_none());
    }

    #[test]
    fn deliverable_path_from_file_write_detects_redirected_md() {
        let dir = tempdir().unwrap();
        let root = Utf8Path::from_path(dir.path()).unwrap();
        let rel = ".drox/agent-output/plan_test/t2/Lister deps production-dev (package.json).md";
        std::fs::create_dir_all(root.join(".drox/agent-output/plan_test/t2").as_std_path())
            .unwrap();
        let abs = root.join(rel);
        std::fs::write(abs.as_std_path(), "x".repeat(100)).unwrap();
        let out = json!({
            "applied": true,
            "path": abs.as_str(),
            "bytes_written": 100
        });
        let detected = deliverable_path_from_tool_success(
            "file_write",
            &json!({ "path": "app/report.md" }),
            &out,
            PLAN,
            "t2",
            root,
            MIN_DELIVERABLE_BYTES,
        );
        assert_eq!(detected.as_deref(), Some(rel));
    }

    #[test]
    fn synthesize_report_contains_status_and_path() {
        let d = DeliverableOnDisk {
            path: ".drox/agent-output/plan_test/t2/Composants ui.md".into(),
            bytes: 200,
            content: "# Config\n\nScripts: dev, build".into(),
        };
        let r = synthesize_executor_report_from_disk("t2", &d, 600);
        assert!(r.contains("completed"));
        assert!(r.contains("Deliverable check:** met"));
        assert!(r.contains("Composants ui.md"));
    }
}
