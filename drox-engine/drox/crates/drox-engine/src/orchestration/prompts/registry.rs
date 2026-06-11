//! Registre des blocs system (IDs stables — export, strictness, injection future).
//! Voir `drox-engine/docs/1.3/1.3.2/PROMPTS-ADDITIFS-1.3.2.md`.

/// Identifiant d'un bloc injectable (catalogue spec — chargement runtime via `include_str!`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PromptBlockId {
    G2DiscussCore,
    G2DiscussReadBudget,
    G3EditCore,
    G3EditUserFacing,
    G3EditClosure,
    // Tool protocol blocks (T-*)
    TTodoWrite,
    TWorkspaceMapRead,
    TFileEdit,
    TFileWrite,
    TFileRead,
    TGrep,
    TLsp,
    TArchitectHelp,
    TAskUserQuestion,
    // Contexte run (dynamique)
    CtxRunSnapshot,
}

impl PromptBlockId {
    #[must_use]
    pub const fn wire_id(self) -> &'static str {
        match self {
            Self::G2DiscussCore => "g2_discuss_core",
            Self::G2DiscussReadBudget => "g2_discuss_read_budget",
            Self::G3EditCore => "g3_edit_core",
            Self::G3EditUserFacing => "g3_edit_user_facing",
            Self::G3EditClosure => "g3_edit_closure",
            Self::TTodoWrite => "t_todo_write",
            Self::TWorkspaceMapRead => "t_workspace_map_read",
            Self::TFileEdit => "t_file_edit",
            Self::TFileWrite => "t_file_write",
            Self::TFileRead => "t_file_read",
            Self::TGrep => "t_grep",
            Self::TLsp => "t_lsp",
            Self::TArchitectHelp => "t_architect_help",
            Self::TAskUserQuestion => "t_ask_user_question",
            Self::CtxRunSnapshot => "ctx_run_snapshot",
        }
    }
}
