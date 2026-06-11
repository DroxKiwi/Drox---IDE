use drox_hooks::ToolHooksConfig;
use drox_llm::ChatOptions;

use crate::context::ContextPolicy;
use crate::memory::MemoryRuntime;
use crate::permissions::PermissionPolicy;
use crate::run_spec::RunSpec;

/// Configuration d'un agent.
#[derive(Debug, Clone)]
pub struct AgentConfig {
    /// System prompt optionnel injectÃ© en tÃªte de conversation.
    pub system_prompt: Option<String>,
    /// Nombre maximum d'allers-retours LLM â†” tools dans un mÃªme `run()`.
    pub max_iterations: usize,
    /// Options passÃ©es tel quel au `LlmClient` (tools y sont ajoutÃ©s
    /// automatiquement Ã  partir du `ToolRegistry`).
    pub chat_options: ChatOptions,
    /// Politique de permissions. Si `None`, aucun garde-fou : tous les tool
    /// calls sont exÃ©cutÃ©s (mode "ancien" prÃ©-1.7). En production, fournir
    /// systÃ©matiquement une politique.
    pub permissions: Option<PermissionPolicy>,
    /// Politique de contexte (token counting + snip auto). Si `None`,
    /// l'historique n'est jamais rÃ©duit (sprint 1.4 behaviour).
    pub context: Option<ContextPolicy>,
    /// Persistance transcript JSONL (sprint 1.10). Si `None`, rien n'est
    /// Ã©crit sur disque.
    pub transcript: Option<drox_session::TranscriptSessionConfig>,
    /// Sprint M1 â€” mÃ©moire de session (compaction + persistance dans
    /// `.drox/memory/sessions/`). Si `None`, aucun rÃ©sumÃ© n'est produit et
    /// les tools `session_note` / `memory_*` ne sont pas branchÃ©s.
    pub memory: Option<MemoryRuntime>,
    /// Identifiant `ses_â€¦` du transcript JSONL (JSON-RPC / extension). Sert
    /// aux enregistrements `context_chunk_summary` cÃ´tÃ© client.
    pub transcript_session_id: Option<String>,
    /// Empreinte workspace (chemin canonique) pour corrÃ©ler l'index client.
    pub workspace_fingerprint: String,
    /// Nombre max de tools read-only exÃ©cutÃ©s en parallÃ¨le dans un mÃªme tour (Â§2.29).
    pub max_parallel_tool_calls: usize,
    /// Hooks pre/post tool (Â§2.6). `None` ou config vide = dÃ©sactivÃ©.
    pub tool_hooks: Option<ToolHooksConfig>,
    /// Objectif verrouillÃ© du run (Â§2.25) â€” injectÃ© en tÃªte de conversation.
    pub run_objective: Option<String>,
    /// SpÃ©cification d'exÃ©cution du run (couche B). Voir `run_spec`.
    pub run_spec: RunSpec,
    /// ParamÃ¨tres strictness / gates rÃ©solus (`resolve_engine_tuning`).
    pub engine_tuning: crate::orchestration::EngineTuning,
    /// Id run orchestration (corrÃ©lation RPC / transcript).
    pub orchestration_run_id: Option<String>,
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
            run_spec: RunSpec::default(),
            engine_tuning: crate::orchestration::EngineTuning::default(),
            orchestration_run_id: None,
        }
    }
}
