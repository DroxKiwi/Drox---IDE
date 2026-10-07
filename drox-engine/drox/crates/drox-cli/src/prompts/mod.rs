//! API publique des prompts session (CLI / TUI / JSON-RPC).
//!
//! **Rédaction** : crate [`drox_prompts`]. Ici : re-exports + [`prepend_core_system_prompt`].

#[cfg(test)]
mod tests;

pub use drox_prompts::{
	ALLOW_OUTSIDE_WORKSPACE_SUPPLEMENT, COMPACTION_PROMPT, CORE_SYSTEM_PROMPT,
	NATIVE_THINKING_REASONING_SUPPLEMENT, PROFESSOR_MODE_SUPPLEMENT, SUBAGENTS_EXPLORE_SUPPLEMENT,
};

/// Préfixe le prompt user / memdir / langue par le `CORE_SYSTEM_PROMPT`. Si
/// `existing` est non vide (ex. CLI a passé `--system` avec un override
/// complet), on l'append après le core.
#[must_use]
pub fn prepend_core_system_prompt(existing: Option<String>) -> String {
	match existing {
		Some(s) if !s.trim().is_empty() => format!("{CORE_SYSTEM_PROMPT}\n{s}"),
		_ => CORE_SYSTEM_PROMPT.to_string(),
	}
}
