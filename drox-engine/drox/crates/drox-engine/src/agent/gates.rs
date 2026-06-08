//! Gates moteur : blocages avant clôture `[phase: done]` ou exécution d'outil.
//!
//! Gates pré-exécution et clôture ; `RunSpec::gate_enabled` active/désactive par rôle.

use std::collections::HashSet;

use serde_json::Value;

pub(crate) fn task_background_requested(arguments: &Value) -> bool {
    arguments
        .get("background")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

use crate::event::Phase;
use crate::EngineTuning;
use crate::run_spec::{GateKind, RoleId, RunSpec};

use super::architect_gates;
use super::architect_state::ArchitectRunState;
use super::executor_gates;

use super::nudges::MUTATING_TOOLS_FOR_STEP_TRACKING;
use super::phases::phase_from_name_token;

pub(crate) use super::architect_gates::{
    architect_delegate_cap_nudge, architect_orchestration_record_successful_tool,
    architect_record_read_only_tool_success,
};

/// Extensions pour lesquelles une mutation ne déclenche pas la gate `testing` (§2.11).
const NON_CODE_MUTATION_EXTENSIONS: &[&str] = &[
    "md",
    "markdown",
    "txt",
    "gitignore",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "ico",
    "csv",
    "pdf",
];

pub(crate) const CODE_MUTATION_TESTING_NUDGE: &str = "You modified **code** in this run but never entered \
    `[phase: testing]` with a **concrete verification** tool call.\n\
    \n\
    Before your final `[phase: answering]` + `[phase: done]`, you MUST:\n\
    1. Emit `[phase: testing]` on its own line.\n\
    2. Call at least one verification tool in the same turn or the next: `bash` \
    (e.g. `cargo check`, `cargo test`, `npm test`, `pnpm typecheck`, `tsc --noEmit`), \
    `lsp` with diagnostics, or `file_read` on a file you edited.\n\
    \n\
    Do not skip this — the engine will keep refusing `[phase: done]` until testing ran.";

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

pub(crate) const PROFESSOR_DONE_WITHOUT_PLAN: &str = "You emitted `[phase: done]` but never called \
    `course_plan_write` successfully in this run. In Professor mode, end with a course \
    plan visible to the learner: call `course_plan_write`, then `[phase: answering]` + \
    `[phase: done]`, or continue teaching if more work remains.";

pub(crate) const TODO_WRITE_FORBIDDEN_IN_PROFESSOR: &str = "Blocked: `todo_write` is not available \
    in Professor mode. Use `course_plan_write` to maintain the **course plan** instead.";

pub(crate) const PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL: &str = "You tried to invoke a tool named \
    `phase` (or similar) with JSON arguments like `{ \"done\": … }`. That is a \
    misunderstanding: **phase markers are NOT tools**. They MUST appear as \
    **plain text lines** in your assistant message — e.g. `[phase: done]` alone \
    on its own line after your final Markdown answer. Do NOT use `tool_calls` to \
    simulate the protocol. In your NEXT reply, output the literal text line \
    `[phase: done]` (no function call for it). Do NOT rewrite your whole answer \
    unless you still have real work left.";

#[must_use]
fn todo_item_count(args: &Value) -> Option<usize> {
    let todos = args.get("todos")?.as_array()?;
    Some(todos.len())
}

pub(crate) const TODO_RECREATION_BLOCKED: &str = "Blocked: you tried to **replace** \
your previous todo list with a brand-new one. The previous list was \
already all-completed and the new list contains only new ids → that's a \
recreation, not an update. The UI would then show two distinct plans \
side by side, which is exactly what we want to avoid.\n\n\
Resubmit `todo_write` with a payload that **includes the previous items \
as `completed`** (verbatim — same ids, same content) PLUS the new steps \
appended at the end with new ids (`pending` / `in_progress`). One plan \
per run, ever-growing, never replaced.";

pub(crate) const SESSION_END_FORBIDDEN_FOR_MODEL: &str =
    "session_end: this tool is not available from the model. Session closure \
     (new chat thread + long memory on the client) is reserved for the user-triggered \
     `/session_end` command. To archive work: finish the to-do then `[phase: answering]` + \
     `[phase: done]` — the engine already writes `.drox/memory/sessions/` automatically.";

#[must_use]
pub(crate) fn path_extension_lower(path: &str) -> Option<String> {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let ext = name.rsplit('.').next()?;
    if ext == name {
        return None;
    }
    Some(ext.to_ascii_lowercase())
}

#[must_use]
pub(crate) fn path_counts_as_code_mutation(path: &str) -> bool {
    match path_extension_lower(path) {
        Some(ext) => !NON_CODE_MUTATION_EXTENSIONS.contains(&ext.as_str()),
        None => true,
    }
}

#[must_use]
fn tool_mutation_path(arguments: &Value) -> Option<&str> {
    arguments
        .get("path")
        .or_else(|| arguments.get("destination"))
        .or_else(|| arguments.get("source"))
        .and_then(|v| v.as_str())
}

#[must_use]
fn bash_command_counts_as_code_mutation(command: &str) -> bool {
    let lower = command.to_lowercase();
    [
        "git commit",
        "git push",
        "git add",
        "npm install",
        "pnpm install",
        "yarn add",
        "cargo fix",
        "rm -rf",
        "del /f",
        "del /s",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

/// `true` si l'appel d'outil réussi doit activer la gate `testing` (§2.11).
#[must_use]
pub(crate) fn record_counts_as_code_mutation(tool_name: &str, arguments: &Value) -> bool {
    match tool_name {
        "file_edit" | "file_write" | "delete_path" | "copy_path" => tool_mutation_path(arguments)
            .is_some_and(path_counts_as_code_mutation),
        "notebook_edit" => true,
        "bash" => arguments
            .get("command")
            .and_then(|v| v.as_str())
            .is_some_and(bash_command_counts_as_code_mutation),
        _ => false,
    }
}

#[must_use]
pub(crate) fn plan_write_gate_satisfied(
    professor: bool,
    saw_todo_write: bool,
    saw_course_plan: bool,
) -> bool {
    if professor {
        saw_course_plan
    } else {
        saw_todo_write
    }
}

/// Infère la phase visée quand le modèle appelle un pseudo-outil `phase` / `reading` / etc.
#[must_use]
pub(crate) fn parse_hallucinated_phase_from_tool_call(
    name: &str,
    arguments: &Value,
) -> Option<Phase> {
    let raw = name.trim().to_ascii_lowercase();
    let core = raw.trim_end_matches(':').trim();
    if let Some(phase) = phase_from_name_token(core) {
        return Some(phase);
    }
    if core == "phase" || core.starts_with("phase_") {
        if let Some(obj) = arguments.as_object() {
            for key in obj.keys() {
                if let Some(phase) = phase_from_name_token(key) {
                    return Some(phase);
                }
            }
        }
    }
    if core == "set_phase" {
        return arguments
            .get("phase")
            .or_else(|| arguments.get("name"))
            .and_then(|v| v.as_str())
            .and_then(phase_from_name_token);
    }
    None
}

/// Détecte les `tool_calls` qui mimiquent le protocole `[phase: …]`.
#[must_use]
pub(crate) fn is_hallucinated_phase_tool_call(name: &str, arguments: &Value) -> bool {
    if parse_hallucinated_phase_from_tool_call(name, arguments).is_some() {
        return true;
    }
    let raw = name.trim().to_ascii_lowercase();
    let core = raw.trim_end_matches(':').trim();
    if let Some((head, _rest)) = core.split_once(':') {
        if head == "phase" {
            return true;
        }
    }
    if core == "phase" {
        return true;
    }
    if core == "set_phase" || core.starts_with("phase_") {
        return true;
    }
    if core == "done"
        && arguments
            .as_object()
            .is_some_and(|m| m.len() == 1 && m.contains_key("done"))
    {
        return true;
    }
    false
}

/// Extrait la liste des ids du payload `todo_write` et indique si au moins
/// un item est encore actif (`pending` / `in_progress`).
#[must_use]
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

#[must_use]
pub(crate) fn is_todo_recreation_from_scratch(
    new_args: &Value,
    last_ids: &HashSet<String>,
    last_was_all_completed: bool,
) -> bool {
    if !last_was_all_completed || last_ids.is_empty() {
        return false;
    }
    let Some((new_ids, has_active)) = extract_todo_ids_and_active(new_args) else {
        return false;
    };
    if !has_active {
        return false;
    }
    new_ids.iter().all(|id| !last_ids.contains(id))
}

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
         - If something is still left to do: do NOT close. Emit `[phase: reading]` or \
         `[phase: acting]` on its own line, then call the appropriate tool in the SAME reply.\n\
         \n\
         An open todo means the work is not finished."
    )
}

#[must_use]
pub(crate) fn unfinished_course_plan_prompt(pending: u64, active: u64) -> String {
    format!(
        "You emitted `[phase: done]` but your most recent `course_plan_write` still has \
         {pending} step(s) in `pending` and {active} in `active`. Update the **course plan** \
         (`mastered` / `skipped`) or continue teaching the active step before closing.\n\
         \n\
         - If the learner finished the step: `course_plan_write` with that step `mastered`, \
         next step `active`, then `[phase: answering]` + `[phase: done]` if you wait for them.\n\
         - If work remains: do NOT close — continue `[phase: teach]` / `[phase: exercise]`."
    )
}

/// Blocage `[phase: done]` : message `system` à injecter, ou `None` si la gate
/// est désactivée par profil ou la condition n'est pas remplie.
#[must_use]
pub(crate) fn done_gate_missing_answering(spec: &RunSpec) -> Option<&'static str> {
    spec.gate_enabled(GateKind::DoneRequiresAnswering)
        .then_some(MISSING_ANSWERING_PROMPT)
}

