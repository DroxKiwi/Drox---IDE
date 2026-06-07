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

/// Allowlist **discussion** — lecture / navigation (pas de plan ni délégation).
pub const ARCHITECT_DISCUSSION_TOOL_ALLOWLIST: &[&str] = &[
    "file_read",
    "glob",
    "grep",
    "lsp",
    "memory_list",
    "memory_read",
    "workspace_map_read",
];

/// Allowlist outils rôle **Architecte** — agent principal omniscient (lecture + édition + orchestration).
/// Les **Executor** sub-runs restent bornés via [`EXECUTOR_TOOL_ALLOWLIST`].
pub const ARCHITECT_TOOL_ALLOWLIST: &[&str] = &[
    "architect_help",
    "ask_user_question",
    "bash",
    "copy_path",
    "delegate_executor",
    "delete_path",
    "file_edit",
    "file_read",
    "file_write",
    "glob",
    "grep",
    "git_worktree_enter",
    "git_worktree_exit",
    "lsp",
    "memory_list",
    "memory_read",
    "notebook_edit",
    "scope_defer",
    "session_compact",
    "session_note",
    "session_search",
    "skill_list",
    "skill_read",
    "todo_write",
    "web_fetch",
    "web_search",
    "workspace_map_note",
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
    /// Single-agent loop (CLI one-shot, professor path). **Not** used by IDE `agent.run` (`role_split` only).
    Standard,
    /// Planification / découpage (`role_split`).
    Architect,
    /// Réponse conversationnelle + lecture repo (`role_split` — pilier discussion).
    ArchitectDiscussion,
    /// Exécution bornée (`role_split`).
    Executor,
}

/// Gates booléennes (`EngineTuning` L1–L5).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GateFlags {
    pub done_requires_answering: bool,
    pub testing_after_code_mutation: bool,
    pub todo_recreation_blocked: bool,
    pub professor_course_plan: bool,
    pub todo_stale_before_done: bool,
}

impl GateFlags {
    #[must_use]
    pub const fn all_enabled() -> Self {
        Self {
            done_requires_answering: true,
            testing_after_code_mutation: true,
            todo_recreation_blocked: true,
            professor_course_plan: true,
            todo_stale_before_done: true,
        }
    }

