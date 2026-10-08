//! Sous-agents (§2.10) — types partagés (settings, outcome, contrats de retour).

mod explore_request;
mod index;
mod outcome;
mod return_kinds;
mod settings;
mod subagent_executor_trait;

pub use explore_request::ExploreRequest;
pub use index::{
	append_index_entry, build_blurb, find_index_entry, index_path, kinds_as_strings,
	list_index_entries, sanitize_path_segment, session_subagents_dir, ExploreIndexEntry,
	EXPLORE_BLURB_MAX_CHARS,
};
pub use outcome::ExploreOutcome;
pub use return_kinds::{
	format_kinds_contract, format_kinds_json_contract, parse_return_kinds, ExploreReturnKind,
	ExploreReturnOptions,
};
pub use settings::SubagentSettings;
pub use subagent_executor_trait::SubagentExecutor;
