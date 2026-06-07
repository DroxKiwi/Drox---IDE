//! Vérification de fin de cycle architecte (1.3.0) — le projet « fonctionne encore ».
//!
//! Détection **protocolaire** : `task_id: sanity` ou marqueur `[cycle: user_check]` —
//! pas de listes npm/cargo/« vérifiez de votre côté ».

use serde_json::Value;

use crate::orchestration::DelegateStatus;

/// Résultat de la vérification globale avant clôture du run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CycleSanityOutcome {
    /// Plan terminé ; smoke test / validation utilisateur pas encore faite.
    #[default]
    Pending,
    /// Preuve que le projet tourne encore (exécuteur ou lecture ciblée).
    Passed,
    /// Test / build exécuté et en échec — à remonter à l'utilisateur.
    Failed,
    /// L'architecte ne peut pas vérifier seul — demande à l'utilisateur.
    UserDelegated,
}

impl CycleSanityOutcome {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Passed => "passed",
            Self::Failed => "failed",
            Self::UserDelegated => "user_delegated",
        }
    }
}

#[must_use]
pub fn infer_sanity_from_delegate_output(output: &Value) -> Option<CycleSanityOutcome> {
    let status_str = output
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("partial");
    let status = match status_str {
        "completed" => DelegateStatus::Completed,
        "failed" => DelegateStatus::Failed,
        "blocked" => DelegateStatus::Blocked,
        _ => DelegateStatus::Partial,
    };
    let wire_verified = output.get("verified").and_then(|v| v.as_bool()).unwrap_or(false);
    if status == DelegateStatus::Completed && wire_verified {
        return Some(CycleSanityOutcome::Passed);
    }
    if matches!(
        status,
        DelegateStatus::Failed | DelegateStatus::Partial | DelegateStatus::Blocked
    ) {
        return Some(CycleSanityOutcome::Failed);
    }
    None
}

#[must_use]
pub fn cycle_sanity_failed_summary(output: &Value) -> String {
    if let Some(s) = output.get("failure").and_then(|f| f.get("summary")).and_then(|v| v.as_str()) {
        return s.trim().to_string();
    }
    if let Some(s) = output.get("summary").and_then(|v| v.as_str()) {
        return s.trim().to_string();
    }
    output
        .get("status")
        .and_then(|v| v.as_str())
        .map(|s| format!("Delegate status: {s}"))
        .unwrap_or_else(|| "Sanity check delegate did not pass".to_string())
}
