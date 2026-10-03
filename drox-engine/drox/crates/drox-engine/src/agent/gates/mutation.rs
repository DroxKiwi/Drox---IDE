//! Mutations code : chemins, bash, gate testing (§2.11).

use drox_bash::{BashCommandKind, kind_of_segment, split_command_segments};
use serde_json::Value;

/// Extensions pour lesquelles une mutation ne déclenche pas la gate `testing` (§2.11).
pub(crate) const NON_CODE_MUTATION_EXTENSIONS: &[&str] = &[
    "md",
    "markdown",
    "txt",
    "gitignore",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "ico",
    "csv",
    "pdf",
];

pub(crate) fn path_extension_lower(path: &str) -> Option<String> {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let ext = name.rsplit('.').next()?;
    if ext == name {
        return None;
    }
    Some(ext.to_ascii_lowercase())
}

#[must_use]
pub(crate) fn path_counts_as_code_mutation(path: &str) -> bool {
    match path_extension_lower(path) {
        Some(ext) => !NON_CODE_MUTATION_EXTENSIONS.contains(&ext.as_str()),
        None => true,
    }
}

#[must_use]
pub(crate) fn tool_mutation_path(arguments: &Value) -> Option<&str> {
    arguments
        .get("path")
        .or_else(|| arguments.get("destination"))
        .or_else(|| arguments.get("source"))
        .and_then(|v| v.as_str())
}

#[must_use]
pub(crate) fn bash_command_counts_as_code_mutation(command: &str) -> bool {
    // VCS plumbing never arms the testing gate (commit-only runs, late git add, …).
    let segments = match split_command_segments(command) {
        Ok(s) if !s.is_empty() => s,
        _ => vec![command.trim().to_string()],
    };
    segments.iter().any(|seg| {
        let first = drox_bash::first_executable_token(seg)
            .map(|t| t.rsplit_once('/').map_or(t, |(_, n)| n).to_ascii_lowercase());
        if first.as_deref() == Some("git") {
            return false;
        }
        match kind_of_segment(seg) {
            BashCommandKind::ReadOnly | BashCommandKind::Network => false,
            BashCommandKind::Mutating | BashCommandKind::Destructive | BashCommandKind::Unknown => {
                true
            }
            _ => true,
        }
    })
}

/// `true` si l'appel d'outil réussi doit activer la gate `testing` (§2.11).
#[must_use]
pub(crate) fn record_counts_as_code_mutation(tool_name: &str, arguments: &Value) -> bool {
    match tool_name {
        "file_edit" | "file_write" | "delete_path" | "copy_path" => tool_mutation_path(arguments)
            .is_some_and(path_counts_as_code_mutation),
        "notebook_edit" => true,
        "bash" => arguments
            .get("command")
            .and_then(|v| v.as_str())
            .is_some_and(bash_command_counts_as_code_mutation),
        _ => false,
    }
}
