//! Nudges runtime injectés par la boucle agent (soft — tools libres).

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};

/// 1.6.0 S-5 — parent enchaîne des lectures sans déléguer Explore.
pub const PARENT_HEAVY_READ_NUDGE: &str = "STOP flooding the parent context with repeated \
    reads / `Get-Content` / `cat` dumps.\n\
    \n\
    For **understanding, synthesis, multi-file, or a docs tree**: if `task` (Explore) is available, \
    you are the **session master** — **Plan → Assign (at step kickoff) → Merge**:\n\
    1. If you have no plan yet: `todo_write` with focused explore-sized steps \
    (2–4, or Context-load recommended_n).\n\
    2. At the current `in_progress` kickoff: spawn **one** `task` (`explore`) for **that** \
    step with `must_return` filled — not a blind multi-Explore fan-out outside the plan.\n\
    3. Keep only the returned **summary** / **report_path** in the parent.\n\
    \n\
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

pub const WORK_PLAN_FRAME_NUDGE: &str = "WORK PLAN FRAME — procedure (not a hard gate)\n\
    \n\
    This user message is **work** (not chitchat). Your expected procedure:\n\
    1. Mount or update a `todo_write` plan with clear steps for the ask.\n\
    2. When you start a step (`in_progress`), gather info for **that** step with \
    a focused `task` (`explore`) when Explore is available — then merge the report.\n\
    3. Tools stay free: you may deviate, but this frame is the strongly preferred path.\n\
    \n\
    Do **not** skip planning for multi-step work.";

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

pub const DOC_INGESTION_EXPLORE_ANNEX: &str = "DOC INGESTION / MULTI-FILE DOCS — engine directive\n\
    \n\
    The user asked you to take knowledge of a **docs tree** and/or rewrite / replace \
    documentation pages from that source.\n\
    \n\
    Same soft frame as CORE: **Plan** (`todo_write`) → at each step kickoff **Assign** \
    a focused `task` (`explore`) with `must_return` → **Merge** reports → mutate \
    target pages in the parent.\n\
    \n\
    Prefer **2–4** explore steps (inventory / tone / target page / …). Never one mega Explore.\n\
    \n\
    The Explore sub-agent does **not** see this chat — put every needed fact into \
    `description` + `must_return` (including absolute paths outside the workspace).\n\
    Explore may `file_read` those absolute paths (read-only, same as parent).\n\
    \n\
    Parent may `file_read` only the **1–2 pages being rewritten** (short line ranges). \
    Do **NOT** dump the whole docs tree into the parent via `file_read` / bash dumps. \
    A single `bash dir` to confirm the folder exists is OK — then **Assign Explore** for inventory.\n\
    \n\
    Trust the reports. Context isolation is intentional.";

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

pub const ANALYZING_PHASE_NUDGE: &str = "The user asked for a **workspace / repo analysis** \
     or topic understanding. Prefer `[phase: analyzing]` (not generic `[phase: reading]`). \
     If the `task` tool is available this run, prefer **Plan → Assign at step kickoff**: \
     mount/update `todo_write`, then spawn one focused `task` (`explore`) when a step becomes \
     `in_progress` (`thoroughness`: `medium` or `very thorough`) — keep only the returned report \
     in the parent. Do **not** fan out Explore before the plan. Needles or 1–2 known paths → \
     direct tools. Otherwise playbook: `workspace_map_read` if `[Workspace map]` is fresh → \
     targeted `glob` → `grep` + ranged `file_read` → `lsp`. Treat `directory_fanout_caps` / \
     `truncated` as refine signals. Telegraphic notes in `analyzing`; full report only in \
     `[phase: answering]`.";

pub const ANALYZING_PHASE_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.analyzing_phase",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "workspace_analysis_detected",
	topics: &["plan_assign_merge", "analyzing", "explore"],
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
You are the **session master**: you only keep Explore **reports**. \
**Plan → Assign (at step kickoff) → Merge**:\n\
1. `todo_write` with about **{recommended_n}** explore-sized **plan steps** \
(one subtree / one question each).\n\
2. At each step kickoff (`in_progress`), spawn **one** focused `task` (`explore`) for \
**that** step — short `title`, scoped `description`, non-empty `must_return`.\n\
3. Merge reports only — do **not** parent-read the whole tree.\n\
\n\
Sequential is fine if concurrency is 1. This is **guidance**, not a hard gate — \
you may use a smaller N if a tighter scope is clearly enough."
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
