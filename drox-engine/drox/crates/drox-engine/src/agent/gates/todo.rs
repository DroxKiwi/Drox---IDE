//! Gates planification : todo_write, professeur, recreation, session_end.

use serde_json::Value;

use super::super::phase::bash_is_inspect_only;
use crate::agent_permissions::PermissionPolicy;

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

pub(crate) use drox_prompts::{
	MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED, PROFESSOR_DONE_WITHOUT_PLAN,
	SESSION_END_FORBIDDEN_FOR_MODEL, TODO_RECREATION_BLOCKED, TODO_WRITE_FORBIDDEN_IN_PROFESSOR,
};

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
