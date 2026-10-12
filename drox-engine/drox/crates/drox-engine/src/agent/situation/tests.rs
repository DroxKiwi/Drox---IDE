//! Tests unitaires du module `situation`.

use drox_types::{Content, Message};
use serde_json::json;

use super::*;

#[test]
fn format_includes_marker_and_fields() {
	let snap = SituationSnapshot {
		objective: Some("Adapter la page engine".into()),
		todos_pending: 1,
		todos_in_progress: 1,
		todos_completed_hint: 2,
		next_todo: Some("Écrire engine/page.tsx".into()),
		files_touched: vec!["src/a.tsx".into(), "src/b.tsx".into()],
		last_tool_error: None,
		permission_mode: Some("acceptEdits".into()),
	};
	let s = format_situation_card(&snap);
	assert!(s.starts_with(SITUATION_CARD_MARKER));
	assert_eq!(situation_card_body_line_count(&s), SITUATION_CARD_BODY_LINES);
	assert!(s.contains("Adapter la page engine"));
	assert!(s.contains("2 open"));
	assert!(s.contains("Écrire engine/page.tsx"));
	assert!(s.contains("mode=acceptEdits"));
	assert!(s.contains("- constraint:"));
	// V4-c : files_touched non injectés.
	assert!(!s.contains("src/a.tsx"));
	assert!(!s.contains("files_touched"));
	assert!(!s.to_ascii_lowercase().contains("plan → assign"));
}

#[test]
fn format_uses_error_as_sole_constraint() {
	let snap = SituationSnapshot {
		last_tool_error: Some("path escapes workspace".into()),
		..Default::default()
	};
	let s = format_situation_card(&snap);
	assert!(s.contains("constraint: last_tool_error: path escapes workspace"));
	assert_eq!(situation_card_body_line_count(&s), SITUATION_CARD_BODY_LINES);
}

#[test]
fn upsert_replaces_without_duplicating() {
	let mut msgs = vec![Message::system("CORE"), Message::user("hi")];
	let snap = SituationSnapshot {
		objective: Some("A".into()),
		..Default::default()
	};
	assert!(upsert_situation_card(&mut msgs, &snap, 1));
	assert_eq!(msgs.len(), 3);
	assert!(
		!upsert_situation_card(
			&mut msgs,
			&SituationSnapshot {
				objective: Some("B".into()),
				..Default::default()
			},
			1
		)
	);
	assert_eq!(msgs.len(), 3);
	let text = match &msgs[1].content[0] {
		Content::Text { text } => text.as_str(),
		_ => panic!("expected text"),
	};
	assert!(text.contains("objective: B"));
	assert!(!text.contains("objective: A"));
}

#[test]
fn next_todo_prefers_in_progress() {
	let v = json!({
		"todos": [
			{"id": "1", "content": "done item", "status": "completed"},
			{"id": "2", "content": "later", "status": "pending"},
			{"id": "3", "content": "now", "status": "in_progress"}
		]
	});
	assert_eq!(next_todo_from_output(&v).as_deref(), Some("now"));
}

#[test]
fn path_from_file_tool_ok() {
	assert_eq!(
		path_from_file_tool("file_write", &json!({"path": "a/b.ts"})).as_deref(),
		Some("a/b.ts")
	);
	assert_eq!(
		path_from_file_tool("copy_path", &json!({"destination": "x"})).as_deref(),
		Some("x")
	);
	assert!(path_from_file_tool("bash", &json!({"command": "ls"})).is_none());
}

#[test]
fn heavy_read_counts_ranged_file_read_and_dumps() {
	assert!(counts_as_parent_heavy_read(
		"file_read",
		&json!({"path": "a.md", "start_line": 1, "end_line": 40})
	));
	assert!(counts_as_parent_heavy_read(
		"file_read",
		&json!({"path": "a.md"})
	));
	assert!(counts_as_parent_heavy_read(
		"bash",
		&json!({"command": "Get-Content README.md"})
	));
	assert!(counts_as_parent_heavy_read(
		"glob",
		&json!({"pattern": "docs/**/*.md"})
	));
	assert!(counts_as_parent_heavy_read(
		"grep",
		&json!({"pattern": "foo", "path": "docs"})
	));
	assert!(!counts_as_parent_heavy_read(
		"bash",
		&json!({"command": "git status"})
	));
	assert!(!counts_as_parent_heavy_read(
		"task",
		&json!({"description": "map docs", "subagent_type": "explore"})
	));
}

#[test]
fn note_successful_file_read_normalizes_and_counts() {
	let mut counts = std::collections::HashMap::new();
	assert_eq!(
		note_successful_file_read(&mut counts, "file_read", &json!({"path": r"Docs\Foo.md"})),
		1
	);
	assert_eq!(
		note_successful_file_read(
			&mut counts,
			"file_read",
			&json!({"path": "docs/foo.md", "start_line": 1, "end_line": 10})
		),
		2
	);
	assert_eq!(
		note_successful_file_read(&mut counts, "bash", &json!({"command": "ls"})),
		0
	);
	assert_eq!(counts.get("docs/foo.md").copied(), Some(2));
}

#[test]
fn rotating_file_read_detects_multi_path_spin() {
	use std::collections::VecDeque;
	let mut recent = VecDeque::new();
	let paths = [
		"a.tsx", "b.tsx", "a.tsx", "c.tsx", "b.tsx", "a.tsx", // 6 reads, a×3 b×2 c×1
	];
	let mut triggered = false;
	for p in paths {
		triggered = note_rotating_file_read(&mut recent, "file_read", &json!({ "path": p }));
	}
	assert!(triggered);
	assert!(rotating_file_read_should_nudge(&recent));
	clear_rotating_file_read_window(&mut recent);
	assert!(!rotating_file_read_should_nudge(&recent));
}

#[test]
fn rotating_file_read_ignores_short_or_single_path() {
	use std::collections::VecDeque;
	let mut recent = VecDeque::new();
	for _ in 0..6 {
		assert!(!note_rotating_file_read(
			&mut recent,
			"file_read",
			&json!({ "path": "only.tsx" })
		));
	}
	assert!(!rotating_file_read_should_nudge(&recent));
}

#[test]
fn truncated_task_arms_rescue_without_resetting_streak() {
	let mut streak = 2;
	let mut pending = None;
	let mut rescue = false;
	let mut rescue_nudge = true;
	note_task_tool_success(
		true,
		250,
		250,
		&mut streak,
		&mut pending,
		&mut rescue,
		&mut rescue_nudge,
	);
	assert_eq!(streak, 2);
	assert_eq!(pending, Some((250, 250)));
	assert!(rescue);
	assert!(!rescue_nudge);
}

#[test]
fn ok_task_clears_rescue() {
	let mut streak = 2;
	let mut pending = Some((1, 1));
	let mut rescue = true;
	let mut rescue_nudge = false;
	note_task_tool_success(
		false,
		3,
		25,
		&mut streak,
		&mut pending,
		&mut rescue,
		&mut rescue_nudge,
	);
	assert_eq!(streak, 0);
	assert!(pending.is_none());
	assert!(!rescue);
}

#[test]
fn first_in_progress_todo_id_prefers_active_step() {
	let value = json!({
		"todos": [
			{ "id": "1", "content": "done step", "status": "completed" },
			{ "id": "2", "content": "Map docs sidebar", "status": "in_progress" },
			{ "id": "3", "content": "later", "status": "pending" }
		]
	});
	assert_eq!(
		first_in_progress_todo_id(&value).as_deref(),
		Some("2")
	);
	assert!(first_in_progress_todo_id(&json!({ "todos": [] })).is_none());
}