#[must_use]
pub(crate) fn done_gate_professor_without_plan(spec: &RunSpec) -> Option<&'static str> {
    spec.gate_enabled(GateKind::ProfessorCoursePlan)
        .then_some(PROFESSOR_DONE_WITHOUT_PLAN)
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

#[must_use]
pub(crate) fn done_gate_unfinished_course_plan(
    spec: &RunSpec,
    pending: u64,
    active: u64,
) -> Option<String> {
    if pending == 0 && active == 0 {
        return None;
    }
    spec.gate_enabled(GateKind::ProfessorCoursePlan)
        .then(|| unfinished_course_plan_prompt(pending, active))
}

#[must_use]
pub(crate) fn done_gate_testing_required(spec: &RunSpec) -> Option<&'static str> {
    spec.gate_enabled(GateKind::TestingAfterCodeMutation)
        .then_some(CODE_MUTATION_TESTING_NUDGE)
}

/// `ask_user_question` uniquement **avant** toute mutation de code dans le run.
pub(crate) const ASK_USER_QUESTION_AFTER_MUTATION: &str =
    "Blocked: `ask_user_question` is only for missing context BEFORE any code mutation in this run. \
     Use read-only tools (`glob`, `grep`, `file_read`, `lsp`) first, or ask in plain Markdown under \
     `[phase: clarifying]` without this tool.";

