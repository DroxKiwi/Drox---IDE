//! Modes permission hors contrat 1.4.0 (FOI Phase 2c — Professor retiré).

use drox_permissions::PermissionMode;

/// Message d'erreur stable pour clients IDE / CLI.
pub const PROFESSOR_MODE_REMOVED: &str =
    "permission mode 'professor' was removed in Drox 1.4.0 — see docs/1.4/REPORT/professor-2.0.md";

/// `true` si le mode peut être utilisé pour un run agent (IDE ou CLI).
#[must_use]
pub const fn permission_mode_supported(mode: PermissionMode) -> bool {
    !mode.is_professor()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn professor_mode_is_unsupported() {
        assert!(!permission_mode_supported(PermissionMode::Professor));
        assert!(permission_mode_supported(PermissionMode::Default));
        assert!(permission_mode_supported(PermissionMode::TrustEdit));
    }
}
