//! Chemins de sortie agent (rapports `.md`) — sous `.drox/agent-output/`, pas à la racine du repo.

use camino::{Utf8Path, Utf8PathBuf};

#[cfg(test)]
use crate::error::ToolError;
#[cfg(test)]
use crate::path_util::resolve_path_for_write;

/// Racine workspace-relative des artefacts markdown agent.
pub const AGENT_OUTPUT_DIR: &str = ".drox/agent-output";

/// Longueur max du titre de rapport (hors extension).
const MAX_DELIVERABLE_FILENAME_CHARS: usize = 120;

/// Nom de repli si le libellé tâche est vide ou illisible.
pub const DEFAULT_DELIVERABLE_FILENAME: &str = "report.md";
/// Segment sûr pour un sous-dossier (`task_id`, `job_id`, …).
#[must_use]
pub fn sanitize_output_segment(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "run".to_string();
    }
    let mut out = String::with_capacity(trimmed.len());
    for c in trimmed.chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    out
}

/// Libellé tâche → nom de fichier `.md` lisible (espaces, parenthèses conservés).
#[must_use]
pub fn sanitize_deliverable_filename(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('.');
    if trimmed.is_empty() {
        return DEFAULT_DELIVERABLE_FILENAME.to_string();
    }
    let mut name = String::with_capacity(trimmed.len());
    for c in trimmed.chars() {
        if c == '/' || c == '\\' {
            name.push('-');
        } else if matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') {
            name.push('_');
        } else if c.is_control() {
            continue;
        } else {
            name.push(c);
        }
    }
    let name = name.trim().trim_end_matches('.');
    if name.is_empty() {
        return DEFAULT_DELIVERABLE_FILENAME.to_string();
    }
    let truncated: String = name.chars().take(MAX_DELIVERABLE_FILENAME_CHARS).collect();
    let truncated = truncated.trim();
    if truncated.is_empty() {
        return DEFAULT_DELIVERABLE_FILENAME.to_string();
    }
    if truncated.to_ascii_lowercase().ends_with(".md") {
        truncated.to_string()
    } else {
        format!("{truncated}.md")
    }
}

/// Répertoire `.drox/agent-output/<segment>/` (relatif au workspace).
#[must_use]
pub fn agent_output_dir_for_segment(segment: &str) -> Utf8PathBuf {
    Utf8Path::new(AGENT_OUTPUT_DIR).join(sanitize_output_segment(segment))
}

/// Nouvel identifiant de plan orchestration (dossier sous `agent-output/`).
#[must_use]
pub fn new_orchestration_plan_id() -> String {
    let unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("plan_{unix}")
}

/// Répertoire `.drox/agent-output/<plan_id>/<task_id>/`.
#[must_use]
pub fn agent_output_dir_for_plan_task(plan_id: &str, task_id: &str) -> Utf8PathBuf {
    agent_output_dir_for_segment(plan_id).join(sanitize_output_segment(task_id))
}

/// Chemin relatif canonique du livrable exécuteur (nom = libellé tâche).
#[must_use]
pub fn agent_output_deliverable_path(plan_id: &str, task_id: &str, task_label: &str) -> String {
    let filename = sanitize_deliverable_filename(task_label);
    agent_output_dir_for_plan_task(plan_id, task_id)
        .join(&filename)
        .to_string()
        .replace('\\', "/")
}
#[cfg(test)]
#[must_use]
fn is_markdown_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

#[cfg(test)]
#[must_use]
fn path_under_markdown_root(rel: &str, md_root_rel: &str) -> bool {
    let norm = rel.replace('\\', "/").trim_start_matches('/').to_string();
    let root = md_root_rel.trim_matches('/');
    norm == root || norm.starts_with(&format!("{root}/"))
}

