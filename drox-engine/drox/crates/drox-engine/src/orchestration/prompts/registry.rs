//! Registre des blocs system (IDs stables — export, strictness, injection future).
//! Voir `drox-engine/docs/1.3/1.3.2/PROMPTS-ADDITIFS-1.3.2.md`.

/// Identifiant d'un bloc injectable (catalogue spec — chargement runtime via `include_str!`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PromptBlockId {
    G2DiscussCore,
    G2DiscussReadBudget,
    G3EditCore,
    G3EditWorkMode,
    G3EditDiscoveryPlaybook,
    G3EditStructuralExploration,
    G3EditEphemeralExecutors,
    G3EditVisiblePlan,
    G3EditProtocolMarkers,
    G3EditBeforeDelegating,
    G3EditCyclePerTask,
    G3EditLargeDirectories,
    G3EditDelegationVsReads,
    G3EditDelegationTemplates,
    G3EditAfterVerification,
    G3EditCycleSanity,
    G3EditClosure,
    G3EditUserFacing,
    G3EditTools,
    G3EditRules,
    G4EditParallelSlots,
    // Tool protocol blocks (T-*)
    TTodoWrite,
    TWorkspaceMapRead,
    TDelegateExecutor,
    TFileRead,
    TGrep,
    TLsp,
    TArchitectHelp,
    TAskUserQuestion,
    // Contexte run (dynamique)
    CtxRunSnapshot,
    CtxDelegateCheckpoint,
    // Executor
    G5ExecutorCore,
    G5ExecutorRole,
}

impl PromptBlockId {
    #[must_use]
    pub const fn wire_id(self) -> &'static str {
        match self {
            Self::G2DiscussCore => "g2_discuss_core",
            Self::G2DiscussReadBudget => "g2_discuss_read_budget",
            Self::G3EditCore => "g3_edit_core",
            Self::G3EditWorkMode => "g3_edit_work_mode",
            Self::G3EditDiscoveryPlaybook => "g3_edit_discovery",
            Self::G3EditStructuralExploration => "g3_edit_structural",
            Self::G3EditEphemeralExecutors => "g3_edit_executors",
            Self::G3EditVisiblePlan => "g3_edit_visible_plan",
            Self::G3EditProtocolMarkers => "g3_edit_protocol_markers",
            Self::G3EditBeforeDelegating => "g3_edit_before_delegate",
            Self::G3EditCyclePerTask => "g3_edit_cycle_per_task",
            Self::G3EditLargeDirectories => "g3_edit_large_dirs",
            Self::G3EditDelegationVsReads => "g3_edit_delegation_reads",
            Self::G3EditDelegationTemplates => "g3_edit_delegate_templates",
            Self::G3EditAfterVerification => "g3_edit_after_verify",
            Self::G3EditCycleSanity => "g3_edit_cycle_sanity",
            Self::G3EditClosure => "g3_edit_closure",
            Self::G3EditUserFacing => "g3_edit_user_facing",
            Self::G3EditTools => "g3_edit_tools",
            Self::G3EditRules => "g3_edit_rules",
            Self::G4EditParallelSlots => "g4_edit_parallel_slots",
            Self::TTodoWrite => "t_todo_write",
            Self::TWorkspaceMapRead => "t_workspace_map_read",
            Self::TDelegateExecutor => "t_delegate_executor",
            Self::TFileRead => "t_file_read",
            Self::TGrep => "t_grep",
            Self::TLsp => "t_lsp",
            Self::TArchitectHelp => "t_architect_help",
            Self::TAskUserQuestion => "t_ask_user_question",
            Self::CtxRunSnapshot => "ctx_run_snapshot",
            Self::CtxDelegateCheckpoint => "ctx_delegate_checkpoint",
            Self::G5ExecutorCore => "g5_executor_core",
            Self::G5ExecutorRole => "g5_executor_role",
        }
    }
}
