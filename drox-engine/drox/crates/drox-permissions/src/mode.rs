//! Modes de permission orientés **type de requête** (Nexus Drox).
//!
//! - **`Analyze`** : lecture / exploration sans validation ; écritures **uniquement**
//!   sous `.drox/` (analyses, mémoire, notes de session).
//! - **`TrustEdit`** : comme Analyze pour la lecture, plus **toutes** les éditions
//!   sans confirmation (sauf règles `Deny` explicites).
//! - **`ImNotCrazy`** : lecture sans validation ; **chaque** tentative d'écriture
//!   demande une confirmation utilisateur.
//!
//! Les variants historiques (`Plan`, `AcceptEdits`, `BypassPermissions`, `Default`)
//! restent parsables pour compatibilité JSON / settings.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    /// Legacy — traité comme `ImNotCrazy` à l'évaluation.
    #[default]
    Default,
    /// Legacy — traité comme `Analyze`.
    Plan,
    /// Legacy — traité comme `TrustEdit`.
    AcceptEdits,
    /// Legacy — traité comme `TrustEdit`.
    BypassPermissions,
    /// Analyse : pas d'édition hors `.drox/`.
    Analyze,
    /// Édition libre sans validation.
    TrustEdit,
    /// Lecture libre ; validation par édition.
    ImNotCrazy,
    /// Mode professeur (pédagogie).
    Professor,
}

impl PermissionMode {
    /// Mode effectif pour l'évaluation (normalise les alias legacy).
    #[must_use]
    pub const fn effective(self) -> Self {
        match self {
            Self::Default => Self::ImNotCrazy,
            Self::Plan => Self::Analyze,
            Self::AcceptEdits | Self::BypassPermissions => Self::TrustEdit,
            other => other,
        }
    }

    /// Parse le mode depuis une chaîne libre (case-insensitive).
    #[must_use]
    pub fn from_str_lossy(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "analyze" | "analyse" | "analysis" => Self::Analyze,
            "trustedit" | "trust-edit" | "trust_edit" => Self::TrustEdit,
            "imnotcrazy" | "im-not-crazy" | "im_not_crazy" | "sane" => Self::ImNotCrazy,
            "plan" => Self::Plan,
            "acceptedits" | "accept-edits" | "accept_edits" => Self::AcceptEdits,
            "bypasspermissions" | "bypass-permissions" | "bypass_permissions" | "yolo" => {
                Self::BypassPermissions
            }
            "default" => Self::Default,
            "professor" | "professeur" | "teacher" => Self::Professor,
            _ => Self::ImNotCrazy,
        }
    }

    /// Identifiant court adapté à l'affichage CLI.
    #[must_use]
    pub const fn short_title(self) -> &'static str {
        match self.effective() {
            Self::Analyze => "Analyze",
            Self::TrustEdit => "TrustEdit",
            Self::ImNotCrazy => "ImNotCrazy",
            Self::Professor => "Professeur",
            _ => "ImNotCrazy",
        }
    }

    /// `true` si le mode autorise l'auto-allow sur les écritures (hors `.drox` pour Analyze).
    #[must_use]
    pub const fn auto_allows_writes(self) -> bool {
        matches!(
            self.effective(),
            Self::TrustEdit | Self::Professor
        )
    }

    /// `true` si le mode interdit les écritures hors zone `.drox/` (legacy `Plan` inclus).
    #[must_use]
    pub const fn blocks_writes_outside_drox(self) -> bool {
        matches!(self.effective(), Self::Analyze)
    }

    /// `true` si le mode legacy « plan » bloque **toute** écriture au niveau tool (`plan_mode`).
    #[must_use]
    pub const fn enables_plan_mode_on_tools(self) -> bool {
        matches!(self, Self::Plan)
    }

    /// Bypass complet (chemins sensibles inclus), sauf `Deny` explicite.
    #[must_use]
    pub const fn trust_level_full(self) -> bool {
        matches!(self.effective(), Self::TrustEdit)
    }

    /// Ignore **toutes** les demandes permission (ex. Bash trop fragmenté).
    #[must_use]
    pub const fn skips_permission_asks(self) -> bool {
        matches!(self.effective(), Self::TrustEdit)
    }

    #[must_use]
    pub const fn is_professor(self) -> bool {
        matches!(self, Self::Professor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_new_and_legacy_modes() {
        assert_eq!(PermissionMode::from_str_lossy("analyze"), PermissionMode::Analyze);
        assert_eq!(
            PermissionMode::from_str_lossy("trustEdit"),
            PermissionMode::TrustEdit
        );
        assert_eq!(
            PermissionMode::from_str_lossy("imNotCrazy"),
            PermissionMode::ImNotCrazy
        );
        assert_eq!(PermissionMode::from_str_lossy("plan"), PermissionMode::Plan);
        assert_eq!(
            PermissionMode::from_str_lossy("acceptEdits"),
            PermissionMode::AcceptEdits
        );
        assert_eq!(
            PermissionMode::from_str_lossy("yolo"),
            PermissionMode::BypassPermissions
        );
        assert_eq!(
            PermissionMode::from_str_lossy("unknown-mode"),
            PermissionMode::ImNotCrazy
        );
    }

    #[test]
    fn effective_maps_legacy() {
        assert_eq!(PermissionMode::Default.effective(), PermissionMode::ImNotCrazy);
        assert_eq!(PermissionMode::Plan.effective(), PermissionMode::Analyze);
        assert_eq!(
            PermissionMode::AcceptEdits.effective(),
            PermissionMode::TrustEdit
        );
    }

    #[test]
    fn behavior_helpers_are_consistent() {
        assert!(PermissionMode::Analyze.blocks_writes_outside_drox());
        assert!(!PermissionMode::Analyze.auto_allows_writes());
        assert!(PermissionMode::TrustEdit.trust_level_full());
        assert!(PermissionMode::TrustEdit.auto_allows_writes());
        assert!(!PermissionMode::ImNotCrazy.auto_allows_writes());
        assert!(!PermissionMode::ImNotCrazy.skips_permission_asks());
        assert!(PermissionMode::Plan.enables_plan_mode_on_tools());
    }

    #[test]
    fn round_trip_json() {
        let m = PermissionMode::TrustEdit;
        let s = serde_json::to_string(&m).unwrap();
        assert_eq!(s, "\"trustEdit\"");
        let parsed: PermissionMode = serde_json::from_str(&s).unwrap();
        assert_eq!(parsed, m);
    }
}
