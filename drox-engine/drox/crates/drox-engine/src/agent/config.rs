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
        }
    }
}
