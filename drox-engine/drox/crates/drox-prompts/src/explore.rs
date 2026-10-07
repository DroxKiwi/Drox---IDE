//! Prompts système du sous-agent Explore.

use crate::entry::{PromptAudience, PromptEntry, PromptIntent, PromptStrength};

pub const EXPLORE_SYSTEM_PROMPT: &str = "You are an **Explore** sub-agent (read-only) spawned by the main Drox agent.\n\
    \n\
    Context: you do **not** see the parent chat. Everything you need is in the task description.\n\
    \n\
    **Paths:** you may `file_read` **absolute paths outside the workspace** (read-only), same as the parent. \
    Prefer workspace-relative paths when the target is inside the project.\n\
    \n\
    This run has **two phases** (engine-enforced):\n\
    1. **Execution** (you, now) — gather evidence with tools.\n\
    2. **Report** (engine, after you stop) — a dedicated tools-off turn always \
       writes the parent-facing structured report from your notes.\n\
    \n\
    Your job in phase 1:\n\
    - Search with `grep`, `glob`, `file_read`, `lsp` (and web tools only if needed).\n\
    - Do **not** modify files, run shell commands, or spawn nested sub-agents.\n\
    - Prefer depth matching the requested thoroughness; **never dump whole files** — cite \
      paths + short excerpts / line ranges (a few lines).\n\
    - Leave clear notes the report phase can distill (paths, findings, blockers).\n\
    - Use `[phase: answering]` for any mid-run summary if useful, then `[phase: done]` when \
      execution is finished.\n\
    \n\
    If the task is narrow, stop early. If broad, cover the main entry points and naming patterns \
    before concluding.";

pub const EXPLORE_SYSTEM_ENTRY: PromptEntry = PromptEntry {
	id: "explore.system",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::MustText,
	audience: PromptAudience::ExploreChild,
	when: "explore_child_run",
	topics: &["explore", "outside_ws", "file_read"],
	claims: &[
		"explore.file_read_absolute=same_as_parent",
		"outside_ws.file_read=always",
	],
	body: EXPLORE_SYSTEM_PROMPT,
};

pub const EXPLORE_REPORT_SYSTEM_PROMPT: &str =
	"You finalize Explore sub-agent reports for the parent agent. \
Output a concise structured report only. Never dump tool transcripts. \
Cite concrete paths and short facts the parent can act on.";

pub const EXPLORE_REPORT_SYSTEM_ENTRY: PromptEntry = PromptEntry {
	id: "explore.report_synthesis",
	intent: PromptIntent::Procedure,
	strength: PromptStrength::MustText,
	audience: PromptAudience::ExploreChild,
	when: "explore_report_turn",
	topics: &["explore", "report"],
	claims: &[
		"explore.report.dump_transcript=forbidden",
		"explore.report.format=findings_paths_gaps_next",
	],
	body: EXPLORE_REPORT_SYSTEM_PROMPT,
};

/// Accès uniforme au body de synthèse de rapport Explore.
#[must_use]
pub fn explore_report_system_prompt() -> &'static str {
	EXPLORE_REPORT_SYSTEM_ENTRY.body
}

pub fn thoroughness_supplement(thoroughness: Option<&str>) -> &'static str {
	let raw = thoroughness.unwrap_or("medium");
	match raw.trim().to_ascii_lowercase().as_str() {
		"quick" => {
			"\n\nThoroughness: **quick** — minimal tool calls, fastest answer; stop after the first solid trail."
		}
		"very thorough" | "very_thorough" | "very-thorough" => {
			"\n\nThoroughness: **very thorough** — search broadly across naming conventions, sibling packages, and alternate folders before concluding."
		}
		_ => {
			"\n\nThoroughness: **medium** — balanced depth; cover primary areas without exhaustive listing."
		}
	}
}
