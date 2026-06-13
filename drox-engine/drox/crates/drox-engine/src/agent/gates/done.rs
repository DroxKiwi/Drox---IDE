pub(crate) const MISSING_MUTATION_WHEN_EXPECTED_PROMPT: &str = "You emitted `[phase: done]` \
    but this run requested a **workspace change** and no mutation tool succeeded yet \
    (`file_edit`, `file_write`, `notebook_edit`, `delete_path`).\n\
    \n\
    - If the repo **already matches** the request: say so clearly in `[phase: answering]` \
    (e.g. that no file change is needed), then `[phase: done]`.\n\
    - Otherwise: move to **ACT** (`[gate: advance]` if needed), call `file_edit` or \
    `file_write` on the target path, verify if useful, then answer and close.";

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

#[must_use]
pub(crate) fn unfinished_todos_prompt(pending: u64, in_progress: u64) -> String {
    format!(
        "You emitted `[phase: done]` but your most recent `todo_write` still has \
         {pending} item(s) in `pending` and {in_progress} item(s) in `in_progress`. \
         The engine cannot close yet — the todo list must mirror reality before you \
         end the turn.\n\
         \n\
         Decide which case you're in, then act:\n\
         \n\
         - If the remaining items are ACTUALLY done (you just forgot to update them): \
         call `todo_write` again with the SAME items, but flip their `status` to \
         `completed` (or `cancelled` if no longer relevant). Then emit \
         `[phase: answering]` + your final reply + `[phase: done]`.\n\
         - If something is still left to do: do NOT close. Declare `[gate: advance]` to the \
         work station (ACT) if needed, then call the appropriate tool in the SAME reply.\n\
         \n\
         An open todo means the work is not finished."
    )
}

/// Block `[phase: done]` on edit runs that expected mutation but none succeeded.
#[must_use]
pub(crate) fn done_gate_missing_mutation_when_expected(
    spec: &RunSpec,
    mutation_expected: bool,
    mutation_count: u32,
    _recent_assistant_text: &str,
) -> Option<&'static str> {
    if spec.role_id != crate::run_spec::RoleId::Architect
        || !mutation_expected
        || mutation_count > 0
    {
        return None;
    }
    Some(MISSING_MUTATION_WHEN_EXPECTED_PROMPT)
}

/// Blocage `[phase: done]` : message `system` à injecter, ou `None` si la gate
/// est désactivée par profil ou la condition n'est pas remplie.
#[must_use]
pub(crate) fn done_gate_missing_answering(spec: &RunSpec) -> Option<&'static str> {
    spec.gate_enabled(GateKind::DoneRequiresAnswering)
        .then_some(MISSING_ANSWERING_PROMPT)
}

#[must_use]
pub(crate) fn done_gate_unfinished_todos(
    spec: &RunSpec,
    pending: u64,
    in_progress: u64,
) -> Option<String> {
    if pending == 0 && in_progress == 0 {
        return None;
    }
    spec.gate_enabled(GateKind::TodoStaleBeforeDone)
        .then(|| unfinished_todos_prompt(pending, in_progress))
}
