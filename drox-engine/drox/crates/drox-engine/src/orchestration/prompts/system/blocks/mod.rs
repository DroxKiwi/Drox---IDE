//! Fichiers texte des blocs (`*.md`) — un fichier = un morceau injectable.

pub mod edit;
pub mod tools;

use crate::orchestration::prompts::vars::PromptVars;

/// Charge un template `.md` et substitue `{placeholders}` depuis [`PromptVars`].
#[must_use]
pub fn render_md(vars: &PromptVars, raw: &str) -> String {
    vars.render(raw)
}

/// Joint des sections avec une ligne vide entre elles.
#[must_use]
pub fn join_sections(sections: &[String]) -> String {
    sections
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}
