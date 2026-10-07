//! Nudges de gates boucle (done / testing / intent-write / loops / todos).
//!
//! Soft côté tools : le moteur refuse certaines clôtures, mais les outils
//! restent appelables. Les builders dynamiques ont une fiche catalogue avec
//! body template (claims + intent) ; le texte runtime est produit par `fn`.

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};

// ── Testing after code mutation ─────────────────────────────────────────────

pub const CODE_MUTATION_TESTING_NUDGE: &str = "You modified **code** in this run but never entered \
    `[phase: testing]` with a **concrete verification** tool call.\n\
    \n\
    Before your final `[phase: answering]` + `[phase: done]`, you MUST:\n\
    1. Emit `[phase: testing]` on its own line.\n\
    2. Call at least one verification tool in the same turn or the next: `bash` \
    (e.g. `cargo check`, `cargo test`, `npm test`, `pnpm typecheck`, `tsc --noEmit`), \
    `lsp` with diagnostics, or `file_read` on a file you edited.\n\
    \n\
    Do not skip this — the engine will keep refusing `[phase: done]` until testing ran.";

pub const CODE_MUTATION_TESTING_ENTRY: PromptEntry = PromptEntry {
	id: "gates.code_mutation_testing",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "code_mutated+no_testing",
	topics: &["testing", "done", "phases"],
	claims: &["done.requires_testing_after_code_mutation=true"],
	body: CODE_MUTATION_TESTING_NUDGE,
};

// ── Repeated file_read ──────────────────────────────────────────────────────

pub const REPEATED_FILE_READ_NUDGE_THRESHOLD: u32 = 3;

pub const REPEATED_FILE_READ_NUDGE: &str = "STOP re-reading the same file.\n\
    \n\
    You already successfully `file_read` the same path multiple times in this run. \
    Do **not** call `file_read` (or bash `Get-Content`/`cat`/`type`) on it again.\n\
    \n\
    Next step — pick ONE:\n\
    1. If you have enough context: write / edit (`file_write`/`file_edit`) or answer \
       (`[phase: answering]` + `[phase: done]`).\n\
    2. If you still need broad understanding: delegate one or more focused `task` \
       (`explore`) missions (short `title` + scoped `description`), then act from the reports.\n\
    3. If you need a different slice of another file: read a **new** path or a clearly \
       different line range on a file you have not already fully covered.\n\
    \n\
    Re-reading the same path burns context and loops the run.";

pub const REPEATED_FILE_READ_ENTRY: PromptEntry = PromptEntry {
	id: "gates.repeated_file_read",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "same_file_read_n_times",
	topics: &["file_read", "explore", "plan_assign_merge"],
	claims: &[
		"file_read.same_path_spam=forbidden_prefer",
		"plan_assign_merge=soft_prefer",
	],
	body: REPEATED_FILE_READ_NUDGE,
};

// ── Done-driven completion ──────────────────────────────────────────────────

pub const NUDGE_PROMPT: &str = "Have you fully completed the user's objective?\n\
    \n\
    **IMPORTANT — read this before acting:** This is an engine reminder, NOT \
    a user reply. Do NOT treat it as user approval.\n\
    \n\
    **Before `[phase: done]`, the engine enforces this order** (a later step is \
    refused until earlier ones are clear):\n\
    1. At least one `[phase: answering]` must have happened in the run.\n\
    2. If your todo list still has `pending` / `in_progress` items → call \
    `todo_write` to close them (or keep working). Bare `[phase: done]` will be refused.\n\
    3. If you mutated **code** this run and never ran `[phase: testing]` + a \
    verification tool → do that first. Bare `[phase: done]` will be refused.\n\
    4. If your last answering asked the user a question and you are waiting → \
    emit ONLY `[phase: done]` and stop (do not start new work).\n\
    5. Otherwise: `[phase: answering]` + final Markdown reply + `[phase: done]`.\n\
    \n\
    - If work remains: `[phase: reading]` or `[phase: acting]` then a real tool \
    call in the same reply. Intent prose alone (\"I should verify…\") does not \
    end the turn.";