#[cfg(test)]
#[must_use]
fn is_under_drox_agent_tree(rel: &str) -> bool {
    let norm = rel.replace('\\', "/").trim_start_matches('/').to_string();
    norm == ".drox"
        || norm.starts_with(".drox/")
        || norm.starts_with(&format!("{AGENT_OUTPUT_DIR}/"))
        || norm == AGENT_OUTPUT_DIR
}

#[cfg(test)]
#[must_use]
fn is_under_agent_output_tree(rel: &str) -> bool {
    let norm = rel.replace('\\', "/").trim_start_matches('/').to_string();
    norm.starts_with(&format!("{AGENT_OUTPUT_DIR}/")) || norm == AGENT_OUTPUT_DIR
}

/// Chemin relatif workspace → `foo/bar` (fichier cible peut ne pas exister encore).
#[cfg(test)]
fn relative_to_workspace(workspace_root: &Utf8Path, resolved: &Utf8Path) -> Result<String, ToolError> {
    let root_canon = std::fs::canonicalize(workspace_root.as_std_path())
        .map_err(|e| ToolError::io(workspace_root.to_owned(), e))?;
    let parent = resolved
        .parent()
        .filter(|p| !p.as_str().is_empty())
        .unwrap_or(workspace_root);
    let parent_canon = std::fs::canonicalize(parent.as_std_path())
        .map_err(|e| ToolError::io(parent.to_owned(), e))?;
    let rel_parent = parent_canon.strip_prefix(&root_canon).map_err(|_| {
        ToolError::PathEscape {
            path: Utf8PathBuf::from_path_buf(parent_canon.clone())
                .unwrap_or_else(|_| parent.to_owned()),
        }
    })?;
    let file_name = resolved
        .file_name()
        .ok_or_else(|| ToolError::invalid_args("path must include a file name"))?;
    let mut rel = Utf8PathBuf::from_path_buf(rel_parent.to_path_buf())
        .map_err(|_| ToolError::invalid_args("path is not valid UTF-8"))?;
    if !rel.as_str().is_empty() {
        rel.push(file_name);
    } else {
        rel = Utf8PathBuf::from(file_name);
    }
    Ok(rel.as_str().replace('\\', "/"))
}

/// Chemin relatif logique (sans canonicaliser le fichier cible).
#[cfg(test)]
fn logical_relative_path(workspace_root: &Utf8Path, user_path: &str) -> Result<String, ToolError> {
    let trimmed = user_path.trim();
    if trimmed.is_empty() {
        return Err(ToolError::invalid_args("path must not be empty"));
    }
    if std::path::Path::new(trimmed).is_absolute() {
        let resolved = resolve_path_for_write(workspace_root, trimmed)?;
        return relative_to_workspace(workspace_root, &resolved);
    }
    Ok(trimmed.replace('\\', "/"))
}

