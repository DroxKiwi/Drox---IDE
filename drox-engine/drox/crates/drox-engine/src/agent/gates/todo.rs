//! Gates planification : todo_write, professeur, recreation, session_end.

use serde_json::Value;

use super::super::phase::bash_is_inspect_only;
use crate::permissions::PermissionPolicy;

/// Liste des outils qui exigent qu'un `todo_write` ait déjà réussi dans le run.
/// La planification est critique **avant mutation**, pas avant exploration :
/// imposer un plan avant d'avoir vu l'arborescence donne souvent des plans
/// génériques ou hors-sujet. On laisse donc passer librement les read-only
/// (`glob`/`file_read`/`grep`/`lsp`/`web_*` **et** `bash` inspectif :
/// `git status` / `git log` / `ls` / …) et on bloque uniquement les
/// écritures et le shell **mutateur** tant que la to-do n'est pas posée.
///
/// Note : `ask_user_question` n'est pas gated — demander une
/// clarification avant de planifier est légitime (cf. phase `clarifying`).

/// `true` si l'outil (avec ses args) exige un `todo_write` préalable.
/// Bash : source de vérité = `drox_bash::command_is_inspect_only_with_workspace`.
#[must_use]
pub(crate) fn requires_todo_write_gate(
    tool_name: &str,
    arguments: &Value,
    workspace_root: &camino::Utf8Path,
) -> bool {
    match tool_name {
        "file_edit" | "file_write" | "notebook_edit" | "delete_path" | "copy_path" => true,
        "bash" => !arguments
            .get("command")
            .and_then(|v| v.as_str())
            .is_some_and(|cmd| bash_is_inspect_only(cmd, workspace_root)),
        _ => false,
    }
}

pub(crate) const MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED: &str = "Blocked: you tried to call a \
    **mutating** tool (`file_edit` / `file_write` / `notebook_edit` / `delete_path` / mutating `bash`) before any successful \
    `todo_write` in this run. Planning is required before any mutation — the user \
    wants to see your plan in the to-do widget BEFORE you start changing files or \
    running write commands. Call `todo_write` first with at least one item describing \
    what you're about to do, then retry your mutation. Read-only exploration \
    (`glob`, `file_read`, `grep`, `lsp`, `web_*`, and inspect-only `bash` such as \
    `git status` / `git log` / `ls` / `dir` / `ls|grep|awk` filters / `dir|findstr` / \
    `cargo check`, and redirects to OS temp / outside the workspace) remains allowed \
    before the plan. Do **not** call `todo_write` just to unlock inspect-only shell — \
    only before real mutations (`git add`/`commit`, `rm`, `sed -i`, redirects into \
    the workspace, …).";

pub(crate) const PROFESSOR_DONE_WITHOUT_PLAN: &str = "You emitted `[phase: done]` but never called \
    `course_plan_write` successfully in this run. In Professor mode, end with a course \
    plan visible to the learner: call `course_plan_write`, then `[phase: answering]` + \
    `[phase: done]`, or continue teaching if more work remains.";

pub(crate) const TODO_WRITE_FORBIDDEN_IN_PROFESSOR: &str = "Blocked: `todo_write` is not available \
    in Professor mode. Use `course_plan_write` to maintain the **course plan** instead.";

#[must_use]
pub(crate) fn is_professor_run(policy: Option<&PermissionPolicy>) -> bool {
    policy.is_some_and(|p| p.mode.is_professor())
}

#[must_use]
pub(crate) fn plan_write_gate_satisfied(professor: bool, saw_todo_write: bool, saw_course_plan: bool) -> bool {
    if professor {
        saw_course_plan
    } else {
        saw_todo_write
    }
}


