use super::*;
use serde_json::json;

use super::hot_snip::compact_explore_delivery_for_hot_snip;
use super::slim_task::{
	slim_task_tool_result_for_llm, TASK_INLINE_KIND_MAX_CHARS, TASK_SUMMARY_MAX_CHARS,
};
use super::thresholds::TOOL_RESULT_PREVIEW_BYTES;

#[test]
fn read_heavy_spills_earlier_than_bash() {
	assert_eq!(
		spill_threshold_for_tool("file_read"),
		READ_HEAVY_SPILL_THRESHOLD_BYTES
	);
	assert_eq!(
		spill_threshold_for_tool("grep"),
		READ_HEAVY_SPILL_THRESHOLD_BYTES
	);
	assert_eq!(
		spill_threshold_for_tool("bash"),
		TOOL_RESULT_SPILL_THRESHOLD_BYTES
	);
}

#[test]
fn f1_explore_delivery_threshold_above_read_heavy() {
	assert_eq!(
		spill_threshold_for_tool("explore_artifact_read"),
		EXPLORE_DELIVERY_SPILL_THRESHOLD_BYTES
	);
	assert_eq!(
		spill_threshold_for_tool("task"),
		EXPLORE_DELIVERY_SPILL_THRESHOLD_BYTES
	);
	assert!(EXPLORE_DELIVERY_SPILL_THRESHOLD_BYTES > READ_HEAVY_SPILL_THRESHOLD_BYTES);
	assert!(EXPLORE_DELIVERY_SPILL_THRESHOLD_BYTES > TOOL_RESULT_SPILL_THRESHOLD_BYTES);
}

#[test]
fn format_spills_file_read_at_8kib() {
	let dir = tempfile::tempdir().unwrap();
	let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
	let big = "y".repeat(READ_HEAVY_SPILL_THRESHOLD_BYTES + 50);
	let value = json!({ "content": big });
	let formatted = format_tool_result_for_llm("file_read", &value, &ws);
	assert!(
		formatted.contains("LARGE OUTPUT SPILLED TO DISK"),
		"file_read must spill at 8 KiB; got {}",
		&formatted[..formatted.len().min(160)]
	);
	assert!(
		!formatted.contains(&"y".repeat(2_000)),
		"full blob must not stay in the LLM message"
	);
	assert!(
		formatted.contains("Do NOT file_read this spill path"),
		"D1: spill stub must discourage re-read"
	);
	assert!(
		!formatted.contains("Use `file_read`"),
		"D1: must not invite file_read on spill"
	);
	let preview_cap = TOOL_RESULT_PREVIEW_BYTES + 80;
	let preview_section = formatted.split("Preview").nth(1).unwrap_or("");
	assert!(
		preview_section.len() < preview_cap + 200,
		"preview must stay short"
	);
}

#[test]
fn f1_explore_artifact_read_12kib_stays_inline() {
	let dir = tempfile::tempdir().unwrap();
	let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
	// Between 8 KiB and 64 KiB — previously spilled as read-heavy.
	let body = "k".repeat(12 * 1024);
	let value = json!({
		"path": ".drox/subagents/ses_x/exp_y/file_summaries.md",
		"content": body
	});
	let formatted = format_tool_result_for_llm("explore_artifact_read", &value, &ws);
	assert!(
		!formatted.contains("SPILLED TO DISK"),
		"F1: explore_artifact_read 12 KiB must stay inline; got {}",
		&formatted[..formatted.len().min(200)]
	);
	assert!(formatted.contains("file_summaries.md"));
	assert!(formatted.contains(&"k".repeat(100)));
}

#[test]
fn format_keeps_medium_bash_inline() {
	let dir = tempfile::tempdir().unwrap();
	let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
	let mid = "z".repeat(READ_HEAVY_SPILL_THRESHOLD_BYTES + 100);
	let value = json!({ "stdout": mid });
	let bash = format_tool_result_for_llm("bash", &value, &ws);
	assert!(
		!bash.contains("SPILLED TO DISK"),
		"bash under 24 KiB should stay inline"
	);
	assert!(bash.contains(&mid[..100]));
}

#[test]
fn hot_snip_always_spills_before_stub() {
	let dir = tempfile::tempdir().unwrap();
	let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
	let body = "payload-".repeat(200);
	let stub = stub_for_hot_snip(&ws, &body);
	assert!(stub.contains("SPILLED TO DISK") || stub.contains("tool-outputs"));
	assert!(!stub.contains(&body));
	let out_dir = ws.join(".drox").join("tool-outputs");
	let entries: Vec<_> = std::fs::read_dir(out_dir.as_std_path()).unwrap().collect();
	assert_eq!(entries.len(), 1);
}

