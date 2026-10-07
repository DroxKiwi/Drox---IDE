//! Nudges runtime injectés par la boucle agent (soft — tools libres).

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};

/// 1.6.0 S-5 — parent enchaîne des lectures sans déléguer Explore.
pub const PARENT_HEAVY_READ_NUDGE: &str = "STOP flooding the parent context with repeated \
    reads / `Get-Content` / `cat` dumps.\n\
    \n\
    If the **Sub-agents — Explore** supplement is present: follow it now \
    (plan if missing → one `task` at the current step kickoff → merge reports only). \
    A prior `bash dir` / listing does **not** authorize parent `file_read` spam on that tree.\n\
    \n\
    Else: `file_read` with **`start_line` + `end_line`** (short ranges) or `grep` — do NOT \
    re-ingest whole docs into this conversation.\n\
    \n\
    Needle lookups on 1–2 known paths may continue with direct tools.";

pub const PARENT_HEAVY_READ_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.s5_heavy_read",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "explore_enabled+parent_heavy_read",
	topics: &["plan_assign_merge", "docs_tree", "explore"],
	claims: &[
		"plan_assign_merge=soft_prefer",
		"docs_tree.inventory=via_explore",
		"parent_dump.docs_tree=forbidden_prefer",
		"bash_dir.docs_tree=not_ingest_license",
	],
	body: PARENT_HEAVY_READ_NUDGE,
};

pub const PARENT_HEAVY_READ_NUDGE_THRESHOLD: u32 = 1;

pub const WORK_PLAN_FRAME_NUDGE: &str = "WORK PLAN FRAME — soft delta (not a hard gate)\n\
    \n\
    This user message is **work** (not chitchat). Prefer mounting/updating a `todo_write` \
    plan early for multi-step work.\n\
    \n\
    If the **Sub-agents — Explore** supplement is present this run, follow that protocol \
    at step kickoff — do **not** restate it here. Tools stay free.";

pub const WORK_PLAN_FRAME_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.work_plan_frame",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "work_plan_frame",
	topics: &["plan_assign_merge", "todo_write"],
	claims: &["plan_assign_merge=soft_prefer"],
	body: WORK_PLAN_FRAME_NUDGE,
};

pub const DOC_INGESTION_EXPLORE_ANNEX: &str = "DOC INGESTION / MULTI-FILE DOCS — soft delta\n\
    \n\
    The user wants to ingest / mirror / rewrite from a **docs tree**.\n\
    \n\
    Follow Plan → Assign → Merge from the **Sub-agents — Explore** supplement when present \
    (do not restate that protocol here). Delta for this run:\n\
    - Prefer **2–4** explore-sized steps (inventory / tone / target page / …). Never one mega Explore.\n\
    - Put absolute outside-workspace paths in `description` + `must_return` (Explore can `file_read` them).\n\
    - Parent: only the **1–2 pages being rewritten** (short line ranges). No docs-tree dump via \
    `file_read` / bash. At most one `bash dir` to confirm the folder exists — **preferred next \
    move is `todo_write`**, then Assign Explore (not more parent inventory).\n\
    - Trust reports; context isolation is intentional.";

/// Soft — work/doc sans `todo_write` après activité outils (toute situation).
/// Tools restent libres (pas de hard gate) ; ignore OK si légitime (needle, etc.).
pub const WORK_WITHOUT_PLAN_NUDGE: &str = "WORK WITHOUT PLAN — soft reminder (not a hard gate)\n\
    \n\
    This run is **work** / docs and you already used tools, but you have **not** called \
    `todo_write` yet.\n\
    \n\
    **Preferred next move:** mount a short `todo_write` plan (2–4 clear steps) now. \
    If the **Sub-agents — Explore** supplement is present, Assign at step kickoff afterward.\n\
    \n\
    If skipping a plan is clearly legitimate (needle / 1–2 known paths / trivial one-shot), \
    you may ignore this reminder and continue. Tools stay free.";

pub const WORK_WITHOUT_PLAN_NUDGE_THRESHOLD: u32 = 2;

pub const WORK_WITHOUT_PLAN_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.work_without_plan",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "work_or_doc_frame+pre_plan_activity_n+no_todo_write",
	topics: &["todo_write", "plan_assign_merge"],
	claims: &[
		"plan_assign_merge=soft_prefer",
		"work.prefer_todo_when_working=prefer",
	],
	body: WORK_WITHOUT_PLAN_NUDGE,
};

pub const DOC_INGESTION_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.doc_ingestion",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "explore_enabled+doc_ingestion",
	topics: &["docs_tree", "plan_assign_merge", "outside_ws", "explore"],
	claims: &[
		"plan_assign_merge=soft_prefer",
		"docs_tree.inventory=via_explore",
		"parent_dump.docs_tree=forbidden_prefer",
		"bash_dir.docs_tree=not_ingest_license",
		"explore.file_read_absolute=same_as_parent",
		"outside_ws.file_read=always",
	],
	body: DOC_INGESTION_EXPLORE_ANNEX,
};

