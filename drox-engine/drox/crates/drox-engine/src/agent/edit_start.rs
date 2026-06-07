//! Ancrage objectif / demande utilisateur au boot d'un run edit.

use crate::orchestration::initial_run_objective_for_concrete_edit;

use super::ArchitectRunState;

/// Résultat du boot edit (objectif verrouillé éventuel).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchitectEditStartOutcome {
    pub run_objective: Option<String>,
}

/// Ancre la demande utilisateur et un objectif concret si détecté.
#[must_use]
pub fn apply_architect_edit_start(
    user_request: Option<&str>,
    run_objective_override: Option<&str>,
    state: &mut ArchitectRunState,
) -> ArchitectEditStartOutcome {
    let mut run_objective = run_objective_override.map(str::to_string);

    if let Some(req) = user_request {
        state.set_user_request_anchor(req);
    }

    if run_objective.is_none() {
        run_objective = user_request.and_then(initial_run_objective_for_concrete_edit);
    }
    if let Some(ref obj) = run_objective {
        state.anchor_run_objective(obj);
    }

    ArchitectEditStartOutcome { run_objective }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edit_start_anchors_objective_from_user_message() {
        let mut st = ArchitectRunState::new();
        let outcome = apply_architect_edit_start(
            Some("Remove animated background from hero"),
            None,
            &mut st,
        );
        assert!(outcome.run_objective.is_some());
        assert!(st.run_objective_anchor.is_some());
    }

    #[test]
    fn edit_start_anchors_greeting_as_objective_when_present() {
        let mut st = ArchitectRunState::new();
        let outcome = apply_architect_edit_start(Some("Salut"), None, &mut st);
        assert_eq!(outcome.run_objective.as_deref(), Some("Salut"));
    }
}