#[test]
fn f2_hot_snip_preserves_task_merge() {
	let dir = tempfile::tempdir().unwrap();
	let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
	let json = json!({
		"summary": "Site docs mapped",
		"blurb": "sidebar anchors broken",
		"artifacts": {
			"file_summaries": ".drox/subagents/ses_x/exp_y/file_summaries.md",
			"structure_map": ".drox/subagents/ses_x/exp_y/structure_map.md"
		},
		"artifacts_inline": {
			"structure_map": "## Arborescence\n- src/app/docs/page.tsx\n- DocsSidebar hardcodé\n"
		},
		"truncated": false
	});
	let serialized = serde_json::to_string(&json).unwrap();
	let wrapped = format!(
		"[drox: tool result for «task» — JSON below; this is NOT a user message]\n{serialized}"
	);
	let stub = stub_for_hot_snip(&ws, &wrapped);
	assert!(
		stub.contains("EXPLORE MERGE PRESERVED"),
		"F2: task hot-snip must preserve merge; got {}",
		&stub[..stub.len().min(240)]
	);
	assert!(stub.contains("file_summaries.md"));
	assert!(stub.contains("structure_map"));
	assert!(!stub.contains("tool-outputs"));
	// Pas de spill disque pour un merge Explore.
	let out_dir = ws.join(".drox").join("tool-outputs");
	assert!(!out_dir.exists() || std::fs::read_dir(out_dir.as_std_path()).unwrap().count() == 0);
}

#[test]
fn f2_compact_explore_artifact_read() {
	let json = json!({
		"path": ".drox/subagents/ses_x/exp_y/file_summaries.md",
		"content": "A".repeat(2_000)
	});
	let serialized = serde_json::to_string(&json).unwrap();
	let wrapped = format!(
		"[drox: tool result for «explore_artifact_read» — JSON below; this is NOT a user message]\n{serialized}"
	);
	let compact = compact_explore_delivery_for_hot_snip(&wrapped).expect("compact");
	assert!(compact.contains("EXPLORE MERGE PRESERVED"));
	assert!(compact.contains("file_summaries.md"));
	assert!(compact.contains("content_excerpt"));
	assert!(
		compact.chars().count() < 1_200,
		"excerpt must stay compact, got {}",
		compact.chars().count()
	);
}

#[test]
fn slim_task_drops_report_keeps_inline() {
	let value = json!({
		"report": "# huge markdown\n".repeat(100),
		"report_path": ".drox/subagents/ses_x/exp_y/conclusion.md",
		"summary": "S".repeat(900),
		"blurb": "B".repeat(50),
		"artifacts": { "gaps": "g.md" },
		"artifacts_inline": {
			"gaps": "- missing MD pipeline",
			"structure_map": "M".repeat(2_500)
		},
		"truncated": false
	});
	let slim = slim_task_tool_result_for_llm(&value);
	assert!(slim.get("report").is_none());
	assert!(slim.get("report_path").is_none());
	let summary = slim.get("summary").and_then(|v| v.as_str()).unwrap();
	assert!(summary.chars().count() <= TASK_SUMMARY_MAX_CHARS + 1);
	assert!(summary.ends_with('…'));
	assert_eq!(
		slim.get("blurb").and_then(|v| v.as_str()).unwrap().len(),
		50
	);
	let inline = slim
		.get("artifacts_inline")
		.and_then(|v| v.as_object())
		.unwrap();
	assert_eq!(
		inline.get("gaps").and_then(|v| v.as_str()),
		Some("- missing MD pipeline")
	);
	let structure = inline.get("structure_map").and_then(|v| v.as_str()).unwrap();
	assert!(structure.chars().count() <= TASK_INLINE_KIND_MAX_CHARS + 1);
	assert!(structure.ends_with('…'));
}

#[test]
fn hot_snip_shortens_existing_spill_stub() {
	let dir = tempfile::tempdir().unwrap();
	let ws = camino::Utf8PathBuf::from_path_buf(dir.path().to_path_buf()).unwrap();
	let existing = format!(
		"[drox: tool result for «grep» — LARGE OUTPUT SPILLED TO DISK]\n\
             Full body (9999 bytes) written to: {}/.drox/tool-outputs/x.json\n\
             Preview (first 512 bytes):\n{}",
		ws,
		"p".repeat(512)
	);
	let stub = stub_for_hot_snip(&ws, &existing);
	assert!(stub.contains("SPILLED FOR CONTEXT"));
	assert!(stub.contains("tool-outputs"));
	assert!(!stub.contains(&"p".repeat(200)));
	assert!(
		stub.contains("Do NOT file_read this spill path"),
		"D1: hot-snip stub must discourage re-read"
	);
	assert!(
		!stub.contains("Re-read the spill"),
		"D1: must not invite re-read after Preview dropped"
	);
	let out_dir = ws.join(".drox").join("tool-outputs");
	assert!(!out_dir.exists() || std::fs::read_dir(out_dir.as_std_path()).unwrap().count() == 0);
}
