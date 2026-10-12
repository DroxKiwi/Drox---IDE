//! Commits progressifs Explore (Option A) — canal **tools**, pas JSON prose.
//!
//! - [`ExploreCommitHandle`] — map kind → corps + journal d’évidence L0
//! - [`evidence`] — enregistre paths depuis `file_read` / `glob` / `grep`

mod evidence;
mod handle;

pub use evidence::{record_tool_evidence, EvidencePath};
pub use handle::{
	validate_mono_kind_body, ExploreCommitHandle, ExploreCommitSnapshot, MAX_COMMIT_BODY_CHARS,
};
