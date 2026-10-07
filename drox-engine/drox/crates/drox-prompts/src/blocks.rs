//! Messages de **refus** / erreurs outil renvoyés au modèle (hard gate texte).
//!
//! Distincts des nudges soft (`gates` / `runtime`) : ici le moteur a déjà
//! bloqué l'action ; le body explique comment se débloquer.

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};

// ── Plan / todo gates ───────────────────────────────────────────────────────

pub const MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED: &str = "Blocked: you tried to call a \
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

pub const MUTATING_TOOL_BEFORE_TODO_WRITE_ENTRY: PromptEntry = PromptEntry {
	id: "blocks.mutating_before_todo",
	intent: PromptIntent::Constraint,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "mutating_tool_before_todo_write",
	topics: &["todo_write", "mutation", "plan"],
	claims: &["mutation.before_todo_write=blocked"],
	body: MUTATING_TOOL_BEFORE_TODO_WRITE_BLOCKED,
};

pub const TODO_RECREATION_BLOCKED: &str = "Blocked: you tried to **replace** \
your previous todo list with a brand-new one. The previous list was \
already all-completed and the new list contains only new ids → that's a \
recreation, not an update. The UI would then show two distinct plans \
side by side, which is exactly what we want to avoid.\n\n\
Resubmit `todo_write` with a payload that **includes the previous items \
as `completed`** (verbatim — same ids, same content) PLUS the new steps \
appended at the end with new ids (`pending` / `in_progress`). One plan \
per run, ever-growing, never replaced.";

pub const TODO_RECREATION_BLOCKED_ENTRY: PromptEntry = PromptEntry {
	id: "blocks.todo_recreation",
	intent: PromptIntent::Constraint,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "todo_write_recreation",
	topics: &["todo_write"],
	claims: &["todo.one_plan_per_run=true"],
	body: TODO_RECREATION_BLOCKED,
};

pub const SESSION_END_FORBIDDEN_FOR_MODEL: &str =
	"session_end: this tool is not available from the model. Ending a session \
     (new chat thread + long memory on the client) is reserved for the user \
     `/session_end` command. To archive work: finish the todo list then \
     `[phase: answering]` + `[phase: done]` — the engine already writes \
     `.drox/memory/sessions/` automatically.";

pub const SESSION_END_FORBIDDEN_ENTRY: PromptEntry = PromptEntry {
	id: "blocks.session_end_forbidden",
	intent: PromptIntent::Constraint,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "session_end_tool_call",
	topics: &["session_end"],
	claims: &["session_end.model_callable=forbidden"],
	body: SESSION_END_FORBIDDEN_FOR_MODEL,
};

// ── Professor ───────────────────────────────────────────────────────────────

pub const PROFESSOR_DONE_WITHOUT_PLAN: &str = "You emitted `[phase: done]` but never called \
    `course_plan_write` successfully in this run. In Professor mode, end with a course \
    plan visible to the learner: call `course_plan_write`, then `[phase: answering]` + \
    `[phase: done]`, or continue teaching if more work remains.";

pub const PROFESSOR_DONE_WITHOUT_PLAN_ENTRY: PromptEntry = PromptEntry {
	id: "blocks.professor_done_without_plan",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "professor+done_without_course_plan",
	topics: &["professor", "done", "course_plan"],
	claims: &["professor.done_requires_course_plan=true"],
	body: PROFESSOR_DONE_WITHOUT_PLAN,
};

pub const TODO_WRITE_FORBIDDEN_IN_PROFESSOR: &str = "Blocked: `todo_write` is not available \
    in Professor mode. Use `course_plan_write` to maintain the **course plan** instead.";

pub const TODO_WRITE_FORBIDDEN_IN_PROFESSOR_ENTRY: PromptEntry = PromptEntry {
	id: "blocks.todo_write_forbidden_professor",
	intent: PromptIntent::Constraint,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "professor+todo_write",
	topics: &["professor", "todo_write"],
	claims: &["professor.todo_write=forbidden"],
	body: TODO_WRITE_FORBIDDEN_IN_PROFESSOR,
};

pub const MUTATING_BEFORE_COURSE_PLAN: &str = "Blocked (Professor mode): call `course_plan_write` \
    first with a full course plan (`courseTitle` + `steps`) before any mutating tool. \
    Co-build the plan with the learner (`ask_user_question` if needed).";

pub const MUTATING_BEFORE_COURSE_PLAN_ENTRY: PromptEntry = PromptEntry {
	id: "blocks.professor_mutating_before_plan",
	intent: PromptIntent::Constraint,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "professor+mutating_before_course_plan",
	topics: &["professor", "mutation", "course_plan"],
	claims: &["professor.mutate_before_plan=forbidden"],
	body: MUTATING_BEFORE_COURSE_PLAN,
};

pub const MUTATING_NO_ACTIVE_EXERCISE: &str = "Blocked (Professor mode): mutating tools are only \
    allowed during an **active** `exercise` or `checkpoint` step. If you are teaching, use \
    `[phase: teach]` with short commented excerpts — do not edit project files. When the learner \
    is ready to practice, set that step to `active` via `course_plan_write` with a `workArea`.";

pub const MUTATING_NO_ACTIVE_EXERCISE_ENTRY: PromptEntry = PromptEntry {
	id: "blocks.professor_no_active_exercise",
	intent: PromptIntent::Constraint,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "professor+mutate_outside_exercise",
	topics: &["professor", "mutation"],
	claims: &["professor.mutate_only_exercise_checkpoint=true"],
	body: MUTATING_NO_ACTIVE_EXERCISE,
};

pub const MUTATING_PATH_OUTSIDE_WORK_AREA: &str = "Blocked (Professor mode): this path is outside \
    the active step's `workArea`. Update `course_plan_write` to widen `primaryPaths` / \
    `referencePaths`, or target a file listed there. Sandbox drafts under `.drox/learn/` are \
    always allowed during an active exercise.";

pub const MUTATING_PATH_OUTSIDE_WORK_AREA_ENTRY: PromptEntry = PromptEntry {
	id: "blocks.professor_path_outside_work_area",
	intent: PromptIntent::Constraint,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "professor+path_outside_work_area",
	topics: &["professor", "mutation", "work_area"],
	claims: &["professor.mutate_paths=work_area_or_drox_learn"],
	body: MUTATING_PATH_OUTSIDE_WORK_AREA,
};

// ── Protocol / hallucination ────────────────────────────────────────────────

pub const PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL: &str = "You tried to invoke a tool named \
    `phase` (or similar) with JSON arguments like `{ \"done\": … }`. That is a \
    misunderstanding: **phase markers are NOT tools**. They MUST appear as \
    **plain text lines** in your assistant message — e.g. `[phase: done]` alone \
    on its own line after your final Markdown answer. Do NOT use `tool_calls` to \
    simulate the protocol. In your NEXT reply, output the literal text line \
    `[phase: done]` (no function call for it). Do NOT rewrite your whole answer \
    unless you still have real work left.";

pub const PHASE_MARKER_MUST_BE_TEXT_ENTRY: PromptEntry = PromptEntry {
	id: "blocks.phase_marker_not_tool",
	intent: PromptIntent::Constraint,
	strength: PromptStrength::MustText,
	audience: PromptAudience::Parent,
	when: "hallucinated_phase_tool",
	topics: &["phases", "tool_calls"],
	claims: &["phases.as_tool_call=forbidden"],
	body: PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL,
};
