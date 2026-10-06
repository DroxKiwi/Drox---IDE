//! Tests unitaires du module subagent.

use super::budget::explore_iteration_budget;
use super::report::{
	fallback_incomplete_report, looks_like_structured_report, parent_facing_report,
	strip_phase_markers,
};

#[test]
fn budget_adds_bonus_for_very_thorough_without_hard_cap() {
	assert_eq!(explore_iteration_budget(25, Some("medium")), 25);
	assert_eq!(explore_iteration_budget(25, Some("very thorough")), 35);
	assert_eq!(explore_iteration_budget(100, Some("very thorough")), 110);
}

#[test]
fn parent_report_never_embeds_activity_section() {
	let out = parent_facing_report("## Findings\nok", true);
	assert!(out.contains("## Findings"));
	assert!(!out.contains("## Activity"));
	assert!(!out.contains("→ glob"));
	assert!(out.contains("iteration ceiling"));
}

#[test]
fn fallback_is_structured_without_tool_dump() {
	let out = fallback_incomplete_report("Let me check glob…", true);
	assert!(out.contains("## Findings"));
	assert!(out.contains("## Gaps"));
	assert!(!out.contains("## Activity"));
}

#[test]
fn strip_phase_markers_removes_lines() {
	let t = strip_phase_markers("[phase: answering]\nHello\n[phase: done]");
	assert_eq!(t, "Hello");
}

#[test]
fn structured_report_detector() {
	assert!(looks_like_structured_report(
		"## Findings\nSidebar uses routes.\n## Paths\nsrc/app/docs"
	));
	assert!(!looks_like_structured_report(
		"Let me explore the workspace structure first. No src folder…"
	));
}