/// Explore async : file pleine (`task` + `background: true`).
const EXPLORE_TASK_QUEUE_FULL: &str =
    "Blocked: an Explore sub-agent is already running (max concurrent reached). \
     Wait for its report to be injected, or use `background: false` to run synchronously.";

/// Explore async : mutation interdite tant qu'un job tourne.
const EXPLORE_RUNNING_MUTATION_BLOCKED: &str =
    "Blocked: an Explore sub-agent is still running in the background. \
     Wait for its structured report to be injected, or use read-only tools (`file_read`, \
     `grep`, `glob`, `lsp`, `task` with `background: false` only if you must block). \
     Do not mutate files or run shell until the job completes.";

/// Bloque un second `task` async si `max_concurrent` atteint ; nudge Medium si un job tourne déjà.
#[must_use]
pub(crate) fn explore_second_task_block(
    _spec: &RunSpec,
    call_name: &str,
    call_arguments: &Value,
    running_jobs: usize,
    max_concurrent: usize,
) -> Option<String> {
    if call_name != "task" || running_jobs == 0 || !task_background_requested(call_arguments) {
        return None;
    }
    let cap = max_concurrent.max(1);
    if running_jobs >= cap {
        return Some(EXPLORE_TASK_QUEUE_FULL.to_string());
    }
    None
}

