//! Rappels `system` injectés par le moteur (nudges) — distincts des gates bloquantes.

use crate::run_spec::{RunSpec, RoleId};
use crate::subagent_jobs::RunningSubagentJob;
use drox_tools::CANONICAL_ASK_JSON_EXAMPLE;

pub(crate) const ANALYZING_PHASE_NUDGE: &str = "The user asked for a **workspace / repo analysis**. \
     Prefer `[phase: analyzing]` (not generic `[phase: reading]`) for this structural pass. \
     Playbook: `workspace_map_read` if `[Workspace map]` is fresh → targeted `glob` (not blind \
     root rescans) → `grep` + `file_read` with line ranges → `lsp` entry points. Treat \
     `directory_fanout_caps` / `truncated` as signals to refine paths, not as errors. \
     Keep notes telegraphic inside `analyzing`; put the full structured report only in \
     `[phase: answering]`.";

/// Rappel UI quand la pensée native Ollama est activée : le canal thinking /
/// les phases d'exploration ne sont pas la bulle utilisateur.
pub(crate) const NATIVE_THINKING_UI_SUPPLEMENT: &str = "Native provider thinking is shown only inside the \
     collapsed exploration trace in the UI — never as the user-visible chat reply.\n\
     \n\
     Rules:\n\
     - Do NOT write your final report, Markdown analysis, or questions to the user inside \
     `internal_reasoning`, `[phase: reading]`, `[phase: analyzing]`, or `[phase: acting]` prose.\n\
     - Keep exploration notes telegraphic in those phases; call tools there.\n\
     - For the answer the user must read: emit `[phase: answering]` on its own line, write the \
     full structured reply in clean Markdown, then `[phase: done]` on its own line.\n\
     - Do not duplicate the report in both exploration prose and `[phase: answering]`.";

pub(crate) const NUDGE_PROMPT: &str = "Have you fully completed the user's objective?\n\
    \n\
    **IMPORTANT — read this before acting:** This is an engine reminder, NOT \
    a user reply. If your previous `[phase: answering]` ended with a question \
    to the user (\"Do you want me to…?\", \"Shall I…?\", \"Would you like…?\"), \
    treat the answer as NO — the user has NOT responded yet. In that case, \
    you MUST close with `[phase: done]` and wait. Do NOT interpret this \
    engine message as user approval or as permission to proceed autonomously.\n\
    \n\
    - If your last answering block contained a question to the user and you \
      are waiting for their answer → emit ONLY `[phase: done]`. Stop here.\n\
    - If YES (objective fully met, no pending question): emit `[phase: answering]` \
      on its own line, write your final user-facing response in clean Markdown, \
      then end the message with a line containing EXACTLY `[phase: done]`. \
      That is the ONLY way to end the conversation.\n\
    - If NO: emit `[phase: reading]` or `[phase: acting]` (pick what matches \
      your next tool), optionally one short line of intent, then call the \
      next tool **in the same reply** (`glob`, `file_read`, `grep`, `lsp`, \
      `file_edit`, `file_write`, `delete_path`, `bash`, etc.). Stopping with mere intent \
      prose (\"I should verify…\", \"I will read…\") does NOT end your turn — \
      the engine will keep nudging you until you either deliver `[phase: done]` \
      or actually act.";

pub(crate) const DONE_ONLY_NUDGE_PROMPT: &str = "Your previous reply ended inside \
    `[phase: answering]` but did NOT include the final `[phase: done]` marker. \
    The engine only closes the turn on `[phase: done]`.\n\
    \n\
    **Do NOT rewrite, paraphrase, or repeat your answer** — the user already \
    received it. Just send a tiny assistant message containing ONLY:\n\
    \n\
    [phase: done]\n\
    \n\
    Nothing else. No `[phase: answering]`, no Markdown, no recap.";

