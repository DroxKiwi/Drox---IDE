//! Construction du `system_prompt` fusionné pour un run agent.

use drox_engine::{architect_discussion_system_prompt, EngineTuning, RoleId, memory_tools_boot_teaser};

use crate::language::Language;
use crate::prompts::{
    append_system_supplement, prepend_core_system_prompt, EXPLORATION_INTERNAL_ENGLISH_RULE,
    NATIVE_THINKING_REASONING_SUPPLEMENT,
};

/// Entrée d'assemblage — agent `Standard` ou rôle orchestration.
#[derive(Debug, Clone)]
pub struct AssembleInput {
    pub role_id: RoleId,
    pub cli_system: Option<String>,
    pub memdir_prefix: Option<String>,
    /// Rappel `memory_list` / `memory_read` au boot (pas de listing auto).
    pub memory_boot_teaser: bool,
    pub drox_ignore_block: String,
    pub workspace_map_block: Option<String>,
    pub language: Option<Language>,
    pub native_thinking: bool,
    pub disabled_tools_notice: Option<String>,
    /// `agent.run` → tuning résolu (discussion read budget, etc.).
    pub engine_tuning: EngineTuning,
    /// `false` après gate `discuss_reply_only` — pas de carte workspace.
    pub discussion_allow_reads: bool,
}

#[must_use]
fn merge_optional_system(cli: Option<String>, mem: Option<String>) -> Option<String> {
    match (cli, mem) {
        (None, None) => None,
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (Some(a), Some(b)) => Some(format!("{a}\n\n{b}")),
    }
}

/// Assemble le prompt système complet (core + memdir + listings + suppléments).
#[must_use]
pub fn assemble_system_prompt(input: AssembleInput) -> Option<String> {
    match input.role_id {
        RoleId::Standard => assemble_standard(input),
        RoleId::Architect | RoleId::Executor => assemble_orchestration_support(input),
        RoleId::ArchitectDiscussion => assemble_architect_discussion(input),
    }
}

/// Discussion : prompt léger + carte workspace si reads autorisées.
#[must_use]
fn assemble_architect_discussion(input: AssembleInput) -> Option<String> {
    let mut parts = architect_discussion_system_prompt(&input.engine_tuning);
    let ignore = input.drox_ignore_block.trim();
    if !ignore.is_empty() {
        parts.push_str("\n\n");
        parts.push_str(ignore);
    }
    if input.discussion_allow_reads {
        if let Some(block) = input.workspace_map_block {
            parts.push_str("\n\n");
            parts.push_str(&block);
        }
    }
    let mut system_merged = crate::language::merge_into_system(Some(parts), input.language.as_ref());
    if input.native_thinking {
        system_merged = append_system_supplement(
            system_merged,
            NATIVE_THINKING_REASONING_SUPPLEMENT,
        );
    }
    if let Some(notice) = input.disabled_tools_notice {
        match &mut system_merged {
            Some(s) => s.push_str(&notice),
            None => system_merged = Some(notice.trim_start().to_string()),
        }
    }
    system_merged
}

/// Contexte workspace pour un rôle orchestration (le core prompt vient de `ARCHITECT_*` / `EXECUTOR_*`).
#[must_use]
fn assemble_orchestration_support(input: AssembleInput) -> Option<String> {
    let base = merge_optional_system(input.cli_system, input.memdir_prefix);
    let mut parts = String::new();
    if let Some(b) = base {
        parts.push_str(&b);
    }
    if input.memory_boot_teaser {
        if !parts.is_empty() {
            parts.push_str("\n\n");
        }
        parts.push_str(memory_tools_boot_teaser());
    }
    parts.push_str("\n\n");
    parts.push_str(&input.drox_ignore_block);
    if parts.trim().is_empty() {
        None
    } else {
        Some(parts)
    }
}

/// Chemin **Standard** — CLI one-shot uniquement (hors orchestration IDE 1.4.0).
#[must_use]
fn assemble_standard(input: AssembleInput) -> Option<String> {
    let base = merge_optional_system(input.cli_system, input.memdir_prefix);
    let mut base_system = prepend_core_system_prompt(base);
    if input.memory_boot_teaser {
        base_system.push_str("\n\n");
        base_system.push_str(memory_tools_boot_teaser());
    }
    base_system.push_str("\n\n");
    base_system.push_str(&input.drox_ignore_block);
    if let Some(block) = input.workspace_map_block {
        base_system.push_str("\n\n");
        base_system.push_str(&block);
    }
    let base_system = Some(base_system);
    let mut system_merged =
        crate::language::merge_into_system(base_system, input.language.as_ref());
    system_merged = append_system_supplement(
        system_merged,
        EXPLORATION_INTERNAL_ENGLISH_RULE,
    );
    if input.native_thinking {
        system_merged = append_system_supplement(
            system_merged,
            NATIVE_THINKING_REASONING_SUPPLEMENT,
        );
    }
    if let Some(notice) = input.disabled_tools_notice {
        match &mut system_merged {
            Some(s) => s.push_str(&notice),
            None => system_merged = Some(notice.trim_start().to_string()),
        }
    }
    system_merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standard_assemble_includes_memory_teaser_not_skills() {
        let merged = assemble_system_prompt(AssembleInput {
            role_id: RoleId::Standard,
            cli_system: None,
            memdir_prefix: None,
            memory_boot_teaser: true,
            drox_ignore_block: "droxignore".into(),
            workspace_map_block: None,
            language: None,
            native_thinking: false,
            disabled_tools_notice: None,
            engine_tuning: EngineTuning::default(),
            discussion_allow_reads: true,
        })
        .unwrap();
        assert!(merged.contains("memory_list"));
        assert!(!merged.contains("MEMORY SESSIONS"));
        assert!(!merged.contains("Small-model execution profile"));
    }
}