pub const NUDGE_PROMPT_ENTRY: PromptEntry = PromptEntry {
	id: "gates.continue_without_done",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "no_phase_done",
	topics: &["done", "phases", "todo_write", "testing"],
	claims: &[
		"done.requires_answering=true",
		"done.requires_closed_todos=true",
		"done.requires_testing_after_code_mutation=true",
	],
	body: NUDGE_PROMPT,
};

pub const DONE_ONLY_NUDGE_PROMPT: &str = "Your previous reply ended inside \
    `[phase: answering]` but did NOT include the final `[phase: done]` marker. \
    The engine only closes the turn on `[phase: done]`.\n\
    \n\
    Your todo list is closed and no testing gate is pending. Do NOT rewrite your \
    answer. Do NOT start new tools. In your next reply emit ONLY:\n\
    \n\
    [phase: done]\n\
    \n\
    (Optionally keep a one-line `[phase: answering]` if required by your stack — \
    still no new tool calls.)";

pub const DONE_ONLY_ENTRY: PromptEntry = PromptEntry {
	id: "gates.done_only",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "answering_without_done+gates_clear",
	topics: &["done", "phases"],
	claims: &["done.marker_required=true"],
	body: DONE_ONLY_NUDGE_PROMPT,
};

pub const MISSING_ANSWERING_PROMPT: &str = "You emitted `[phase: done]` without \
    ever using `[phase: answering]` in this run. The engine cannot close yet: \
    your final user-facing reply MUST live inside `[phase: answering]`. Any \
    text written in `reading`, `verifying`, or other reflection phases is \
    hidden in the collapsible trace and the user will not see it.\n\
    \n\
    Re-send your final response NOW in this exact shape, even if it repeats \
    what you already wrote:\n\
    \n\
    [phase: answering]\n\
    <your full user-facing answer in Markdown>\n\
    [phase: done]";

pub const MISSING_ANSWERING_ENTRY: PromptEntry = PromptEntry {
	id: "gates.missing_answering",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "done_without_answering",
	topics: &["done", "answering", "phases"],
	claims: &["done.requires_answering=true"],
	body: MISSING_ANSWERING_PROMPT,
};

// ── Intent-only write (FX-B) ────────────────────────────────────────────────

pub const INTENT_ONLY_WRITE_NUDGE_PROMPT: &str = "STOP. You described writing or \
    editing a file in plain text, but you did NOT emit any native `tool_calls`.\n\
    \n\
    Intent prose alone does nothing. In your NEXT reply you MUST either:\n\
    1. Emit a real `file_write` or `file_edit` tool call (preferred — same \
       reply as a short `[phase: acting]` line). Prefer a **small** first \
       write: skeleton + 1–2 sections, then `file_edit` for the rest — do \
       NOT attempt a multi-section / \"complete page\" rewrite in one call, OR\n\
    2. If you cannot mutate, explain why briefly in `[phase: answering]` then \
       emit `[phase: done]`.\n\
    \n\
    Do NOT repeat \"I will write / Je vais écrire\". Call the tool NOW.";

pub const INTENT_ONLY_WRITE_ENTRY: PromptEntry = PromptEntry {
	id: "gates.intent_only_write",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "mutation_intent_without_tool_call",
	topics: &["mutation", "tool_calls"],
	claims: &[
		"mutation.intent_prose_only=forbidden",
		"mutation.prefer_chunked_writes=true",
	],
	body: INTENT_ONLY_WRITE_NUDGE_PROMPT,
};

pub const INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT: &str = "You still have not called \
    a mutating tool after announcing a write/edit. This is your last chance \
    before the engine aborts the run.\n\
    \n\
    Emit a native `file_write` (or `file_edit`) tool call NOW with a **small** \
    payload — skeleton or first section only. Example shape:\n\
    `{ \"path\": \"relative/or/absolute/path.ext\", \"content\": \"/* skeleton */\\n...\" }`\n\
    \n\
    Or `file_edit` with `{ \"path\", \"old_string\", \"new_string\" }` to append \
    the next section. Forbidden: announce \"full page / all sections / one big \
    file_write\" without a tool_call. No more announcement-only replies.";