pub const EXPLORE_RESCUE_PARENT_READ_NUDGE: &str = "STOP. A prior Explore was incomplete \
    (`truncated`). Rescuing with parent `file_read` / `grep` / dumps on the same perimeter \
    burns the context window and loses the point of sub-agents.\n\
    \n\
    **Required next action:** spawn **2–4 focused** `task` (`explore`) with explicit \
    `must_return`, OR needle **1–2** known paths only. No third option.";

pub const EXPLORE_RESCUE_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.explore_rescue",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "explore_truncated+parent_heavy_read",
	topics: &["explore", "docs_tree", "plan_assign_merge"],
	claims: &[
		"parent_dump.docs_tree=forbidden_prefer",
		"plan_assign_merge=soft_prefer",
	],
	body: EXPLORE_RESCUE_PARENT_READ_NUDGE,
};

pub const ANALYZING_PHASE_NUDGE: &str = "ANALYSIS FRAME — soft delta\n\
    \n\
    Prefer `[phase: analyzing]` (not generic `[phase: reading]`). Telegraphic notes in \
    `analyzing`; full report only in `[phase: answering]`.\n\
    \n\
    If the **Sub-agents — Explore** supplement is present: follow it \
    (`thoroughness`: `medium` or `very thorough` for overview). Else: `workspace_map_read` \
    if map is fresh → targeted `glob` → `grep` + ranged `file_read` → `lsp`. Treat \
    `directory_fanout_caps` / `truncated` as refine signals. Needles / 1–2 known paths → \
    direct tools.";

pub const ANALYZING_PHASE_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.analyzing_phase",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "session_frames.analysis+explore_tools_without_analyzing",
	topics: &["analyzing", "explore"],
	claims: &["plan_assign_merge=soft_prefer"],
	body: ANALYZING_PHASE_NUDGE,
};

/// Template claims for dynamic STEP KICKOFF (body built at runtime).
pub const STEP_EXPLORE_KICKOFF_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.step_explore_kickoff",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "todo_step_in_progress+explore_enabled",
	topics: &["plan_assign_merge", "explore"],
	claims: &["plan_assign_merge=soft_prefer"],
	body: "STEP KICKOFF — Explore for this step (soft procedure, not a hard gate) — dynamic body",
};

pub fn step_explore_kickoff_nudge(step_id: &str, step_content: Option<&str>) -> String {
	let label = step_content
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or(step_id);
	format!(
		"STEP KICKOFF — Explore for this step (soft procedure, not a hard gate)\n\
         \n\
         Plan step `{step_id}` is now **in_progress**: {label}\n\
         \n\
         Expected next move when `task`/Explore is available:\n\
         - Spawn one focused `task` (`explore`) scoped to **this** step only.\n\
         - Set `plan_step_id` to `{step_id}` when possible.\n\
         - Fill `must_return` with what YOU still need from the child for this step.\n\
         - Put absolute outside-workspace paths in `description` if needed (Explore can `file_read` them).\n\
         - Merge the report before heavy parent reads or mutations for this step.\n\
         \n\
         Needle exception (1–2 known paths) remains allowed. Tools stay free."
	)
}

pub fn context_load_nudge(
	files_effective: usize,
	total_kb: u64,
	load: u64,
	recommended_n: u32,
) -> String {
	format!(
		"[Context load] files≈{files_effective} ≈{total_kb}KB → load={load}. \
Follow the **Sub-agents — Explore** supplement (Plan → Assign at step kickoff → Merge). \
Prefer about **{recommended_n}** explore-sized plan steps; keep only reports in the parent — \
do **not** parent-read the whole tree. Sequential is fine if concurrency is 1. \
Guidance only — a smaller N is OK when scope is clearly tighter."
	)
}

pub fn explore_incomplete_nudge(
	iterations_used: u64,
	max_iterations: u64,
	recommended_n: u32,
) -> String {
	let n = recommended_n.max(2);
	format!(
		"[Explore incomplete] truncated=true iterations_used={iterations_used}/{max_iterations}.\n\
\n\
You are the **session master**. That Explore did not finish cleanly. You receive ONLY \
structured reports — **do not** rescue by flooding the parent with `file_read` / `grep` / \
`Get-Content` on the same perimeter.\n\
\n\
Choose **ONE** predictable path NOW:\n\
1. **Re-split** — `todo_write` then spawn about **{n}** focused `task` (`explore`) missions \
(one concern each). Each call MUST set `must_return` to the acceptance criteria your \
overall mission still needs from that child.\n\
2. **Needle** — only if you already know **1–2** exact paths: ranged `file_read` / `grep` \
on those paths only.\n\
\n\
Forbidden: parent-read spam, re-opening Explore spill JSON, or one new mega-brief `task`."
	)
}