/// Gate Low (M5c) : mutations interdites tant qu'un explore async est `running`.
#[must_use]
pub(crate) fn explore_running_mutation_block(
    _spec: &RunSpec,
    running_explore_jobs: usize,
    call_name: &str,
) -> Option<String> {
    if running_explore_jobs == 0 {
        return None;
    }
    if MUTATING_TOOLS_FOR_STEP_TRACKING.contains(&call_name) {
        return Some(EXPLORE_RUNNING_MUTATION_BLOCKED.to_string());
    }
    None
}

/// Gates pré-exécution (hors permissions). `Some(msg)` = bloquer avec erreur.
#[must_use]
pub(crate) fn tool_pre_gate_block(
    spec: &RunSpec,
    call_name: &str,
    call_arguments: &Value,
    professor: bool,
    professor_course_state: &crate::professor::ProfessorCourseState,
    last_todo_ids: &HashSet<String>,
    last_todo_was_all_completed: bool,
    saw_code_mutation_in_run: bool,
    saw_successful_todo_write_in_run: bool,
    architect_state: Option<&ArchitectRunState>,
    executor_deliverable_met: bool,
    workspace: Option<&camino::Utf8Path>,
    drox_ignore: Option<&drox_session::DroxIgnoreMatcher>,
    tuning: &EngineTuning,
) -> Option<String> {
    if let Some(state) = architect_state {
        if let Some(msg) = architect_gates::architect_orchestration_pre_gate(
            spec,
            call_name,
            call_arguments,
            state,
            saw_successful_todo_write_in_run,
            workspace,
            drox_ignore,
            tuning,
        ) {
            return Some(msg);
        }
        if tuning.run_rail_enabled && spec.role_id == RoleId::Architect {
            if let Some(msg) = super::run_rail::tool_pre_gate_rail(&state.rail, call_name) {
                return Some(msg);
            }
        }
    }
    if let Some(msg) = executor_gates::executor_orchestration_pre_gate(
        spec,
        call_name,
        call_arguments,
        executor_deliverable_met,
        tuning,
    ) {
        return Some(msg);
    }
    if call_name == "ask_user_question" && saw_code_mutation_in_run {
        return Some(ASK_USER_QUESTION_AFTER_MUTATION.to_string());
    }
    if professor && call_name == "todo_write" {
        return Some(TODO_WRITE_FORBIDDEN_IN_PROFESSOR.to_string());
    }
    if professor {
        if let Some(msg) = crate::professor::check_mutating_tool(
            call_name,
            call_arguments,
            professor_course_state,
        ) {
            return Some(msg.to_string());
        }
    }
    if is_hallucinated_phase_tool_call(call_name, call_arguments)
        && parse_hallucinated_phase_from_tool_call(call_name, call_arguments).is_none()
    {
        let msg = PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL;
        return Some(msg.to_string());
    }
    if call_name == "session_end" {
        return Some(SESSION_END_FORBIDDEN_FOR_MODEL.to_string());
    }
    if !professor && call_name == "todo_write" {
        let max_todo = spec
            .max_todo_items()
            .or(tuning.max_todo_items.map(|n| n as usize));
        if let Some(max) = max_todo {
            if let Some(count) = todo_item_count(call_arguments) {
                if count > max {
                    return Some(format!(
                        "Blocked: at most {max} `todo_write` items per call \
                        (you sent {count}). Complete or cancel existing items before adding more."
                    ));
                }
            }
        }
        if spec.gate_enabled(GateKind::TodoRecreationBlocked)
            && is_todo_recreation_from_scratch(
                call_arguments,
                last_todo_ids,
                last_todo_was_all_completed,
            )
        {
            return Some(TODO_RECREATION_BLOCKED.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::architect_gates::architect_orchestration_pre_gate;
    use crate::agent::architect_state::ArchitectRunState;
    use crate::EngineTuning;
    use serde_json::json;

    #[test]
    fn hallucinated_phase_tool_detects_common_variants() {
        assert!(is_hallucinated_phase_tool_call("phase", &json!({ "done": "" })));
        assert!(is_hallucinated_phase_tool_call("Phase:", &json!({ "done": "" })));
        assert!(is_hallucinated_phase_tool_call("phase:done", &json!({})));
        assert!(is_hallucinated_phase_tool_call("set_phase", &json!({})));
        assert!(is_hallucinated_phase_tool_call("phase_transition", &json!({})));
        assert!(is_hallucinated_phase_tool_call("done", &json!({ "done": "" })));
        assert!(is_hallucinated_phase_tool_call("reading", &json!({})));
    }

    #[test]
    fn parse_hallucinated_phase_from_reading_tool_name() {
        use crate::event::Phase;
        assert_eq!(
            parse_hallucinated_phase_from_tool_call("reading", &json!({})),
            Some(Phase::Reading)
        );
        assert_eq!(
            parse_hallucinated_phase_from_tool_call("phase:", &json!({ "done": "" })),
            Some(Phase::Done)
        );
    }

    #[test]
    fn architect_redelegate_never_pre_blocked() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        let mut state = ArchitectRunState::new();
        state.delegate_counts.insert("t1".into(), 5);
        let long_instr = "x".repeat(120);
        assert!(architect_orchestration_pre_gate(
            &spec,
            "delegate_executor",
            &json!({ "task_id": "t1", "description": "x", "instructions": long_instr }),
            &state,
            true,
            None,
            None,
            &EngineTuning::from_preset(crate::orchestration::StrictnessPreset::Strict),
        )
        .is_none());
    }

    #[test]
    fn architect_delegate_never_pre_blocked() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        let state = ArchitectRunState::new();
        assert!(architect_orchestration_pre_gate(
            &spec,
            "delegate_executor",
            &json!({ "task_id": "t1" }),
            &state,
            false,
            None,
            None,
            &EngineTuning::default(),
        )
        .is_none());
    }

    #[test]
    fn architect_reads_never_pre_blocked_after_cap() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        let mut state = ArchitectRunState::new();
        state.reads_since_delegate = 99;
        assert!(architect_orchestration_pre_gate(
            &spec,
            "glob",
            &json!({ "pattern": "**/*" }),
            &state,
            true,
            None,
            None,
            &EngineTuning::default(),
        )
        .is_none());
    }

    #[test]
    fn architect_todo_write_has_no_item_cap() {
        let spec = RunSpec::for_orchestration_role(crate::run_spec::RoleId::Architect);
        assert_eq!(spec.max_todo_items(), None);
        let todos: Vec<_> = (1..=20)
            .map(|i| json!({"id": i.to_string(), "content": "x", "status": "pending"}))
            .collect();
        let msg = tool_pre_gate_block(
            &spec,
            "todo_write",
            &json!({ "todos": todos }),
            false,
            &crate::professor::ProfessorCourseState::default(),
            &HashSet::new(),
            false,
            false,
            false,
            None,
            false,
            None,
            None,
            &EngineTuning::default(),
        );
        assert!(msg.is_none());
    }

    #[test]
    fn hallucinated_phase_tool_ignores_real_tools() {
        assert!(!is_hallucinated_phase_tool_call(
            "file_read",
            &json!({ "path": "x" })
        ));
        assert!(!is_hallucinated_phase_tool_call(
            "glob",
            &json!({ "pattern": "**/*" })
        ));
        assert!(!is_hallucinated_phase_tool_call(
            "todo_write",
            &json!({ "todos": [] })
        ));
        assert!(!is_hallucinated_phase_tool_call(
            "bash",
            &json!({ "command": "ls" })
        ));
    }

    #[test]
    fn record_counts_as_code_mutation_heuristic() {
        assert!(record_counts_as_code_mutation(
            "file_edit",
            &json!({ "path": "src/main.rs" })
        ));
        assert!(!record_counts_as_code_mutation(
            "file_edit",
            &json!({ "path": "README.md" })
        ));
        assert!(record_counts_as_code_mutation("notebook_edit", &json!({})));
    }

}
