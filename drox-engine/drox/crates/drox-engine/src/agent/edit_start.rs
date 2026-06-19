//! Ancrage objectif / demande utilisateur au boot d'un run edit.

use camino::Utf8Path;

use crate::orchestration::initial_run_objective_for_concrete_edit;

use super::diagnostic_target::ingest_user_diagnostic;
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
    workspace_root: Option<&Utf8Path>,
) -> ArchitectEditStartOutcome {
    let mut run_objective = run_objective_override.map(str::to_string);

    if let Some(req) = user_request {
        state.set_user_request_anchor(req);
        if let Some(root) = workspace_root {
            ingest_user_diagnostic(state, req, root);
        }
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
            None,
        );
        assert!(outcome.run_objective.is_some());
        assert!(st.run_objective_anchor.is_some());
    }

    #[test]
    fn edit_start_resolves_build_diagnostic_in_monorepo() {
        let tmp = tempfile::tempdir().unwrap();
        let root = camino::Utf8PathBuf::from_path_buf(tmp.path().to_path_buf()).unwrap();
        let file = root
            .join("app-kdds-main")
            .join("src/components/animated-background.tsx");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::File::create(&file).unwrap();

        let mut st = ArchitectRunState::new();
        let text = "./src/components/animated-background.tsx:92:24\nExpected '</', got 'ident'";
        let _ = apply_architect_edit_start(Some(text), None, &mut st, Some(&root));
        let target = st.diagnostic_target.as_ref().unwrap();
        assert_eq!(
            target.workspace_relative_path,
            "app-kdds-main/src/components/animated-background.tsx"
        );
        assert_eq!(target.line, Some(92));
    }
}