    #[must_use]
    pub fn from_tuning(tuning: &crate::orchestration::EngineTuning) -> Self {
        Self {
            done_requires_answering: tuning.gate_done_requires_answering,
            testing_after_code_mutation: tuning.gate_testing_after_code_mutation,
            todo_recreation_blocked: tuning.gate_todo_recreation_blocked,
            professor_course_plan: tuning.gate_professor_course_plan,
            todo_stale_before_done: tuning.gate_todo_stale_before_done,
        }
    }
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
    pub gates: GateFlags,
    /// Discussion : `false` après `START_RUN.discuss_reply_only` (aucun outil).
    pub discussion_allow_reads: bool,
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
            gates: GateFlags::all_enabled(),
            discussion_allow_reads: true,
        }
    }

    /// Spec pour un rôle d'orchestration 1.2.0 (`Architect`, `Executor`, …).
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
            RoleId::ArchitectDiscussion => (
                RunLimits {
                    max_tools_per_turn: Some(4),
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
            gates: GateFlags::all_enabled(),
            discussion_allow_reads: true,
        }
    }

    /// Architecte en mode discussion — outils lecture seule (pas de plan / delegate).
    #[must_use]
    pub fn for_architect_discussion() -> Self {
        Self::for_architect_discussion_with_reads(true)
    }

    /// Discussion avec ou sans outils lecture (`discuss.needs_repo_facts`).
    #[must_use]
    pub fn for_architect_discussion_with_reads(allow_reads: bool) -> Self {
        let mut spec = Self::for_orchestration_role(RoleId::ArchitectDiscussion);
        spec.discussion_allow_reads = allow_reads;
        spec
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
            RoleId::ArchitectDiscussion => {
                self.discussion_allow_reads
                    && ARCHITECT_DISCUSSION_TOOL_ALLOWLIST.contains(&tool_name)
            }
            RoleId::Executor => EXECUTOR_TOOL_ALLOWLIST.contains(&tool_name),
        }
    }

    #[must_use]
    pub fn gate_enabled(&self, kind: GateKind) -> bool {
        match kind {
            GateKind::DoneRequiresAnswering => self.gates.done_requires_answering,
            GateKind::TestingAfterCodeMutation => self.gates.testing_after_code_mutation,
            GateKind::TodoRecreationBlocked => self.gates.todo_recreation_blocked,
            GateKind::ProfessorCoursePlan => self.gates.professor_course_plan,
            GateKind::TodoStaleBeforeDone => self.gates.todo_stale_before_done,
        }
    }

    /// Identifiant wire pour événements UI (`architect`, `executor`, …).
    #[must_use]
    pub fn role_wire_id(&self) -> &'static str {
        match self.role_id {
            RoleId::Standard => "standard",
            RoleId::Architect => "architect",
            RoleId::ArchitectDiscussion => "architect_discussion",
            RoleId::Executor => "executor",
        }
    }

    #[must_use]
    pub fn is_orchestration_role(&self) -> bool {
        matches!(
            self.role_id,
            RoleId::Architect | RoleId::ArchitectDiscussion | RoleId::Executor
        )
    }

    #[must_use]
    pub fn is_architect_discussion(&self) -> bool {
        self.role_id == RoleId::ArchitectDiscussion
    }

    /// Applique les limites par rôle depuis [`crate::orchestration::EngineTuning`].
    #[must_use]
    pub fn for_orchestration_role_with_tuning(
        role_id: RoleId,
        tuning: &crate::orchestration::EngineTuning,
    ) -> Self {
        let mut spec = Self::for_orchestration_role(role_id);
        match role_id {
            RoleId::Architect => {
                spec.limits.max_tools_per_turn =
                    Some(tuning.max_tools_per_turn_architect as usize);
            }
            RoleId::ArchitectDiscussion => {
                spec.limits.max_tools_per_turn =
                    Some(tuning.max_tools_per_turn_discussion as usize);
            }
            RoleId::Executor => {
                spec.limits.max_tools_per_turn =
                    Some(tuning.max_tools_per_turn_executor as usize);
            }
            RoleId::Standard => {}
        }
        spec.limits.max_todo_items = tuning.max_todo_items.map(|n| n as usize);
        spec.limits.memory_budget_tokens = tuning.memory_budget_tokens;
        spec.gates = GateFlags::from_tuning(tuning);
        spec
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
    fn architect_allowlist_allows_mutations_and_delegate() {
        let spec = RunSpec::for_orchestration_role(RoleId::Architect);
        assert!(spec.tool_visible("file_read"));
        assert!(spec.tool_visible("grep"));
        assert!(spec.tool_visible("delegate_executor"));
        assert!(spec.tool_visible("file_edit"));
        assert!(spec.tool_visible("bash"));
        assert!(spec.tool_visible("file_write"));
        assert!(!spec.tool_visible("course_plan_write"));
        assert!(!spec.tool_visible("session_end"));
        assert!(!spec.tool_visible("task"));
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

    #[test]
    fn architect_discussion_read_only_allowlist() {
        let spec = RunSpec::for_architect_discussion();
        assert!(spec.tool_visible("file_read"));
        assert!(spec.tool_visible("workspace_map_read"));
        assert!(!spec.tool_visible("delegate_executor"));
        assert!(!spec.tool_visible("todo_write"));
        assert!(!spec.tool_visible("file_write"));
    }

    #[test]
    fn architect_discussion_reply_only_blocks_all_tools() {
        let spec = RunSpec::for_architect_discussion_with_reads(false);
        assert!(!spec.discussion_allow_reads);
        assert!(!spec.tool_visible("file_read"));
        assert!(!spec.tool_visible("workspace_map_read"));
    }

    #[test]
    fn tuning_can_disable_done_requires_answering_gate() {
        let mut tuning = crate::orchestration::EngineTuning::from_preset(
            crate::orchestration::StrictnessPreset::Strict,
        );
        tuning.gate_done_requires_answering = false;
        let spec = RunSpec::for_orchestration_role_with_tuning(RoleId::Architect, &tuning);
        assert!(!spec.gate_enabled(GateKind::DoneRequiresAnswering));
        assert!(spec.gate_enabled(GateKind::TestingAfterCodeMutation));
    }
}