pub(crate) const MUTATING_TOOL_BEFORE_TODO_WRITE_NUDGE: &str = "Heads-up: you called a **mutating** \
    tool (`file_edit` / `file_write` / `notebook_edit` / `delete_path` / `bash`) before any \
    successful `todo_write` in this run.\n\
    \n\
    **Strongly recommended** (not required by the engine): call `todo_write` with at least \
    one item describing what you are about to do so the user sees your plan in the \
    to-do widget before you change files or run commands. You may continue working, but \
    updating the plan soon improves transparency.\n\
    \n\
    Read-only exploration (`glob`, `file_read`, `grep`, `lsp`, `web_*`, and read-only \
    `bash` such as `ls`) does not need a plan first.";

pub(crate) const MUTATING_TOOLS_FOR_STEP_TRACKING: &[&str] =
    &["file_edit", "file_write", "notebook_edit", "delete_path", "bash"];

/// M5c — rappel en tête de tour tant qu'un explore async tourne.
pub(crate) const EXPLORE_JOBS_PENDING_NUDGE_HEADER: &str =
    "One or more Explore sub-agents are still running in the background (`task` with `background: true`). \
     Their structured report will be injected on a later turn — context gauge (#ctx) does not include them yet.";

/// M5c — second `task` async alors que la file est pleine.
pub(crate) const EXPLORE_TASK_QUEUE_FULL: &str =
    "Blocked: an Explore sub-agent is already running (max concurrent reached). \
     Wait for its report to be injected, or use `background: false` to run synchronously.";

/// M5c — second `task` async recommandé seulement si périmètre disjoint (nudge Medium).
pub(crate) const EXPLORE_SECOND_TASK_NUDGE: &str =
    "An Explore sub-agent is already running. Launch a second `task` with `background: true` only if the \
     scope is clearly **disjoint** and the gain is obvious — otherwise wait for the current report.";

/// Mutations interdites tant qu'un explore async tourne (M5c).
pub(crate) const EXPLORE_RUNNING_MUTATION_BLOCKED: &str =
    "Blocked: an Explore sub-agent is still running in the background. \
     Wait for its structured report to be injected, or use read-only tools (`file_read`, \
     `grep`, `glob`, `lsp`, `task` with `background: false` only if you must block). \
     Do not mutate files or run shell until the job completes.";

pub(crate) const LOOP_DETECTED_NUDGE_PROMPT: &str = "You just repeated the exact same \
output (text and/or tool call) as your previous turn. This is a loop — \
continuing will not converge.\n\nDecide NOW between two paths:\n\n\
1. **Change approach**: identify what's actually missing or wrong (a \
permission denial? a stale tool result? a misread file?) and try a \
different tool, different args, or a different angle. State the new \
hypothesis in `[phase: reading]` or `[phase: acting]` BEFORE acting.\n\n\
2. **Conclude**: if you genuinely have nothing more to do, emit \
`[phase: answering]` with your final answer in Markdown, then \
`[phase: done]`.\n\n\
Repeating the same content again will cause the run to be aborted.";

#[must_use]
pub(crate) fn loop_intervention_user_message(level: &str, kind: &str, turns: u32) -> String {
    match level {
        "warn" => format!(
            "Loop detected ({kind}) — anti-repeat nudge sent to the model."
        ),
        _ => format!(
            "Unresolved loop ({kind}, {turns} identical turns) — stopping this run. \
Rephrase or restart with a more specific objective."
        ),
    }
}

pub(crate) const EXECUTOR_NUDGE_PROMPT: &str = "Continue the **Architect-assigned** task only — **minimal tool use**.\n\
In thinking, refer to **the Architect** as your requester — never « the user wants… ».\n\
Prefer: one `glob` or one `file_read` → `file_write` the `.md` deliverable → stop. Do not re-read files. Do not narrate.";

pub(crate) const ARCHITECT_NUDGE_PROMPT: &str = "Continue the Architect cycle: read the **cycle anchor** (user request + plan), then the last delegation **checkpoint**.\n\
If work remains: verify `partial` tasks, update `todo_write`, delegate the next `in_progress` task.\n\
If **all work is verified and completed**, run **cycle sanity** (smoke test or ask the user), then `architect_help { \"topic\": \"closure\" }` and close with `[phase: answering]` then `[phase: done]`.\n\
Each `delegate_executor` spawns a **blind ephemeral Executor** — narrow `instructions` + `scope` only.\n\
Do not repeat the same verification checklist. Do not restart discovery after compaction.";

