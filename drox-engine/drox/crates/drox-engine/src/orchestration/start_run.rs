//! Kind de run après routage discuss / edit (RPC ou défaut moteur).

use super::ArchitectGate;

/// Kind de run architecte après résolution du mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartRunKind {
    DiscussWithReads,
    DiscussReplyOnly,
    /// Exploration lecture seule — pas de plan / delegate.
    Analyze,
    Edit,
}

impl StartRunKind {
    #[must_use]
    pub const fn wire_id(self) -> &'static str {
        match self {
            Self::DiscussWithReads => "discuss_with_reads",
            Self::DiscussReplyOnly => "discuss_reply_only",
            Self::Analyze => "analyze",
            Self::Edit => "edit",
        }
    }

    #[must_use]
    pub fn architect_gate(self) -> ArchitectGate {
        match self {
            Self::DiscussWithReads | Self::DiscussReplyOnly => ArchitectGate::Discuss,
            Self::Analyze => ArchitectGate::Analyze,
            Self::Edit => ArchitectGate::Edit,
        }
    }

    #[must_use]
    pub const fn allows_discussion_reads(self) -> bool {
        matches!(self, Self::DiscussWithReads | Self::Analyze)
    }
}

/// Résultat du routage pré-run (discuss vs edit + variante).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GateChainResult {
    pub gate: ArchitectGate,
    pub start_run: StartRunKind,
}

impl GateChainResult {
    #[must_use]
    pub fn from_rpc_override(gate: ArchitectGate) -> Self {
        let start_run = match gate {
            ArchitectGate::Discuss => StartRunKind::DiscussWithReads,
            ArchitectGate::Analyze => StartRunKind::Analyze,
            ArchitectGate::Edit => StartRunKind::Edit,
        };
        Self { gate, start_run }
    }

    /// Défaut produit : salutations / small talk → discuss reply-only ; sinon edit.
    #[must_use]
    pub fn default_for_prompt(prompt: &str) -> Self {
        if looks_like_light_conversation(prompt) {
            Self {
                gate: ArchitectGate::Discuss,
                start_run: StartRunKind::DiscussReplyOnly,
            }
        } else {
            Self {
                gate: ArchitectGate::Edit,
                start_run: StartRunKind::Edit,
            }
        }
    }
}

/// Salutation ou remerciement court — pas de tâche repo (heuristique minimale, pas de gate chain).
#[must_use]
pub fn looks_like_light_conversation(prompt: &str) -> bool {
    let t = prompt.trim();
    if t.is_empty() || t.len() > 120 {
        return false;
    }
    let lower = t.to_ascii_lowercase();
    const ACTION_HINTS: &[&str] = &[
        "fix", "bug", "ajout", "ajoute", "cré", "creer", "crée", "supprim", "refactor", "implement",
        "modif", "fichier", "file ", "code ", "repo", "projet", "build", "test ", "erreur", "error",
        "delegate", "todo", "patch", "merge", "commit", "deploy",
    ];
    if ACTION_HINTS.iter().any(|h| lower.contains(h)) {
        return false;
    }
    const GREETINGS: &[&str] = &[
        "salut", "bonjour", "bonsoir", "hello", "hi", "hey", "coucou", "yo", "hola", "thanks",
        "thank you", "merci", "thx", "ça va", "ca va", "comment vas", "good morning", "good evening",
    ];
    GREETINGS.iter().any(|g| {
        lower == *g
            || lower.starts_with(&format!("{g} "))
            || lower.starts_with(&format!("{g}!"))
            || lower.starts_with(&format!("{g}?"))
            || lower.starts_with(&format!("{g},"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn light_conversation_detects_salut() {
        assert!(looks_like_light_conversation("Salut !"));
        assert!(looks_like_light_conversation("bonjour"));
        assert!(!looks_like_light_conversation(
            "Supprime le spotlight du background"
        ));
        assert!(!looks_like_light_conversation(
            "Peux-tu lire le fichier README et me résumer le projet ?"
        ));
    }

    #[test]
    fn default_for_prompt_routes_salut_to_discuss() {
        let r = GateChainResult::default_for_prompt("Salut !");
        assert_eq!(r.gate, ArchitectGate::Discuss);
        assert_eq!(r.start_run, StartRunKind::DiscussReplyOnly);
    }
}
