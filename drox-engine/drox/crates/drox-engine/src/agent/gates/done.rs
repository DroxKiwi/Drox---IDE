pub(crate) const VERIFY_NOT_PASSED_PROMPT: &str = "You emitted `[phase: done]` but verification \
    is not complete for this mutation run.\n\
    \n\
    Before closing:\n\
    1. Discover how the repo validates changes (manifests, README, CI configs).\n\
    2. Run the narrowest `bash` or `lsp` check that would catch a regression from your edits.\n\
    3. Or document in `[phase: answering]` with `[verify: waived]` and what you looked at.\n\
    \n\
    Fix failures in ACT with `file_edit`/`file_write`, verify again, then `[phase: answering]` \
    and `[phase: done]`.";

pub(crate) const MISSING_ANSWERING_PROMPT: &str = "You emitted `[phase: done]` without \
    ever using `[phase: answering]` in this run. The engine cannot close yet: \
    your final user-facing reply MUST live inside `[phase: answering]`. Any \
    text written in `reading`, `verifying`, or other reflection phases is \
    hidden in the collapsible trace and the user will not see it.\n\
    \n\
    If you already wrote a full analysis in an earlier assistant message in \
    this run, do **NOT** repeat it. Emit ONLY:\n\
    \n\
    [phase: answering]\n\
    _(See my analysis above.)_\n\
    [phase: done]\n\
    \n\
    Otherwise, move your answer into `[phase: answering]` **once** — no \
    duplicate sections.";

/// Blocage `[phase: done]` : message `system` à injecter, ou `None` si la gate
/// est désactivée par profil ou la condition n'est pas remplie.
#[must_use]
pub(crate) fn done_gate_missing_answering(spec: &RunSpec) -> Option<&'static str> {
    spec.gate_enabled(GateKind::DoneRequiresAnswering)
        .then_some(MISSING_ANSWERING_PROMPT)
}

/// Block `[phase: done]` when mutations ran but verify is not satisfied (B-MOTOR-08).
#[must_use]
pub(crate) fn done_gate_verify_not_passed(
    spec: &RunSpec,
    mutation_count: u32,
    verify_outcome: &crate::agent::rail::VerifyOutcome,
) -> Option<&'static str> {
    if !spec.gate_enabled(crate::run_spec::GateKind::DoneRequiresVerify) {
        return None;
    }
    if spec.role_id != crate::run_spec::RoleId::Architect {
        return None;
    }
    if mutation_count == 0 {
        return None;
    }
    if verify_outcome.satisfied() {
        return None;
    }
    Some(VERIFY_NOT_PASSED_PROMPT)
}