/// Liste blanche des outils qui comptent comme **étape de travail réel** vis-à-vis
/// du suivi de progression. Si le modèle enchaîne 2 (ou plus) de ces outils
/// sans intercaler un `todo_write`, il est en train de batcher ses étapes
/// au lieu de les cocher au fil de l'eau — symptôme observé sur GLM-4.7-Flash :
/// "0/5 → 5/5" en un seul update. Le moteur injecte alors un nudge soft pour
/// rappeler le contrat "step-by-step".
///
/// On ne compte PAS les outils d'exploration (`glob`, `grep`, `file_read`,
/// `lsp`, `web_*`) : pendant une même étape « comprendre le module X »,
/// le modèle peut avoir besoin de lire 5 fichiers — c'est UNE étape, pas
/// cinq. La granularité utile est l'**action** (édition, exécution shell).
#[must_use]
pub(crate) fn counts_as_mutating_for_step_tracking(
    tool_name: &str,
    arguments: &Value,
    workspace_root: &camino::Utf8Path,
) -> bool {
    match tool_name {
        "file_edit" | "file_write" | "notebook_edit" | "delete_path" | "copy_path" => true,
        "bash" => !arguments
            .get("command")
            .and_then(|v| v.as_str())
            .is_some_and(|cmd| bash_is_inspect_only(cmd, workspace_root)),
        _ => false,
    }
}

/// Nudge soft injecté quand le modèle a accumulé ≥ 2 outils mutateurs depuis
/// son dernier `todo_write`. Ne bloque PAS le tour courant (les outils sont
/// déjà exécutés) — c'est un rappel pour le tour suivant. Volontairement court
/// pour ne pas polluer le contexte si le modèle a une bonne raison de batch.
/// Sprint Plan « un seul plan par run » — message d'erreur tool_result
/// poussé quand le modèle tente de **re-créer** une todo from scratch après
/// avoir clôturé la précédente (cf. règle 7ter du `CORE_SYSTEM_PROMPT`).
pub(crate) const TODO_RECREATION_BLOCKED: &str = "Blocked: you tried to **replace** \
your previous todo list with a brand-new one. The previous list was \
already all-completed and the new list contains only new ids → that's a \
recreation, not an update. The UI would then show two distinct plans \
side by side, which is exactly what we want to avoid.\n\n\
Resubmit `todo_write` with a payload that **includes the previous items \
as `completed`** (verbatim — same ids, same content) PLUS the new steps \
appended at the end with new ids (`pending` / `in_progress`). One plan \
per run, ever-growing, never replaced.";

/// `session_end` n'est pas exposé au LLM ; s'il est quand même émis, on
/// refuse (clôture de session = commande utilisateur `/session_end` dans
/// l'IDE uniquement).
pub(crate) const SESSION_END_FORBIDDEN_FOR_MODEL: &str =
    "session_end: this tool is not available from the model. Ending a session \
     (new chat thread + long memory on the client) is reserved for the user \
     `/session_end` command. To archive work: finish the todo list then \
     `[phase: answering]` + `[phase: done]` — the engine already writes \
     `.drox/memory/sessions/` automatically.";

/// Extrait la liste des ids du payload `todo_write` et indique si au moins
/// un item est encore actif (`pending` / `in_progress`). Retourne `None`
/// si le format est inconnu (auquel cas le moteur laisse passer — le tool
/// fera lui-même son auto-normalisation et son erreur de parse).
pub(crate) fn extract_todo_ids_and_active(args: &Value) -> Option<(Vec<String>, bool)> {
    let todos = args.get("todos")?.as_array()?;
    let mut ids = Vec::with_capacity(todos.len());
    let mut has_active = false;
    for t in todos {
        let id = t.get("id")?.as_str()?.to_string();
        let status = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
        if status == "pending" || status == "in_progress" {
            has_active = true;
        }
        ids.push(id);
    }
    Some((ids, has_active))
}

/// Vraie ssi (a) le plan précédent était fully completed, (b) aucun id du
/// nouveau plan ne provient du précédent, et (c) le nouveau plan contient
/// au moins un item en `pending` ou `in_progress`. Trois conditions
/// strictes pour minimiser les faux positifs.
pub(crate) fn is_todo_recreation_from_scratch(
    new_args: &Value,
    last_ids: &std::collections::HashSet<String>,
    last_was_all_completed: bool,
) -> bool {
    if !last_was_all_completed || last_ids.is_empty() {
        return false;
    }
    let Some((new_ids, has_active)) = extract_todo_ids_and_active(new_args) else {
        return false;
    };
    if !has_active {
        // Si le nouveau plan est lui-même tout en completed, c'est une
        // tentative de rappel/dédup — pas une re-création.
        return false;
    }
    new_ids.iter().all(|id| !last_ids.contains(id))
}
