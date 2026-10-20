//! Nudges runtime injectés par la boucle agent (soft — tools libres).

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};

/// 1.6.0 S-5 — parent enchaîne des lectures sans déléguer Explore.
pub const PARENT_HEAVY_READ_NUDGE: &str = "STOP flooding the parent with repeated reads / \
    `Get-Content` / `cat` dumps.\n\
    \n\
    If **Sub-agents — Explore** is present: follow that supplement now (one `task` at step \
    kickoff → merge). A prior `bash dir` does **not** authorize parent tree dumps.\n\
    \n\
    Else: ranged `file_read` / `grep` only. Needles 1–2 known paths OK.";

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
    Docs-tree ingest / mirror / rewrite. Protocol = **Sub-agents — Explore** supplement \
    (do not restate it). Delta:\n\
    - Prefer **2–4** explore-sized steps — never one mega Explore.\n\
    - Outside-workspace paths → `description` (child can `file_read` them).\n\
    - Parent: only the **1–2 pages** being rewritten (short ranges). At most one `bash dir` \
    to confirm the folder — then `todo_write` + Assign Explore, not more parent inventory.";

/// Soft — work/doc sans `todo_write` après activité outils (toute situation).
/// Tools restent libres (pas de hard gate) ; ignore OK si légitime (needle, etc.).
pub const WORK_WITHOUT_PLAN_NUDGE: &str = "WORK WITHOUT PLAN — soft reminder (not a hard gate)\n\
    \n\
    Work/docs run with tools already used, but **no** `todo_write` yet.\n\
    **Preferred:** short `todo_write` (2–4 steps) now; then follow Explore supplement at \
    step kickoff if present.\n\
    Needle / trivial one-shot: ignore OK. Tools free.";

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

pub const EXPLORE_RESCUE_PARENT_READ_NUDGE: &str = "STOP. Prior Explore incomplete (`truncated`) — \
    do not rescue with parent `file_read`/`grep` dumps on the same perimeter.\n\
    **Next:** 2–4 focused `task`, OR needle 1–2 known paths. No third option.";

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
    Prefer `[phase: analyzing]` (not `[phase: reading]`). Telegraphic notes; full report \
    only in `[phase: answering]`.\n\
    If **Sub-agents — Explore** is present: follow it for overview. Else: `workspace_map_read` \
    (if fresh) → targeted `glob`/`grep`/ranged `file_read`/`lsp`. Needles 1–2 → direct tools.";

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
	claims: &["plan_assign_merge=soft_prefer", "explore.micro_kickoff=soft_prefer"],
	body: "STEP KICKOFF — soft micro (not a hard gate) — dynamic body",
};

/// Soft / micro (C4 V6-a) — avant spawn `task` : 2–4 lignes, sans re-dérouler le protocole A.
pub fn step_explore_kickoff_nudge(step_id: &str, step_content: Option<&str>) -> String {
	let label = step_content
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or(step_id);
	let label = truncate_micro_label(label, 80);
	format!(
		"STEP KICKOFF — soft micro (not a hard gate)\n\
         Step `{step_id}` in_progress: {label}\n\
         Prefer one focused `task` (explore) with `plan_step_id` + `must_return`, then merge. \
         Needles 1–2 OK. Tools free."
	)
}

fn truncate_micro_label(s: &str, max_chars: usize) -> String {
	if s.chars().count() <= max_chars {
		return s.to_string();
	}
	let clipped: String = s.chars().take(max_chars.saturating_sub(1)).collect();
	format!("{clipped}…")
}

/// Soft / micro (C4 V6-a) — rappel acting write après merge (one-shot optionnel).
pub const MICRO_ACT_WRITE_NUDGE: &str = "ACT WRITE — soft micro (not a hard gate)\n\
    Prefer `file_edit` / `file_write` (or answer) from Explore artefacts now. \
    Avoid another inventory pass. Tools free.";

pub const MICRO_ACT_WRITE_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.micro_act_write",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "post_explore_merge_ready_to_act",
	topics: &["plan_assign_merge", "context"],
	claims: &["explore.micro_act_write=soft_prefer"],
	body: MICRO_ACT_WRITE_NUDGE,
};

/// **D4** — après `ask_user_question` réussi : transition soft skeleton / mutate.
pub const POST_ASK_ACTING_NUDGE: &str = "POST-ASK — soft micro (not a hard gate)\n\
    User answered. Prefer act now: skeleton `file_write` then `file_edit` by section \
    (or apply the decision). Do not re-inventory or re-ask unless a new blocker. Tools free.";

