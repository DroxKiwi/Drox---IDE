//! Contrat d'exécution d'un run (`RunSpec`) — couche B.

/// Type de gate moteur (`agent/gates.rs`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GateKind {
    DoneRequiresAnswering,
    TestingAfterCodeMutation,
    TodoRecreationBlocked,
    ProfessorCoursePlan,
    TodoStaleBeforeDone,
}

/// Allowlist outils rôle **Architecte** (lecture + plan, pas de mutation repo).
pub const ARCHITECT_TOOL_ALLOWLIST: &[&str] = &[
    "architect_help",
    "ask_user_question",
    "delegate_executor",
    "file_read",
    "glob",
    "grep",
    "lsp",
    "memory_list",
    "memory_read",
    "todo_write",
    "workspace_map_read",
];

/// Allowlist outils rôle **Exécutant** (périmètre opérationnel borné).
/// Pas de `todo_write` ni `ask_user_question` : le plan et les questions utilisateur
/// appartiennent à l'Architecte ; l'exécuteur livre via le rapport structuré.
pub const EXECUTOR_TOOL_ALLOWLIST: &[&str] = &[
    "bash",
    "file_edit",
    "file_read",
    "file_write",
    "glob",
    "grep",
    "lsp",
];

/// Version du schéma `RunSpec` (évolution additive).
pub const RUN_SPEC_VERSION: u32 = 1;

/// Rôle logique du run (orchestration 1.2.0 + agent unique legacy).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RoleId {
    /// Boucle agent unique — registre complet.
    Standard,
    /// Planification / découpage (`v1_2`).
    Architect,
    /// Exécution bornée (`v1_2`).
    Executor,
}

/// Limites numériques injectées dans la boucle agent.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RunLimits {
    pub max_tools_per_turn: Option<usize>,
    pub max_todo_items: Option<usize>,
    pub memory_budget_tokens: Option<u32>,
}

/// Spécification d'un run unique pour [`crate::agent::Agent`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunSpec {
    pub spec_version: u32,
    pub role_id: RoleId,
    pub limits: RunLimits,
    pub subagents_enabled: bool,
}

impl RunSpec {
    /// Agent unique (registre complet, limites par défaut).
    #[must_use]
    pub fn for_standard_agent(subagents_enabled: bool) -> Self {
        Self {
            spec_version: RUN_SPEC_VERSION,
            role_id: RoleId::Standard,
            limits: RunLimits::default(),
            subagents_enabled,
        }
    }

    /// Spec pour un rôle d'orchestration 1.2.0 (`Architect` ou `Executor`).
    #[must_use]
    pub fn for_orchestration_role(role_id: RoleId) -> Self {
        let (limits, subagents_enabled) = match role_id {
            RoleId::Architect => (
                RunLimits {
                    max_tools_per_turn: Some(6),
                    max_todo_items: None,
                    memory_budget_tokens: None,
                },
                false,
            ),
            RoleId::Executor => (
                RunLimits {
                    max_tools_per_turn: Some(2),
                    max_todo_items: None,
                    memory_budget_tokens: None,
                },
                false,
            ),
            RoleId::Standard => {
                return Self::for_standard_agent(false);
            }
        };
        Self {
            spec_version: RUN_SPEC_VERSION,
            role_id,
            limits,
            subagents_enabled,
        }
    }

    #[must_use]
    pub fn with_subagents_enabled(mut self, enabled: bool) -> Self {
        self.subagents_enabled = enabled;
        self
    }

    #[must_use]
    pub fn memory_budget_tokens(&self) -> Option<u32> {
        self.limits.memory_budget_tokens
    }

    #[must_use]
    pub fn max_tools_per_turn(&self) -> Option<usize> {
        self.limits.max_tools_per_turn
    }

    #[must_use]
    pub fn max_todo_items(&self) -> Option<usize> {
        self.limits.max_todo_items
    }

    #[must_use]
    pub fn tool_visible(&self, tool_name: &str) -> bool {
        if tool_name.starts_with("mcp__") {
            return self.role_id == RoleId::Standard;
        }
        match self.role_id {
            RoleId::Standard => true,
            RoleId::Architect => ARCHITECT_TOOL_ALLOWLIST.contains(&tool_name),
            RoleId::Executor => EXECUTOR_TOOL_ALLOWLIST.contains(&tool_name),
        }
    }

    #[must_use]
    pub fn gate_enabled(&self, kind: GateKind) -> bool {
        let _ = (self.role_id, kind);
        true
    }

    /// Identifiant wire pour événements UI (`architect`, `executor`, …).
    #[must_use]
    pub fn role_wire_id(&self) -> &'static str {
        match self.role_id {
            RoleId::Standard => "standard",
            RoleId::Architect => "architect",
            RoleId::Executor => "executor",
        }
    }

    #[must_use]
    pub fn is_orchestration_role(&self) -> bool {
        matches!(self.role_id, RoleId::Architect | RoleId::Executor)
    }
}

impl Default for RunSpec {
    fn default() -> Self {
        Self::for_standard_agent(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_spec_is_standard() {
        let spec = RunSpec::default();
        assert_eq!(spec.role_id, RoleId::Standard);
    }

    #[test]
    fn architect_allowlist_blocks_file_edit() {
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(spec.tool_visible("file_read"));
        assert!(spec.tool_visible("grep"));
        assert!(spec.tool_visible("delegate_executor"));
        assert!(!spec.tool_visible("file_edit"));
        assert!(!spec.tool_visible("bash"));
    }

    #[test]
    fn executor_allowlist_allows_mutations() {
        let spec = RunSpec::for_orchestration_role(RoleId::Executor);
        assert!(spec.tool_visible("file_edit"));
        assert!(spec.tool_visible("bash"));
        assert!(!spec.tool_visible("web_search"));
        assert!(!spec.tool_visible("todo_write"));
        assert!(!spec.tool_visible("ask_user_question"));
    }

    #[test]
    fn standard_exposes_web_search() {
        let spec = RunSpec::for_standard_agent(false);
        assert!(spec.tool_visible("web_search"));
    }
}