pub(crate) const EXECUTOR_DONE_ONLY_NUDGE_PROMPT: &str = "Deliverable `.md` written under `.drox/agent-output/<task_id>/`?\n\
The engine auto-closes when the file exists — stop calling tools.\n\
If already done, emit only `[phase: done]` (no rewrite, no re-read).";

pub(crate) const ARCHITECT_CYCLE_SANITY_NUDGE_PROMPT: &str = "[NUDGE] All plan tasks are **completed** — before the user summary you must run a **cycle sanity check**.\n\
1. **If you can:** `delegate_executor` once with `task_id` `sanity` (or clear smoke instructions) to run the project's test/build/lint command for this stack.\n\
2. **If you cannot** (repo too large, unknown tech, no safe command): `ask_user_question` with a **specific** check for the user.\n\
3. **If the check fails:** `[phase: answering]` must explain the failure and give **concrete fix hints** — do not claim success.\n\
4. **If it passes:** then `[phase: answering]` → `[phase: done]`.\n\
Call `architect_help { \"topic\": \"sanity\" }`. Do **not** emit `[phase: done]` until sanity is resolved.";

pub(crate) const ARCHITECT_CYCLE_SANITY_BLOCK_DONE_PROMPT: &str = "[NUDGE] Blocked: `[phase: done]` is not allowed yet — **cycle sanity** is still pending.\n\
Run a smoke `delegate_executor` or `ask_user_question` for manual verification first (`architect_help { \"topic\": \"sanity\" }`).";

pub(crate) const ARCHITECT_RUN_CLOSABLE_NUDGE_PROMPT: &str = "[NUDGE] Plan tasks and **cycle sanity** are done — **you may close the run**.\n\
1. If needed: **one** `[phase: answering]` with the user-facing summary only (no meta « let me mark done »).\n\
2. Then **one line** `[phase: done]` — **no tools**, no repeated tables, no `workspace_map_read`.\n\
3. Optional: `architect_help { \"topic\": \"closure\" }` if unsure.\n\
The engine will **stop the run** after `[phase: done]` without tools — do not loop.";

pub(crate) const ARCHITECT_DONE_ONLY_NUDGE_PROMPT: &str = "All plan tasks verified and `completed` in `todo_write`?\n\
Emit **one** user summary in `[phase: answering]`, then `[phase: done]` on the next line.\n\
In `[phase: answering]`, write only the report for the user — no English/French meta (« The user asked », « Now I need to », « Let me mark »).\n\
Do not repeat verification prose or re-delegate.";

#[must_use]
pub(crate) fn nudge_prompt(spec: &RunSpec) -> &'static str {
    match spec.role_id {
        RoleId::Architect => ARCHITECT_NUDGE_PROMPT,
        RoleId::Executor => EXECUTOR_NUDGE_PROMPT,
        RoleId::Standard => NUDGE_PROMPT,
    }
}

#[must_use]
pub(crate) fn done_only_nudge_prompt(spec: &RunSpec) -> &'static str {
    match spec.role_id {
        RoleId::Architect => ARCHITECT_DONE_ONLY_NUDGE_PROMPT,
        RoleId::Executor => EXECUTOR_DONE_ONLY_NUDGE_PROMPT,
        RoleId::Standard => DONE_ONLY_NUDGE_PROMPT,
    }
}

#[must_use]
pub(crate) fn loop_detected_nudge_prompt(spec: &RunSpec) -> &'static str {
    match spec.role_id {
        RoleId::Standard | RoleId::Architect | RoleId::Executor => LOOP_DETECTED_NUDGE_PROMPT,
    }
}

/// Nombre d'échecs `ask_user_question` consécutifs avant nudge système (§2.21).
pub(crate) const MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES: u32 = 3;

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

/// Liste télégraphique des jobs explore async en cours (M5c).
#[must_use]
pub(crate) fn format_running_explore_jobs_note(jobs: &[RunningSubagentJob]) -> Option<String> {
    if jobs.is_empty() {
        return None;
    }
    let mut lines = vec![
        "Explore sub-agents still running (async):".to_string(),
    ];
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