pub const POST_ASK_ACTING_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.post_ask_acting",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "ask_user_question_success",
	topics: &["ask_user", "acting", "context"],
	claims: &["ask_user.post_acting=soft_prefer"],
	body: POST_ASK_ACTING_NUDGE,
};

#[cfg(test)]
mod post_ask_tests {
	use super::*;

	#[test]
	fn post_ask_nudge_mentions_skeleton() {
		assert!(POST_ASK_ACTING_NUDGE.contains("skeleton"));
		assert!(POST_ASK_ACTING_NUDGE.contains("not a hard gate"));
		assert_eq!(POST_ASK_ACTING_ENTRY.id, "runtime.post_ask_acting");
	}
}

/// Soft — étape `in_progress` avec activité parent et pas encore de `task`.
pub const STEP_WITHOUT_EXPLORE_NUDGE_THRESHOLD: u32 = 2;

pub const STEP_WITHOUT_EXPLORE_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.step_without_explore",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "todo_step_in_progress+explore_enabled+parent_activity_n+no_task",
	topics: &["plan_assign_merge", "explore"],
	claims: &[
		"plan_assign_merge=soft_prefer",
		"step.prefer_explore_before_parent_work=prefer",
	],
	body: "STEP WITHOUT EXPLORE — soft reminder (not a hard gate) — dynamic body",
};

pub fn step_without_explore_nudge(step_id: &str, step_content: Option<&str>) -> String {
	let label = step_content
		.map(str::trim)
		.filter(|s| !s.is_empty())
		.unwrap_or(step_id);
	format!(
		"STEP WITHOUT EXPLORE — soft reminder (not a hard gate)\n\
         Step `{step_id}` in_progress ({label}): parent tools used, no `task` yet.\n\
         **Preferred:** one focused Explore for this step (`plan_step_id`=`{step_id}`), then merge.\n\
         Needle 1–2: ignore OK. Tools free."
	)
}

/// Soft / micro (C4 V6-a) — après Explore OK : fusionner / agir (2–4 lignes).
pub const POST_MERGE_CLOSURE_NUDGE: &str = "POST-MERGE — soft micro (not a hard gate)\n\
    Explore `task` OK (`truncated: false`). Merge from **`artifacts_inline`** (already in the tool \
    result) + summary/blurb; zoom with `explore_artifact_read` only if needed — then act \
    (todo / edit / answer). Do not re-`file_read` `paths_read` sources. Needles 1–2 OK.";

pub const POST_MERGE_CLOSURE_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.post_merge_closure",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "explore_task_success_non_truncated",
	topics: &["plan_assign_merge", "explore"],
	claims: &[
		"plan_assign_merge=soft_prefer",
		"explore.post_merge.prefer_acting=prefer",
		"explore.post_merge.prefer_artifacts=prefer",
	],
	body: POST_MERGE_CLOSURE_NUDGE,
};

/// Soft C2/V2-c / E1 — parent `file_read` d’une source ou d’un blob kind Explore.
pub const EXPLORE_COVERED_REREAD_NUDGE: &str =
	"EXPLORE-COVERED RE-READ — soft reminder (not a hard gate)\n\
    You `file_read` a path already covered by the last Explore (source in `paths_read` \
    or an Explore kind file under `.drox/subagents/…`) — re-inflates context.\n\
    **Preferred:** trust `artifacts_inline` / retry `explore_artifact_read` once — then \
    skeleton `file_write` / `file_edit`. Do **not** range-read kind `.md` blobs. Tools free.";

pub const EXPLORE_COVERED_REREAD_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.explore_covered_reread",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "parent_file_read_path_in_last_explore_covered",
	topics: &["plan_assign_merge", "explore", "context"],
	claims: &[
		"explore.covered_reread=soft_prefer",
		"plan_assign_merge=soft_prefer",
	],
	body: EXPLORE_COVERED_REREAD_NUDGE,
};

/// **E2** — après Explore OK, trop de lectures parent sans mutation (seuil 1 depuis dogfood 0ce29).
pub const POST_EXPLORE_STALL_READ_THRESHOLD: u32 = 1;

pub const POST_EXPLORE_STALL_ACT_NUDGE: &str = "POST-EXPLORE STALL — soft (not a hard gate)\n\
    Explore already returned usable artefacts, but you keep reading instead of writing.\n\
    **Preferred now:** skeleton `file_write` / `file_edit` from `artifacts_inline` — stop \
    re-reading Explore blobs or covered sources. Tools free.";

