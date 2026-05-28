//! Vérification de fin de cycle architecte (1.3.0) — le projet « fonctionne encore ».

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

const SANITY_HINTS: &[&str] = &[
    "npm test",
    "npm run test",
    "npm run build",
    "pnpm test",
    "yarn test",
    "cargo test",
    "cargo build",
    "go test",
    "pytest",
    "mvn test",
    "gradle test",
    "dotnet test",
    "composer test",
    "phpunit",
    "make test",
    "make build",
    "lint",
    "smoke",
    "sanity",
    "compile",
    "typecheck",
    "tsc ",
    "vitest",
    "jest",
    "playwright",
    "cypress",
];

const USER_DELEGATION_HINTS: &[&str] = &[
    "verify yourself",
    "verify on your side",
    "test on your side",
    "please run",
    "can you run",
    "could you run",
    "manual check",
    "manual verification",
    "cannot run",
    "can't run",
    "unable to run",
    "too large to test",
    "unknown stack",
    "unfamiliar stack",
    "no test command",
    "pas de commande",
    "vérifiez de votre côté",
    "verifiez de votre cote",
    "pouvez-vous vérifier",
    "peux-tu vérifier",
    "testez de votre côté",
    "testez de votre cote",
];

#[must_use]
pub fn looks_like_sanity_delegate_payload(arguments: &Value) -> bool {
    let mut text = String::new();
    if let Some(tasks) = arguments.get("tasks").and_then(|v| v.as_array()) {
        for item in tasks {
            push_field(item, "task_id", &mut text);
            push_field(item, "description", &mut text);
            push_field(item, "instructions", &mut text);
            push_field(item, "deliverable", &mut text);
        }
    }
    push_field(arguments, "task_id", &mut text);
    push_field(arguments, "description", &mut text);
    push_field(arguments, "instructions", &mut text);
    push_field(arguments, "deliverable", &mut text);
    let lower = text.to_ascii_lowercase();
    if lower.contains("task_id: sanity") || lower.contains("\"sanity\"") {
        return true;
    }
    if lower.split_whitespace().any(|w| w == "sanity" || w.starts_with("sanity_")) {
        return true;
    }
    SANITY_HINTS.iter().any(|h| lower.contains(h))
}

#[must_use]
pub fn looks_like_user_sanity_delegation(arguments: &Value) -> bool {
    let mut text = String::new();
    if let Some(questions) = arguments.get("questions").and_then(|v| v.as_array()) {
        for q in questions {
            push_field(q, "question", &mut text);
            push_field(q, "prompt", &mut text);
            push_field(q, "header", &mut text);
        }
    }
    push_field(arguments, "question", &mut text);
    let lower = text.to_ascii_lowercase();
    USER_DELEGATION_HINTS.iter().any(|h| lower.contains(h))
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

fn push_field(obj: &Value, key: &str, out: &mut String) {
    if let Some(s) = obj.get(key).and_then(|v| v.as_str()) {
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(s);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_sanity_delegate_from_instructions() {
        let args = json!({
            "tasks": [{
                "task_id": "sanity",
                "description": "Smoke test",
                "instructions": "Run npm test in app-kdds-main and report exit code",
                "scope": ["app-kdds-main"]
            }]
        });
        assert!(looks_like_sanity_delegate_payload(&args));
    }

    #[test]
    fn infers_passed_from_completed_verified() {
        let out = json!({ "status": "completed", "verified": true });
        assert_eq!(
            infer_sanity_from_delegate_output(&out),
            Some(CycleSanityOutcome::Passed)
        );
    }

    #[test]
    fn infers_failed_from_partial() {
        let out = json!({ "status": "partial", "verified": false });
        assert_eq!(
            infer_sanity_from_delegate_output(&out),
            Some(CycleSanityOutcome::Failed)
        );
    }

    #[test]
    fn user_delegation_ask_heuristic() {
        let args = json!({
            "questions": [{
                "question": "The repo is too large for a full build here — can you run npm test locally and confirm?"
            }]
        });
        assert!(looks_like_user_sanity_delegation(&args));
    }
}
