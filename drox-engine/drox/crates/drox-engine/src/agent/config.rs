//! Configuration d'un [`crate::agent::Agent`].

use drox_hooks::ToolHooksConfig;
use drox_llm::ChatOptions;

use crate::context_policy::ContextPolicy;
use crate::memory::MemoryRuntime;
use crate::agent_permissions::PermissionPolicy;

/// Configuration d'un agent.
#[derive(Debug, Clone)]
pub struct AgentConfig {
    /// System prompt optionnel injecté en tête de conversation.
    pub system_prompt: Option<String>,
    /// Nombre maximum d'allers-retours LLM ↔ tools dans un même `run()`.
    pub max_iterations: usize,
    /// Options passées tel quel au `LlmClient` (tools y sont ajoutés
    /// automatiquement à partir du `ToolRegistry`).
    pub chat_options: ChatOptions,
    /// Politique de permissions. Si `None`, aucun garde-fou : tous les tool
    /// calls sont exécutés (mode "ancien" pré-1.7). En production, fournir
    /// systématiquement une politique.
    pub permissions: Option<PermissionPolicy>,
    /// Politique de contexte (token counting + snip auto). Si `None`,
    /// l'historique n'est jamais réduit (sprint 1.4 behaviour).
    pub context: Option<ContextPolicy>,
    /// Persistance transcript JSONL (sprint 1.10). Si `None`, rien n'est
    /// écrit sur disque.
    pub transcript: Option<drox_session::TranscriptSessionConfig>,
    /// Sprint M1 — mémoire de session (compaction + persistance dans
    /// `.drox/memory/sessions/`). Si `None`, aucun résumé n'est produit et
    /// les tools `session_note` / `memory_*` ne sont pas branchés.
    pub memory: Option<MemoryRuntime>,
    /// Identifiant `ses_…` du transcript JSONL (JSON-RPC / extension). Sert
    /// aux enregistrements `context_chunk_summary` côté client.
    pub transcript_session_id: Option<String>,
    /// Empreinte workspace (chemin canonique) pour corréler l'index client.
    pub workspace_fingerprint: String,
    /// Nombre max de tools read-only exécutés en parallèle dans un même tour (§2.29).
    pub max_parallel_tool_calls: usize,
    /// Hooks pre/post tool (§2.6). `None` ou config vide = désactivé.
    pub tool_hooks: Option<ToolHooksConfig>,
    /// Objectif verrouillé du run (§2.25) — injecté en tête de conversation.
    pub run_objective: Option<String>,
    /// Caps Context-load soft (L2) — nudge post-`glob` one-shot.
    pub context_load: crate::agent::context_load::ContextLoadPolicy,
    /// Soft plan-frame — texte only, jamais un hard gate.
    pub work_plan_frame: bool,
    /// Soft analyzing-frame (classif `isAnalysis`).
    pub analysis_frame: bool,
    /// Soft doc-ingestion annex (classif `isDocIngestion`).
    pub doc_ingestion_frame: bool,
    /// Si `true`, les trois frames ci-dessus sont déjà décidés (tests / override RPC).
    /// Si `false`, le moteur pose l'ask multi-bool au boot (`drox_prompts`).
    pub session_intent_preclassified: bool,
    /// Explore child phase-1 : `[phase: answering]` / `[phase: done]` sans tool → Stop immédiat
    /// (la phase rapport moteur suit). Pas de DONE_ONLY / answering-before-done parent.
    pub explore_execution: bool,
    /// Profil moteur IDE (`local-9b` | `local-27b` | `cloud-full`) — knobs parent (CADRAGE 1.6.1 §3bis).
    pub engine_profile: String,
    /// Dev only. Quand `true`, chaque appel LLM émet `AgentEvent::HistoryProbe`
    /// (rôle, taille, extrait) sur l'historique réellement envoyé. L'IDE release
    /// ne pose jamais ce flag.
    pub history_probe: bool,
    /// Dev only. Absent / `false` : aucun fichier, aucun parcours du payload.
    /// `true` : écrit `*.run-capture.jsonl` à côté du transcript.
    pub run_capture: bool,
    /// Renseigné seulement quand `run_capture` est vrai.
    pub run_capture_path: Option<camino::Utf8PathBuf>,
}

/// Valeurs RPC / settings. Inconnu → `local-9b`.
#[must_use]
pub fn normalize_engine_profile(raw: Option<&str>) -> String {
    EngineProfile::parse(raw).id().to_string()
}

/// Profil moteur typé. Les knobs n'allègent que le **parent** ; le child Explore est inchangé.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineProfile {
    Local9b,
    Local27b,
    CloudFull,
}