pub const INTENT_ONLY_WRITE_EXAMPLE_ENTRY: PromptEntry = PromptEntry {
	id: "gates.intent_only_write_example",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "mutation_intent_without_tool_call+strike2",
	topics: &["mutation", "tool_calls"],
	claims: &[
		"mutation.intent_prose_only=forbidden",
		"mutation.prefer_chunked_writes=true",
	],
	body: INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT,
};

pub const LARGE_WRITE_CHUNK_NUDGE_PROMPT: &str = "STOP. You announced a \
    **large** write (whole file / complete page / many sections / one big \
    `file_write`) in plain text, but you did NOT emit any native `tool_calls`.\n\
    \n\
    Oversized one-shot writes often fail to become tool_calls. In your NEXT \
    reply you MUST:\n\
    1. Emit `file_write` with a **skeleton** (imports + headings + 1–2 short \
       sections only), OR\n\
    2. Emit `file_edit` that adds **one** section to an existing file,\n\
    then continue section-by-section in later turns.\n\
    \n\
    Do NOT try to paste the entire multi-section page in one tool call. Do NOT \
    repeat \"I'll write the whole file / J'écris la page complète\".";

pub const LARGE_WRITE_CHUNK_ENTRY: PromptEntry = PromptEntry {
	id: "gates.large_write_chunk",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "large_write_intent_without_tool_call",
	topics: &["mutation", "tool_calls"],
	claims: &[
		"mutation.intent_prose_only=forbidden",
		"mutation.prefer_chunked_writes=true",
	],
	body: LARGE_WRITE_CHUNK_NUDGE_PROMPT,
};

pub const INTENT_ONLY_WRITE_MAX_NUDGES: u32 = 2;
pub const INTENT_ONLY_LARGE_WRITE_MAX_NUDGES: u32 = 3;

// ── Loop detection ──────────────────────────────────────────────────────────

pub const LOOP_DETECTED_NUDGE_PROMPT: &str = "You just repeated the exact same \
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

pub const LOOP_DETECTED_ENTRY: PromptEntry = PromptEntry {
	id: "gates.loop_detected",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "strict_turn_repeat",
	topics: &["loop", "phases"],
	claims: &["loop.strict_repeat=change_or_conclude"],
	body: LOOP_DETECTED_NUDGE_PROMPT,
};

pub const LOOP_TOOL_FAMILY_NUDGE_PROMPT: &str = "You are repeating the same shell/search \
tool family with only cosmetic changes (case, retry labels, duplicated commands). \
That will not converge.\n\n\
1. **Stop retrying the same findstr/grep/bash** — treat empty stdout + exit 1 as \
\"no matches\" (not a crash), OR switch to `file_read` / `codebase_search`.\n\
2. **Or conclude**: `[phase: answering]` with what you already know, then `[phase: done]`.\n\n\
Repeating the same search family again will abort the run.";

pub const LOOP_TOOL_FAMILY_ENTRY: PromptEntry = PromptEntry {
	id: "gates.loop_tool_family",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "tool_family_repeat",
	topics: &["loop", "bash", "grep"],
	claims: &["loop.tool_family_repeat=change_or_conclude"],
	body: LOOP_TOOL_FAMILY_NUDGE_PROMPT,
};

// ── Dynamic builders (catalogue = template + claims) ────────────────────────

pub const STEP_BY_STEP_TODO_ENTRY: PromptEntry = PromptEntry {
	id: "gates.step_by_step_todo",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "mutating_tools_without_todo_update",
	topics: &["todo_write", "plan_assign_merge"],
	claims: &["todo.progress_realtime=prefer"],
	body: "STEP-BY-STEP TODO — dynamic body (unupdated_tools / pending / in_progress)",
};