pub const POST_EXPLORE_STALL_ACT_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.post_explore_stall_act",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "post_explore_ok+parent_heavy_reads_without_mutate",
	topics: &["explore", "acting", "context"],
	claims: &["explore.post_stall_act=soft_prefer"],
	body: POST_EXPLORE_STALL_ACT_NUDGE,
};

/// **A** — `explore_artifact_read` a échoué (args / orphan / IO) → ne pas `file_read` le kind.
pub const EXPLORE_ARTIFACT_READ_FAIL_NUDGE: &str =
	"EXPLORE ARTIFACT READ FAILED — soft recovery (not a hard gate)\n\
    `explore_artifact_read` did not return a usable body.\n\
    **Do NOT** `file_read` `.drox/subagents/…/<kind>.md` (range-reading kinds re-inflates \
    context).\n\
    **Preferred:** use `artifacts_inline` from the last `task` result, or retry \
    `explore_artifact_read` **once** with the same `explore_id` + `kind`, then act \
    (`file_write` / `file_edit`). Tools free.";

pub const EXPLORE_ARTIFACT_READ_FAIL_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.explore_artifact_read_fail",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "explore_artifact_read_error",
	topics: &["explore", "acting", "context"],
	claims: &["explore.artifact_read_fail=soft_prefer"],
	body: EXPLORE_ARTIFACT_READ_FAIL_NUDGE,
};

#[cfg(test)]
mod e2_tests {
	use super::*;

	#[test]
	fn stall_threshold_is_one() {
		assert_eq!(POST_EXPLORE_STALL_READ_THRESHOLD, 1);
		assert!(POST_EXPLORE_STALL_ACT_NUDGE.contains("POST-EXPLORE STALL"));
		assert_eq!(POST_EXPLORE_STALL_ACT_ENTRY.id, "runtime.post_explore_stall_act");
		assert_eq!(
			EXPLORE_ARTIFACT_READ_FAIL_ENTRY.id,
			"runtime.explore_artifact_read_fail"
		);
	}
}

/// Soft — relectures parent en rotation multi-path (angle mort M1–M4 / S1).
/// Fenêtre = derniers `ROTATING_FILE_READ_WINDOW` `file_read` réussis.
pub const ROTATING_FILE_READ_WINDOW: usize = 10;
pub const ROTATING_FILE_READ_MIN_READS: usize = 6;
pub const ROTATING_FILE_READ_MIN_DISTINCT_REPEATED: usize = 2;
pub const ROTATING_FILE_READ_REPEAT_AT: u32 = 2;
/// **R1** — ré-injecter le Prefer tous les N `file_read` additionnels tant que la fenêtre tourne.
pub const ROTATING_FILE_READ_REINJECT_EVERY: usize = 4;

pub const ROTATING_FILE_READ_NUDGE: &str = "ROTATING RE-READS — soft Prefer (act now)\n\
    Cycling `file_read` on a small path set without advancing — burns context.\n\
    Same-path re-reads may return `[already_read]` stubs (engine).\n\
    **Required next:** act (`file_edit`/`file_write`) · one focused `task` then merge · \
    or `todo_write`. Needle: `grep`, not full re-read. Tools free.";

pub const ROTATING_FILE_READ_ENTRY: PromptEntry = PromptEntry {
	id: "runtime.rotating_file_read",
	intent: PromptIntent::Rescue,
	strength: PromptStrength::Prefer,
	audience: PromptAudience::Parent,
	when: "parent_file_read_rotation_window",
	topics: &["file_read", "explore", "plan_assign_merge"],
	claims: &[
		"file_read.rotating_spam=forbidden_prefer",
		"plan_assign_merge=soft_prefer",
	],
	body: ROTATING_FILE_READ_NUDGE,
};

pub fn context_load_nudge(
	files_effective: usize,
	total_kb: u64,
	load: u64,
	recommended_n: u32,
) -> String {
	format!(
		"[Context load] files≈{files_effective} ≈{total_kb}KB → load={load}. \
Follow **Sub-agents — Explore** (do not restate protocol). Prefer ~**{recommended_n}** \
explore-sized steps; keep reports only in parent — no whole-tree parent-read. \
Smaller N OK if scope is tighter."
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
Explore did not finish cleanly — **do not** rescue with parent `file_read`/`grep` dumps.\n\
**ONE path:** (1) re-split → ~**{n}** focused `task` (one concern each) · \
(2) needle 1–2 known paths only.\n\
Forbidden: parent-read spam, spill re-open, or one mega-brief `task`."
	)
}
