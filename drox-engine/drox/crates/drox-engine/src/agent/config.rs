//! Configuration d'un [`crate::agent::Agent`].

use drox_hooks::ToolHooksConfig;
use drox_llm::ChatOptions;

use crate::context::ContextPolicy;
use crate::memory::MemoryRuntime;
use crate::permissions::PermissionPolicy;

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
        }
    }
}