/// Si `agent_markdown_root` est défini, réécrit les `.md` hors `.drox/` vers ce dossier.
#[cfg(test)]
pub fn resolve_write_path_for_agent(
    workspace_root: &Utf8Path,
    user_path: &str,
    agent_markdown_root: Option<&Utf8Path>,
    agent_markdown_filename: Option<&str>,
) -> Result<(Utf8PathBuf, bool), ToolError> {
    let Some(md_root) = agent_markdown_root else {
        return Ok((resolve_path_for_write(workspace_root, user_path)?, false));
    };
    let rel = logical_relative_path(workspace_root, user_path)?;
    if !is_markdown_path(&rel) {
        return Ok((resolve_path_for_write(workspace_root, user_path)?, false));
    }
    let md_root_rel = md_root
        .as_str()
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    if path_under_markdown_root(&rel, &md_root_rel) {
        return Ok((resolve_path_for_write(workspace_root, user_path)?, false));
    }
    // `.drox/memory`, etc. — laisser le chemin demandé.
    if is_under_drox_agent_tree(&rel) && !is_under_agent_output_tree(&rel) {
        return Ok((resolve_path_for_write(workspace_root, user_path)?, false));
    }
    // Hors `.drox/` ou legacy `.drox/agent-output/<task_id>/` → dossier plan/tâche.
    let file_name = agent_markdown_filename
        .filter(|s| !s.trim().is_empty())
        .map(str::trim)
        .or_else(|| Utf8Path::new(&rel).file_name())
        .unwrap_or(DEFAULT_DELIVERABLE_FILENAME);
    let redirected = md_root.join(file_name);
    if let Some(parent) = redirected.parent() {
        let parent_abs = workspace_root.join(parent);
        std::fs::create_dir_all(parent_abs.as_std_path())
            .map_err(|e| ToolError::io(parent_abs, e))?;
    }
    let out = resolve_path_for_write(workspace_root, redirected.as_str())?;
    Ok((out, true))
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use std::fs;

    #[test]
    fn redirects_md_outside_drox() {
        let tmp = tempfile::tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        fs::create_dir_all(root.join(".drox")).unwrap();
        let md_root = agent_output_dir_for_segment("t2");
        let (out, redirected) = resolve_write_path_for_agent(
            &root,
            "app-kdds-main/STRUCTURE_ANALYSIS.md",
            Some(&md_root),
            None,
        )
        .unwrap();
        assert!(redirected);
        let rel = relative_to_workspace(&root, &out)
            .unwrap()
            .replace('\\', "/");
        assert!(rel.starts_with(".drox/agent-output/t2/"));
        assert!(rel.ends_with("STRUCTURE_ANALYSIS.md"));
    }

    #[test]
    fn redirects_legacy_agent_output_task_path_to_plan_task_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        fs::create_dir_all(root.join(".drox")).unwrap();
        let md_root = agent_output_dir_for_plan_task("plan_99", "t2");
        let (out, redirected) = resolve_write_path_for_agent(
            &root,
            ".drox/agent-output/t2/wrong-place.md",
            Some(&md_root),
            Some("report.md"),
        )
        .unwrap();
        assert!(redirected);
        let rel = relative_to_workspace(&root, &out)
            .unwrap()
            .replace('\\', "/");
        assert!(rel.starts_with(".drox/agent-output/plan_99/t2/"));
        assert!(rel.ends_with("report.md"));
    }

    #[test]
    fn keeps_md_already_under_drox() {
        let tmp = tempfile::tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        fs::create_dir_all(root.join(".drox/memory")).unwrap();
        let md_root = agent_output_dir_for_segment("t1");
        let (out, redirected) = resolve_write_path_for_agent(
            &root,
            ".drox/memory/note.md",
            Some(&md_root),
            None,
        )
        .unwrap();
        assert!(!redirected);
        let rel = relative_to_workspace(&root, &out).unwrap();
        assert_eq!(rel, ".drox/memory/note.md");
    }

    #[test]
    fn forced_filename_overrides_source_name() {
        let tmp = tempfile::tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        fs::create_dir_all(root.join(".drox")).unwrap();
        let md_root = agent_output_dir_for_segment("t2");
        let label = "Composants src/components (app-shell, home-content).md";
        let (out, redirected) = resolve_write_path_for_agent(
            &root,
            "src/ANALYSIS.md",
            Some(&md_root),
            Some(label),
        )
        .unwrap();
        assert!(redirected);
        let rel = relative_to_workspace(&root, &out)
            .unwrap()
            .replace('\\', "/");
        assert!(rel.ends_with(label));
    }

    #[test]
    fn sanitize_deliverable_filename_keeps_readable_title() {
        assert_eq!(
            sanitize_deliverable_filename(
                "Composants src/components (app-shell, home-content, animated-background, theme)"
            ),
            "Composants src-components (app-shell, home-content, animated-background, theme).md"
        );
        assert_eq!(
            sanitize_deliverable_filename("Utilitaires src/lib et config TypeScript"),
            "Utilitaires src-lib et config TypeScript.md"
        );
    }
}
