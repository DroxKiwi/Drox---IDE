//! Cible fichier/ligne extraite d'un diagnostic build collé par l'utilisateur.

use std::collections::HashSet;
use std::fs;

use camino::Utf8Path;

use super::ArchitectRunState;

const SOURCE_EXTS: &[&str] = &[
    "tsx", "ts", "jsx", "js", "mjs", "cjs", "rs", "py", "vue", "css", "scss", "md",
];

/// Fichier cible résolu (chemin relatif POSIX sous le workspace).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticTarget {
    pub workspace_relative_path: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

impl DiagnosticTarget {
    #[must_use]
    pub fn display_line(&self) -> String {
        match (self.line, self.column) {
            (Some(l), Some(c)) => format!("{}:{l}:{c}", self.workspace_relative_path),
            (Some(l), None) => format!("{}:{l}", self.workspace_relative_path),
            _ => self.workspace_relative_path.clone(),
        }
    }

    #[must_use]
    pub fn snapshot_block(&self) -> String {
        let line_hint = self
            .line
            .map(|l| {
                let start = l.saturating_sub(12).max(1);
                let end = l.saturating_add(8);
                format!(
                    "\n> Read lines {start}-{end} with `file_read` unless you need wider context."
                )
            })
            .unwrap_or_default();
        format!(
            "\n### Diagnostic target (engine)\n\
             > **Resolved target:** `{}`\n\
             > Use this **workspace-relative** path for `file_read` / `file_edit` / `grep`. \
             Never use `/workspace/` or other container prefixes.{line_hint}\n\
             > Skip broad `workspace_map_read` / directory listing — open this file first.\n",
            self.display_line()
        )
    }
}

/// Parse le premier emplacement source plausible dans un message utilisateur (erreur build, etc.).
#[must_use]
pub fn parse_diagnostic_target_from_text(text: &str) -> Option<DiagnosticTarget> {
    let mut best: Option<(String, u32, Option<u32>, u8)> = None;
    for line in text.lines() {
        for token in line.split_whitespace().chain(std::iter::once(line.trim())) {
            if let Some((path, line_no, col)) = parse_source_location_token(token) {
                let score = score_reported_path(&path);
                let replace = best.as_ref().is_none_or(|(_, _, _, s)| score > *s);
                if replace {
                    best = Some((path, line_no, col, score));
                }
            }
        }
    }
    let (reported, line, column, _) = best?;
    Some(DiagnosticTarget {
        workspace_relative_path: reported,
        line: Some(line),
        column,
    })
}

fn score_reported_path(path: &str) -> u8 {
    let p = path.replace('\\', "/");
    let mut score = 0u8;
    if p.contains("/src/") || p.starts_with("./src") || p.starts_with("src/") {
        score = score.saturating_add(4);
    }
    if p.starts_with("./") {
        score = score.saturating_add(2);
    }
    if p.contains("components/") || p.contains("pages/") {
        score = score.saturating_add(1);
    }
    score
}

fn parse_source_location_token(token: &str) -> Option<(String, u32, Option<u32>)> {
    let trimmed = token
        .trim()
        .trim_end_matches(|c: char| !c.is_ascii_alphanumeric() && c != '.' && c != '/' && c != '-' && c != '_');
    for ext in SOURCE_EXTS {
        let marker = format!(".{ext}:");
        let Some(idx) = trimmed.find(&marker) else {
            continue;
        };
        let path_part = trimmed[..idx + ext.len() + 1].trim();
        if path_part.is_empty() {
            continue;
        }
        let rest = &trimmed[idx + marker.len()..];
        let (line_str, col_str) = rest.split_once(':').map_or((rest, None), |(l, c)| (l, Some(c)));
        let line_digits: String = line_str.chars().take_while(|c| c.is_ascii_digit()).collect();
        let line: u32 = line_digits.parse().ok()?;
        if line == 0 {
            continue;
        }
        let col = col_str.and_then(|c| {
            let digits: String = c.chars().take_while(|ch| ch.is_ascii_digit()).collect();
            digits.parse().ok()
        });
        return Some((normalize_reported_path(path_part), line, col));
    }
    None
}

#[must_use]
pub fn normalize_reported_path(path: &str) -> String {
    let mut p = path.trim().trim_matches(|c| c == '"' || c == '\'').replace('\\', "/");
    if let Some(rest) = p.strip_prefix("/workspace/") {
        p = rest.to_string();
    } else if let Some(rest) = p.strip_prefix("workspace/") {
        p = rest.to_string();
    }
    p.trim_start_matches("./").trim_start_matches('/').to_string()
}

