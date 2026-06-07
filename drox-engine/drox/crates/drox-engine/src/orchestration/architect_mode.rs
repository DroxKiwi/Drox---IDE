//! Sous-mode architecte **edit** — le modèle déclare `[mode: discovery]` ou `[mode: task]`.
//!
//! Pas de scan du message utilisateur : seul le texte assistant est parsé
//! (même protocole que [`super::architect_gate`]).

/// Sous-mode une fois la gate `architect_edit` empruntée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ArchitectWorkMode {
    /// Cartographie / audit repo — plan multi-lignes + délégations.
    Discovery,
    /// Livrable ciblé (fix, feature) — défaut si le modèle n'émet rien.
    #[default]
    Task,
}

impl ArchitectWorkMode {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Discovery => "discovery",
            Self::Task => "task",
        }
    }
}

/// Parse `[mode: discovery]` / `[mode: task]` (ligne seule ou en tête de réponse).
#[must_use]
pub fn parse_mode_marker(line: &str) -> Option<ArchitectWorkMode> {
    let trimmed = line.trim();
    let body = trimmed.strip_prefix('[')?.strip_suffix(']')?;
    let (head, raw_name) = body.split_once(':')?;
    if !head.trim().eq_ignore_ascii_case("mode") {
        return None;
    }
    mode_from_token(raw_name)
}

#[must_use]
fn mode_from_token(raw: &str) -> Option<ArchitectWorkMode> {
    let name = raw.trim().to_ascii_lowercase();
    let name = name.replace('_', "-");
    match name.as_str() {
        "discovery" | "discover" | "survey" | "audit" | "map" => Some(ArchitectWorkMode::Discovery),
        "task" | "fix" | "edit" | "work" => Some(ArchitectWorkMode::Task),
        _ => None,
    }
}

/// Première déclaration de mode dans la conversation (assistant).
#[must_use]
pub fn extract_mode_from_text(text: &str) -> Option<ArchitectWorkMode> {
    text.lines().find_map(parse_mode_marker)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_mode_markers() {
        assert_eq!(
            parse_mode_marker("[mode: discovery]"),
            Some(ArchitectWorkMode::Discovery)
        );
        assert_eq!(
            parse_mode_marker("[mode: task]"),
            Some(ArchitectWorkMode::Task)
        );
    }
}
