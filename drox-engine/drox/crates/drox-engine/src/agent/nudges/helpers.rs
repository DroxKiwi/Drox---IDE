//! Helpers de construction de nudges dynamiques.

use crate::subagent_jobs::RunningSubagentJob;
use drox_tools::CANONICAL_ASK_JSON_EXAMPLE;

use super::standard::MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES;

const EXPLORE_JOBS_PENDING_NUDGE_HEADER: &str =
    "One or more Explore sub-agents are still running in the background (`task` with `background: true`). \
     Their structured report will be injected on a later turn — context gauge (#ctx) does not include them yet.";

const EXPLORE_SECOND_TASK_NUDGE: &str =
    "An Explore sub-agent is already running. Launch a second `task` with `background: true` only if the \
     scope is clearly **disjoint** and the gain is obvious — otherwise wait for the current report.";

#[must_use]
pub(crate) fn step_by_step_todo_nudge(
    unupdated_tools: u32,
    pending: u64,
    in_progress: u64,
) -> String {
    format!(
        "Heads-up: you've called {unupdated_tools} mutating tools \
         (file_edit / file_write / notebook_edit / delete_path / bash) since your last `todo_write`, and your \
         plan still has {pending} pending + {in_progress} in_progress item(s).\n\
         \n\
         The user follows your progress in real time on the todo widget. Don't \
         wait until the end of the run to flip everything to `completed` in one \
         batch — that defeats the whole point of the plan.\n\
         \n\
         Before your next action: emit `todo_write` with the SAME list, but \
         move the finished step(s) to `completed` and the next active step to \
         `in_progress`. Then continue with `[phase: reading]` / `[phase: acting]` + your next \
         tool. One `todo_write` per real step transition is enough — you don't \
         need one between every tool call inside the same step."
    )
}

#[must_use]
pub(crate) fn run_objective_system_block(objective: &str) -> String {
    format!(
        "## Objectif verrouillé (demande utilisateur)\n{}\n\n\
         Fidélité objectif :\n\
         - Une incohérence découverte n'est PAS une tâche implicite : utilise `scope_defer` \
         ou `ask_user_question` avant d'élargir le périmètre.\n\
         - Pas d'audit ni refactor global tant que cet objectif n'est pas atteint.\n\
         - Avant `[phase: done]`, indique brièvement dans ta dernière `[phase: answering]` \
         comment l'objectif est satisfait.",
        objective.trim()
    )
}

fn format_running_explore_jobs_note(jobs: &[RunningSubagentJob]) -> Option<String> {
    if jobs.is_empty() {
        return None;
    }
    let mut lines = vec!["Explore sub-agents still running (async):".to_string()];
    for j in jobs {
        lines.push(format!("- {} — {}", j.job_id, j.description));
    }
    lines.push(EXPLORE_SECOND_TASK_NUDGE.to_string());
    lines.push(
        "You may continue with read-only tools; prefer waiting for reports before large edits."
            .to_string(),
    );
    Some(lines.join("\n"))
}

#[must_use]
pub(crate) fn explore_jobs_pending_nudge(jobs: &[RunningSubagentJob]) -> String {
    let mut out = EXPLORE_JOBS_PENDING_NUDGE_HEADER.to_string();
    if let Some(note) = format_running_explore_jobs_note(jobs) {
        out.push_str("\n\n");
        out.push_str(&note);
    }
    out
}

#[must_use]
pub(crate) fn ask_user_question_loop_nudge() -> String {
    format!(
        "You called `ask_user_question` {MAX} times in a row without success. \
         Either ask the user in plain Markdown under `[phase: clarifying]` (no tool), \
         OR call `ask_user_question` again via native tool_calls with EXACTLY this JSON \
         (do NOT paste JSON in assistant text): {CANONICAL_ASK_JSON_EXAMPLE}",
        MAX = MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
    )
}