/// Résout un chemin signalé dans l'erreur vers un chemin relatif workspace existant.
#[must_use]
pub fn resolve_diagnostic_path(
    workspace_root: &Utf8Path,
    reported: &str,
    workspace_paths: &HashSet<String>,
) -> Option<String> {
    let norm = normalize_reported_path(reported);
    if norm.is_empty() {
        return None;
    }

    if let Some(resolved) = resolve_against_known_paths(&norm, workspace_paths) {
        return Some(resolved);
    }

    resolve_on_filesystem(workspace_root, &norm)
}

fn resolve_against_known_paths(norm: &str, workspace_paths: &HashSet<String>) -> Option<String> {
    if workspace_paths.contains(norm) {
        return Some(norm.to_string());
    }
    let mut suffix_matches: Vec<String> = workspace_paths
        .iter()
        .filter(|p| p.ends_with(norm) || p.ends_with(&format!("/{norm}")))
        .cloned()
        .collect();
    suffix_matches.sort_by_key(|p| p.len());
    match suffix_matches.len() {
        0 => None,
        1 => Some(suffix_matches.remove(0)),
        _ => suffix_matches
            .into_iter()
            .find(|p| p.contains("/src/"))
            .or_else(|| {
                workspace_paths
                    .iter()
                    .find(|p| p.ends_with(norm))
                    .cloned()
            }),
    }
}

fn resolve_on_filesystem(workspace_root: &Utf8Path, norm: &str) -> Option<String> {
    let direct = workspace_root.join(norm);
    if direct.is_file() {
        return Some(norm.to_string());
    }

    let Ok(entries) = fs::read_dir(workspace_root.as_std_path()) else {
        return None;
    };
    let mut matches = Vec::new();
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let child_name = entry.file_name().to_string_lossy().to_string();
        if child_name.starts_with('.') {
            continue;
        }
        let candidate = entry.path().join(norm);
        if candidate.is_file() {
            matches.push(format!("{child_name}/{norm}"));
        }
    }
    if matches.len() == 1 {
        return Some(matches.remove(0));
    }
    None
}

/// Détecte et résout une cible diagnostic depuis le message utilisateur.
pub fn ingest_user_diagnostic(
    state: &mut ArchitectRunState,
    user_text: &str,
    workspace_root: &Utf8Path,
) {
    let Some(parsed) = parse_diagnostic_target_from_text(user_text) else {
        return;
    };
    let reported = parsed.workspace_relative_path.clone();
    let resolved = resolve_diagnostic_path(
        workspace_root,
        &reported,
        &state.workspace_paths,
    )
    .unwrap_or(reported);
    state.diagnostic_target = Some(DiagnosticTarget {
        workspace_relative_path: resolved,
        line: parsed.line,
        column: parsed.column,
    });
}

/// Réessaie la résolution quand la carte workspace est chargée.
pub fn refresh_diagnostic_resolution(state: &mut ArchitectRunState, workspace_root: &Utf8Path) {
    let Some(target) = state.diagnostic_target.clone() else {
        return;
    };
    if let Some(resolved) = resolve_diagnostic_path(
        workspace_root,
        &target.workspace_relative_path,
        &state.workspace_paths,
    ) {
        state.diagnostic_target = Some(DiagnosticTarget {
            workspace_relative_path: resolved,
            line: target.line,
            column: target.column,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use camino::Utf8PathBuf;
    use std::io::Write;

    #[test]
    fn parses_next_build_error_path() {
        let text = r"./src/components/animated-background.tsx:92:24
  × Expected '</', got 'ident'";
        let parsed = parse_diagnostic_target_from_text(text).unwrap();
        assert_eq!(
            parsed.workspace_relative_path,
            "src/components/animated-background.tsx"
        );
        assert_eq!(parsed.line, Some(92));
        assert_eq!(parsed.column, Some(24));
    }

    #[test]
    fn resolves_monorepo_child() {
        let tmp = tempfile::tempdir().unwrap();
        let root = Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        let file = root
            .join("app-kdds-main")
            .join("src/components/animated-background.tsx");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::File::create(&file).unwrap().write_all(b"x").unwrap();

        let resolved = resolve_diagnostic_path(
            &root,
            "./src/components/animated-background.tsx",
            &HashSet::new(),
        )
        .unwrap();
        assert_eq!(
            resolved,
            "app-kdds-main/src/components/animated-background.tsx"
        );
    }

    #[test]
    fn strips_workspace_prefix_from_reported_path() {
        assert_eq!(
            normalize_reported_path("/workspace/app-kdds-main/src/foo.tsx"),
            "app-kdds-main/src/foo.tsx"
        );
    }

    #[test]
    fn snapshot_block_mentions_relative_path() {
        let target = DiagnosticTarget {
            workspace_relative_path: "app-kdds-main/src/foo.tsx".into(),
            line: Some(92),
            column: None,
        };
        let block = target.snapshot_block();
        assert!(block.contains("app-kdds-main/src/foo.tsx:92"));
        assert!(block.contains("/workspace/"));
    }
}
