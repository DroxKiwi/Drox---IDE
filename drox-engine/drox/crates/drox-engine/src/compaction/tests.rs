//! Tests compaction (persist + live).

use chrono::Utc;
use drox_types::{Content, Message, Role, ToolUseId};
use drox_tools::SessionNote;
use std::sync::Arc;

use crate::context::ContextPolicy;
use drox_context::{ContextBudget, RoughTokenCounter, SnipConfig};

use super::*;
use super::helpers::{condense_messages_for_summary, extract_metadata, truncate_chars};
use super::types::TRUNCATE_SUFFIX;

fn note(content: &str) -> SessionNote {
    SessionNote {
        content: content.into(),
        created_at: Utc::now(),
    }
}

fn user(text: &str) -> Message {
    Message::user(text)
}

fn assistant(text: &str) -> Message {
    Message::assistant(text)
}

fn tool_result(text: &str, is_error: bool) -> Message {
    Message {
        role: Role::Tool,
        content: vec![Content::ToolResult {
            tool_use_id: ToolUseId::new(),
            content: text.to_string(),
            is_error,
        }],
    }
}

#[test]
fn condense_renders_roles_and_truncates_big_tool_results() {
    let big = "x".repeat(5_000);
    let msgs = vec![
        user("Refactor auth"),
        assistant("[phase: reading]"),
        tool_result(&big, false),
    ];
    let cfg = CompactionConfig::default();
    let out = condense_messages_for_summary(&msgs, &[], &cfg, false);
    assert!(out.contains("[user] Refactor auth"));
    assert!(out.contains("[assistant] [phase: reading]"));
    assert!(out.contains(TRUNCATE_SUFFIX), "big tool_result must be truncated");
    assert!(
        out.len() < big.len(),
        "condensed must be smaller than raw tool_result"
    );
}

#[test]
fn condense_includes_pinned_notes_when_present() {
    let msgs = vec![user("hi")];
    let notes = vec![note("Decision X"), note("TODO Y")];
    let out = condense_messages_for_summary(&msgs, &notes, &CompactionConfig::default(), false);
    assert!(out.contains("=== Pinned notes from the model"));
    assert!(out.contains("- Decision X"));
    assert!(out.contains("- TODO Y"));
}

#[test]
fn condense_omits_notes_section_when_empty() {
    let msgs = vec![user("hi")];
    let out = condense_messages_for_summary(&msgs, &[], &CompactionConfig::default(), false);
    assert!(!out.contains("Pinned notes"));
}

#[test]
fn extract_metadata_picks_first_objective_line_and_file_list() {
    let md = "\
## Objective
Refactor authentication layer to use sqlx
## Decisions
- chose sqlx
## Files touched
- src/auth.rs
- `Cargo.toml`
- \"src/db/pool.rs\"
## En cours
nothing
";
    let (obj, files) = extract_metadata(md);
    assert_eq!(obj, "Refactor authentication layer to use sqlx");
    assert_eq!(
        files,
        vec![
            "src/auth.rs".to_string(),
            "Cargo.toml".to_string(),
            "src/db/pool.rs".to_string(),
        ]
    );
}

#[test]
fn extract_metadata_handles_french_section_titles() {
    let md = "\
## Objectif
Refactorer la couche auth
## Fichiers touchés
- src/auth.rs
";
    let (obj, files) = extract_metadata(md);
    assert_eq!(obj, "Refactorer la couche auth");
    assert_eq!(files, vec!["src/auth.rs".to_string()]);
}

#[test]
fn extract_metadata_returns_empty_when_sections_missing() {
    let md = "Random freeform text without any section header.";
    let (obj, files) = extract_metadata(md);
    assert!(obj.is_empty());
    assert!(files.is_empty());
}

#[test]
fn truncate_chars_preserves_short_strings() {
    assert_eq!(truncate_chars("hello", 10), "hello");
}

#[test]
fn truncate_chars_safely_cuts_unicode() {
    let s = "héllo wörld!"; // multibytes
    let t = truncate_chars(s, 5);
    assert!(t.starts_with("héllo"));
    assert!(t.contains(TRUNCATE_SUFFIX));
}

#[test]
fn choose_live_split_none_when_too_few_messages() {
    let policy = ContextPolicy::default();
    let msgs = vec![Message::system("s"), Message::user("u")];
    assert!(choose_live_compact_split_idx(
        &msgs,
        &policy,
        LIVE_COMPACT_TAIL_KEEP_MESSAGES,
        LIVE_COMPACT_MIN_PREFIX_TOKENS
    )
    .is_none());
}

#[test]
fn format_compact_checkpoint_caps_length() {
    let verbose = format!(
        "## Objective\nShort goal\n## Decisions\n{}\n## Files touched\n- a.rs\n",
        "x".repeat(8_000)
    );
    let cp = format_compact_checkpoint(&verbose);
    assert!(cp.contains("Short goal"));
    assert!(cp.len() <= CHECKPOINT_MAX_CHARS + 4);
    assert!(!cp.contains(&"x".repeat(1000)));
}

#[test]
fn choose_live_split_shrinks_fat_tail() {
    let policy = ContextPolicy::new(
        Arc::new(RoughTokenCounter::new(4)),
        ContextBudget::with_window(20_000),
        None,
    );
    let mut msgs = vec![Message::system("sys")];
    for _ in 0..6 {
        msgs.push(Message::user("u".repeat(500)));
    }
    for _ in 0..4 {
        msgs.push(Message::user("z".repeat(12_000)));
    }
    let split = choose_live_compact_split_idx(
        &msgs,
        &policy,
        LIVE_COMPACT_TAIL_KEEP_MESSAGES,
        1_000,
    )
    .expect("split");
    let tail_msgs = msgs.len() - split;
    assert!(
        tail_msgs < LIVE_COMPACT_TAIL_KEEP_MESSAGES,
        "fat tail should shrink below message cap, tail_msgs={tail_msgs}"
    );
}

#[test]
fn choose_live_split_honours_tail_keep_and_min_prefix_tokens() {
    let policy = ContextPolicy::new(
        Arc::new(RoughTokenCounter::new(4)),
        ContextBudget::default(),
        Some(SnipConfig::default()),
    );
    let mut msgs = vec![Message::system("sys")];
    for _ in 0..14 {
        msgs.push(Message::user("z".repeat(10_000)));
    }
    let split = choose_live_compact_split_idx(
        &msgs,
        &policy,
        LIVE_COMPACT_TAIL_KEEP_MESSAGES,
        LIVE_COMPACT_MIN_PREFIX_TOKENS,
    )
    .expect("prefix must be fat enough");
    assert_eq!(split, msgs.len() - LIVE_COMPACT_TAIL_KEEP_MESSAGES);
}