pub fn step_by_step_todo_nudge(unupdated_tools: u32, pending: u64, in_progress: u64) -> String {
	format!(
		"Heads-up: you've called {unupdated_tools} mutating tools \
         (file_edit / file_write / notebook_edit / delete_path / copy_path / mutating bash) \
         since your last `todo_write`, and your \
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
         need one between every tool call inside the same step. \
         Inspect-only bash (ls/dir/git status/…) does not count toward this reminder."
	)
}

pub const UNFINISHED_TODOS_ENTRY: PromptEntry = PromptEntry {
	id: "gates.unfinished_todos",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "done_with_open_todos",
	topics: &["done", "todo_write"],
	claims: &["done.requires_closed_todos=true"],
	body: "UNFINISHED TODOS — dynamic body (pending / in_progress)",
};

pub fn unfinished_todos_prompt(pending: u64, in_progress: u64) -> String {
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

pub const UNFINISHED_COURSE_PLAN_ENTRY: PromptEntry = PromptEntry {
	id: "gates.unfinished_course_plan",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "done_with_open_course_plan",
	topics: &["done", "professor", "course_plan"],
	claims: &["professor.done_requires_closed_plan=true"],
	body: "UNFINISHED COURSE PLAN — dynamic body (pending / active)",
};

pub fn unfinished_course_plan_prompt(pending: u64, active: u64) -> String {
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

pub const RUN_OBJECTIVE_ENTRY: PromptEntry = PromptEntry {
	id: "gates.run_objective",
	intent: PromptIntent::Constraint,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "locked_objective",
	topics: &["objective", "scope"],
	claims: &["objective.locked=prefer_fidelity"],
	body: "LOCKED OBJECTIVE — dynamic body (objective text)",
};

pub fn run_objective_system_block(objective: &str) -> String {
	format!(
		"## Locked objective (user request)\n{}\n\n\
         Objective fidelity:\n\
         - A discovered inconsistency is NOT an implicit task: use `scope_defer` \
         or `ask_user_question` before widening scope.\n\
         - No global audit or refactor until this objective is met.\n\
         - Before `[phase: done]`, briefly state in your last `[phase: answering]` \
         how the objective is satisfied.",
		objective.trim()
	)
}

pub const RUN_OBJECTIVE_DONE_ENTRY: PromptEntry = PromptEntry {
	id: "gates.run_objective_done",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "done_with_locked_objective",
	topics: &["objective", "done"],
	claims: &["objective.locked=prefer_fidelity"],
	body: "OBJECTIVE DONE CHECK — dynamic body (objective text)",
};

pub fn run_objective_done_nudge(objective: &str) -> String {
	format!(
		"You emitted `[phase: done]`. Before closing: in `[phase: answering]`, briefly \
         recall in **one short sentence** how the locked objective is satisfied, then \
         `[phase: done]` again.\n\nObjective: {}",
		objective.trim()
	)
}

pub const MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES: u32 = 3;

pub const ASK_USER_QUESTION_LOOP_ENTRY: PromptEntry = PromptEntry {
	id: "gates.ask_user_question_loop",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "ask_user_question_failures",
	topics: &["ask_user_question", "clarifying"],
	claims: &["ask_user_question.loop=clarify_or_canonical_json"],
	body: "ASK_USER_QUESTION LOOP — dynamic body (needs canonical JSON example from tools)",
};

/// `canonical_ask_json_example` = [`drox_tools::CANONICAL_ASK_JSON_EXAMPLE`] (évite
/// une dépendance circulaire `drox-prompts` → `drox-tools`).
pub fn ask_user_question_loop_nudge(canonical_ask_json_example: &str) -> String {
	format!(
		"You called `ask_user_question` {MAX} times in a row without success. \
         Either ask the user in plain Markdown under `[phase: clarifying]` (no tool), \
         OR call `ask_user_question` again via native tool_calls with EXACTLY this JSON \
         (do NOT paste JSON in assistant text): {canonical_ask_json_example}",
		MAX = MAX_CONSECUTIVE_ASK_USER_QUESTION_FAILURES,
	)
}