impl EngineProfile {
    /// Inconnu / vide → `Local9b` (défaut produit).
    #[must_use]
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.map(str::trim) {
            Some("local-27b") => Self::Local27b,
            Some("cloud-full") => Self::CloudFull,
            _ => Self::Local9b,
        }
    }

    #[must_use]
    pub fn id(self) -> &'static str {
        match self {
            Self::Local9b => "local-9b",
            Self::Local27b => "local-27b",
            Self::CloudFull => "cloud-full",
        }
    }

    /// `local-9b` / `local-27b` : clôture portée par le moteur, CORE allégé, `task` inline.
    #[must_use]
    pub fn is_local(self) -> bool {
        !matches!(self, Self::CloudFull)
    }

    /// Nudges « Prefer » orientés plan / merge Explore : coupés en `local-9b` seulement.
    #[must_use]
    pub fn plan_nudges(self) -> bool {
        !matches!(self, Self::Local9b)
    }

    /// Gate dure « `todo_write` avant mutation » : `cloud-full` seulement.
    #[must_use]
    pub fn todo_before_mutation_gate(self) -> bool {
        matches!(self, Self::CloudFull)
    }

    /// Outils parent masqués (schéma absent). `None` = catalogue complet.
    /// S'ajoute aux `disabledTools` IDE (régulation L2) : jamais de ré-activation.
    #[must_use]
    pub fn parent_tool_allowlist(self) -> Option<&'static [&'static str]> {
        const LOCAL_9B: &[&str] = &[
            "todo_write",
            "file_read",
            "grep",
            "glob",
            "file_edit",
            "file_write",
            "delete_path",
            "bash",
            "task",
            "codebase_search",
            "exit_plan_mode",
        ];
        const LOCAL_27B: &[&str] = &[
            "todo_write",
            "file_read",
            "grep",
            "glob",
            "file_edit",
            "file_write",
            "delete_path",
            "copy_path",
            "notebook_edit",
            "bash",
            "task",
            "explore_artifact_read",
            "codebase_search",
            "exit_plan_mode",
            "lsp",
            "web_search",
            "web_fetch",
            "ask_user_question",
            "workspace_map_read",
            "memory_read",
            "memory_list",
            "session_note",
            "skill_list",
            "skill_read",
        ];
        match self {
            Self::Local9b => Some(LOCAL_9B),
            Self::Local27b => Some(LOCAL_27B),
            Self::CloudFull => None,
        }
    }

    /// Outil exposé au parent pour ce profil (MCP `mcp__*` toujours conservés).
    #[must_use]
    pub fn exposes_parent_tool(self, name: &str) -> bool {
        if name.starts_with("mcp__") || name == "mcp_call" || name == "course_plan_write" {
            return true;
        }
        self.parent_tool_allowlist()
            .map_or(true, |allow| allow.contains(&name))
    }
}

impl AgentConfig {
    #[must_use]
    pub fn profile(&self) -> EngineProfile {
        EngineProfile::parse(Some(self.engine_profile.as_str()))
    }
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            system_prompt: None,
            max_iterations: 12,
            chat_options: ChatOptions::default(),
            permissions: None,
            context: None,
            transcript: None,
            memory: None,
            transcript_session_id: None,
            workspace_fingerprint: String::new(),
            max_parallel_tool_calls: crate::tool_orchestration::DEFAULT_MAX_PARALLEL_TOOL_CALLS,
            tool_hooks: None,
            run_objective: None,
            context_load: crate::agent::context_load::ContextLoadPolicy::default(),
            work_plan_frame: false,
            analysis_frame: false,
            doc_ingestion_frame: false,
            // `true` par défaut : tests / Explore child ne déclenchent pas d'ask.
            // CLI / TUI / JSON-RPC (sans override) passent `false` pour classif boot.
            session_intent_preclassified: true,
            explore_execution: false,
            // Struct par défaut (tests, child Explore) = protocole 1.6.0. Le défaut
            // produit `local-9b` vient de `normalize_engine_profile` côté RPC / TUI.
            engine_profile: EngineProfile::CloudFull.id().to_string(),
            history_probe: false,
            run_capture: false,
            run_capture_path: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_engine_profile_defaults_and_aliases() {
        assert_eq!(normalize_engine_profile(None), "local-9b");
        assert_eq!(normalize_engine_profile(Some("")), "local-9b");
        assert_eq!(normalize_engine_profile(Some("nope")), "local-9b");
        assert_eq!(normalize_engine_profile(Some("local-9b")), "local-9b");
        assert_eq!(normalize_engine_profile(Some("local-27b")), "local-27b");
        assert_eq!(normalize_engine_profile(Some("cloud-full")), "cloud-full");
    }

    #[test]
    fn struct_default_keeps_full_protocol() {
        assert_eq!(AgentConfig::default().profile(), EngineProfile::CloudFull);
    }

    #[test]
    fn local_9b_parent_surface_keeps_task_codebase_and_todo() {
        let p = EngineProfile::Local9b;
        for name in ["task", "codebase_search", "todo_write", "file_edit", "bash", "mcp__x__y"] {
            assert!(p.exposes_parent_tool(name), "{name}");
        }
        for name in ["session_compact", "git_worktree_enter", "web_fetch", "explore_artifact_read"] {
            assert!(!p.exposes_parent_tool(name), "{name}");
        }
        assert!(EngineProfile::Local27b.exposes_parent_tool("ask_user_question"));
        assert!(EngineProfile::CloudFull.exposes_parent_tool("session_compact"));
    }
}
