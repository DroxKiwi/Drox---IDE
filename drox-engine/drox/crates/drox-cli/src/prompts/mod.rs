//! API publique des prompts session (CLI / TUI / JSON-RPC).
//!
//! **Rédaction** : crate [`drox_prompts`]. Ici : re-exports + [`prepend_core_system_prompt`].

#[cfg(test)]
mod tests;

use drox_engine::EngineProfile;

pub use drox_prompts::{
	ALLOW_OUTSIDE_WORKSPACE_READ_SUPPLEMENT, ALLOW_OUTSIDE_WORKSPACE_SUPPLEMENT,
	ALLOW_OUTSIDE_WORKSPACE_WRITE_SUPPLEMENT, COMPACTION_PROMPT, CORE_LOCAL_9B_SYSTEM_PROMPT,
	CORE_LOCAL_SYSTEM_PROMPT,
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

/// Comme [`prepend_core_system_prompt`], CORE choisi par profil moteur.
/// `cloud-full` et `local-27b` partagent le CORE court. Le professeur garde le CORE de phases.
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
	match profile {
		EngineProfile::Local9b => CORE_LOCAL_9B_SYSTEM_PROMPT,
		// `cloud-full` suit le même texte que `local-27b`. Le CORE de phases
		// reste réservé au mode professeur.
		EngineProfile::Local27b | EngineProfile::CloudFull => CORE_LOCAL_SYSTEM_PROMPT,
	}
}

#[must_use]
pub fn subagents_explore_supplement_for_profile(profile: EngineProfile) -> &'static str {
	let _ = profile;
	SUBAGENTS_EXPLORE_LOCAL_SUPPLEMENT
}

/// Supplément thinking du parent. `cloud-full` reprend celui du local capable.
/// Le mode professeur garde les marqueurs de phase.
#[must_use]
pub fn native_thinking_supplement_for_profile(profile: EngineProfile) -> &'static str {
	let _ = profile;
	NATIVE_THINKING_LOCAL_SUPPLEMENT
}
