//! API publique des prompts session (CLI / TUI / JSON-RPC).
//!
//! **Rédaction** : crate [`drox_prompts`]. Ici : re-exports + [`prepend_core_system_prompt`].

#[cfg(test)]
mod tests;

use drox_engine::EngineProfile;

pub use drox_prompts::{
	ALLOW_OUTSIDE_WORKSPACE_READ_SUPPLEMENT, ALLOW_OUTSIDE_WORKSPACE_SUPPLEMENT,
	ALLOW_OUTSIDE_WORKSPACE_WRITE_SUPPLEMENT, COMPACTION_PROMPT, CORE_LOCAL_SYSTEM_PROMPT,
	CORE_SYSTEM_PROMPT, NATIVE_THINKING_LOCAL_SUPPLEMENT, NATIVE_THINKING_REASONING_SUPPLEMENT,
	PROFESSOR_MODE_SUPPLEMENT,
	SUBAGENTS_EXPLORE_LOCAL_SUPPLEMENT, SUBAGENTS_EXPLORE_SUPPLEMENT,
};

/// Préfixe le prompt user / memdir / langue par le `CORE_SYSTEM_PROMPT`. Si
/// `existing` est non vide (ex. CLI a passé `--system` avec un override
/// complet), on l'append après le core.
#[must_use]
pub fn prepend_core_system_prompt(existing: Option<String>) -> String {
	prepend_core_system_prompt_for_profile(existing, EngineProfile::CloudFull)
}

/// Comme [`prepend_core_system_prompt`], CORE choisi par profil moteur
/// (`cloud-full` = CORE 1.6.0 ; profils locaux = CORE allégé). Professeur garde le CORE complet.
#[must_use]
pub fn prepend_core_system_prompt_for_profile(
	existing: Option<String>,
	profile: EngineProfile,
) -> String {
	let core = core_system_prompt_for_profile(profile);
	match existing {
		Some(s) if !s.trim().is_empty() => format!("{core}\n{s}"),
		_ => core.to_string(),
	}
}

#[must_use]
pub fn core_system_prompt_for_profile(profile: EngineProfile) -> &'static str {
	if profile.is_local() {
		CORE_LOCAL_SYSTEM_PROMPT
	} else {
		CORE_SYSTEM_PROMPT
	}
}

#[must_use]
pub fn subagents_explore_supplement_for_profile(profile: EngineProfile) -> &'static str {
	if profile.is_local() {
		SUBAGENTS_EXPLORE_LOCAL_SUPPLEMENT
	} else {
		SUBAGENTS_EXPLORE_SUPPLEMENT
	}
}

/// Supplément thinking : cloud garde les marqueurs de phase ; local interdit
/// de réécrire la réponse finale après `[phase: answering]`.
#[must_use]
pub fn native_thinking_supplement_for_profile(profile: EngineProfile) -> &'static str {
	if profile.is_local() {
		NATIVE_THINKING_LOCAL_SUPPLEMENT
	} else {
		NATIVE_THINKING_REASONING_SUPPLEMENT
	}
}
