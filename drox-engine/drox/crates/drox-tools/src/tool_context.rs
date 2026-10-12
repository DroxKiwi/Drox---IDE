//! Contexte d'exécution passé à chaque tool.

use std::sync::Arc;

use camino::{Utf8Path, Utf8PathBuf};
use drox_mcp::McpHub;

use crate::error::ToolError;
use crate::tool_progress::ToolProgressSink;

use crate::user_ask::UserAsker;
use crate::scope_deferred::ScopeDeferredHandle;
use crate::session_notes::SessionNotesHandle;
use crate::subagent::commit::ExploreCommitHandle;
use crate::subagent::{SubagentExecutor, SubagentSettings};
use drox_session::{DroxIgnoreMatcher, WorkspaceMapStore};

/// Contexte partagé par tous les tools d'une session.
///
/// Cheap-to-clone : `user_asker` est derrière un `Arc`, et `session_notes`
/// encapsule déjà un `Arc<Mutex<…>>`.
#[derive(Clone)]
pub struct ToolContext {
    /// Racine du workspace : les chemins relatifs y sont résolus.
    pub workspace_root: Utf8PathBuf,
    /// Si `true`, les tools modifiant le filesystem (`file_write`, `file_edit`, `delete_path`)
    /// écrivent réellement. Sinon, ils retournent uniquement une proposition
    /// JSON (mode client / preview).
    pub apply_fs_writes: bool,
    /// Si `true`, les tools d'écriture refusent d'écrire (`PlanModeViolation`).
    pub plan_mode: bool,
    /// Si `true`, inventaire / recherche hors workspace (`glob`, `grep`).
    pub allow_outside_workspace_read: bool,
    /// Si `true`, mutations / bash hors workspace (`file_write`, `file_edit`, …).
    pub allow_outside_workspace_write: bool,
    /// Mécanisme optionnel pour poser une question à l'humain (utilisé par
    /// `ask_user_question` et `exit_plan_mode`).
    pub user_asker: Option<Arc<dyn UserAsker>>,
    /// Stock partagé des notes épinglées par `session_note` pendant le run.
    /// `None` quand le moteur n'a pas configuré la mémoire de session (ex.
    /// tests legacy) — le tool retournera alors une erreur explicite.
    pub session_notes: Option<SessionNotesHandle>,
    /// Connexions MCP chargées depuis `.mcp.json` / `mcp.json` (sprint §2.28).
    pub mcp_hub: Option<Arc<McpHub>>,
    /// Parking hors scope (`scope_defer`, §2.25). `None` hors run agent.
    pub scope_deferred: Option<ScopeDeferredHandle>,
    /// Carte structure workspace (§2.23). `None` hors run agent.
    pub workspace_map: Option<WorkspaceMapStore>,
    /// Filtre `.droxignore` (§2.34). `None` hors run agent / tests.
    pub drox_ignore: Option<DroxIgnoreMatcher>,
    /// Paramètres sous-agents (§2.10). `None` = désactivé.
    pub subagent_settings: Option<SubagentSettings>,
    /// Exécuteur moteur pour `task` (explore). `None` si sous-agents désactivés.
    pub subagent_executor: Option<Arc<dyn SubagentExecutor>>,
    /// Rapports de progression (bash stream, etc.).
    pub tool_progress: Option<Arc<dyn ToolProgressSink>>,
    /// Id du run agent (`run_…`) — télémétrie / logging.
    pub agent_run_id: Option<String>,
    /// Id de discussion (`ses_…`) — **scope** index / artefacts Explore (pas de fuite cross-chat).
    pub chat_session_id: Option<String>,
    /// Commits progressifs + journal L0 de l’Explore enfant (`explore_commit`).
    /// `None` hors run Explore.
    pub explore_commit: Option<ExploreCommitHandle>,
}

impl ToolContext {
    /// Contexte minimal (pas d'asker, pas de `plan_mode`, pas de session
    /// notes).
    #[must_use]
    pub fn new(workspace_root: Utf8PathBuf, apply_fs_writes: bool) -> Self {
        Self {
            workspace_root,
            apply_fs_writes,
            plan_mode: false,
            allow_outside_workspace_read: false,
            allow_outside_workspace_write: false,
            user_asker: None,
            session_notes: None,
            mcp_hub: None,
            scope_deferred: None,
            workspace_map: None,
            drox_ignore: None,
            subagent_settings: None,
            subagent_executor: None,
            tool_progress: None,
            agent_run_id: None,
            chat_session_id: None,
            explore_commit: None,
        }
    }

    /// Builder : id de run pour artefacts sous-agents.
    #[must_use]
    pub fn with_agent_run_id(mut self, run_id: impl Into<String>) -> Self {
        self.agent_run_id = Some(run_id.into());
        self
    }

    /// Builder : id de discussion (`ses_…`) pour scope Explore.
    #[must_use]
    pub fn with_chat_session_id(mut self, session_id: impl Into<String>) -> Self {
        self.chat_session_id = Some(session_id.into());
        self
    }

    /// Builder : associe un `UserAsker` au contexte.
    #[must_use]
    pub fn with_user_asker(mut self, asker: Arc<dyn UserAsker>) -> Self {
        self.user_asker = Some(asker);
        self
    }

    /// Builder : active le plan mode (read-only).
    #[must_use]
    pub const fn with_plan_mode(mut self, plan_mode: bool) -> Self {
        self.plan_mode = plan_mode;
        self
    }

    /// Builder : lecture + écriture hors workspace (legacy / tests).
    #[must_use]
    pub const fn with_allow_outside_workspace(mut self, allow: bool) -> Self {
        self.allow_outside_workspace_read = allow;
        self.allow_outside_workspace_write = allow;
        self
    }

    /// Builder : inventaire / recherche hors workspace uniquement.
    #[must_use]
    pub const fn with_allow_outside_workspace_read(mut self, allow: bool) -> Self {
        self.allow_outside_workspace_read = allow;
        self
    }

    /// Builder : mutations hors workspace uniquement.
    #[must_use]
    pub const fn with_allow_outside_workspace_write(mut self, allow: bool) -> Self {
        self.allow_outside_workspace_write = allow;
        self
    }

    /// Builder : attache le stock de notes de session partagé.
    #[must_use]
    pub fn with_session_notes(mut self, notes: SessionNotesHandle) -> Self {
        self.session_notes = Some(notes);
        self
    }

    /// Builder : attache le hub MCP du workspace.
    #[must_use]
    pub fn with_mcp_hub(mut self, hub: Arc<McpHub>) -> Self {
        self.mcp_hub = Some(hub);
        self
    }

    /// Builder : attache le stock `scope_defer` du run.
    #[must_use]
    pub fn with_scope_deferred(mut self, handle: ScopeDeferredHandle) -> Self {
        self.scope_deferred = Some(handle);
        self
    }

    /// Builder : attache la carte workspace du run.
    #[must_use]
    pub fn with_workspace_map(mut self, store: WorkspaceMapStore) -> Self {
        self.workspace_map = Some(store);
        self
    }

    /// Builder : attache le matcher `.droxignore` du run.
    #[must_use]
    pub fn with_drox_ignore(mut self, matcher: DroxIgnoreMatcher) -> Self {
        self.drox_ignore = Some(matcher);
        self
    }

    /// Builder : paramètres sous-agents (`task`, §2.10).
    #[must_use]
    pub fn with_subagent_settings(mut self, settings: SubagentSettings) -> Self {
        self.subagent_settings = Some(settings);
        self
    }

    /// Builder : exécuteur de sous-agents branché par le moteur.
    #[must_use]
    pub fn with_subagent_executor(mut self, executor: Arc<dyn SubagentExecutor>) -> Self {
        self.subagent_executor = Some(executor);
        self
    }

    /// Builder : sink de progression pour tools longs (bash).
    #[must_use]
    pub fn with_tool_progress(mut self, sink: Arc<dyn ToolProgressSink>) -> Self {
        self.tool_progress = Some(sink);
        self
    }

    /// Builder : handle commits Explore (enfant uniquement).
    #[must_use]
    pub fn with_explore_commit(mut self, handle: ExploreCommitHandle) -> Self {
        self.explore_commit = Some(handle);
        self
    }

    /// Racine utilisée par les tools fs/bash (worktree actif si §2.32).
    #[must_use]
    pub fn effective_workspace(&self) -> Utf8PathBuf {
        crate::git_worktree::effective_workspace_root(&self.workspace_root)
    }

    /// Refuse si le chemin résolu est listé dans `.droxignore` (§2.34).
    pub fn deny_if_drox_ignored(&self, resolved: &Utf8Path) -> Result<(), ToolError> {
        if let Some(ref ignore) = self.drox_ignore {
            if ignore.is_ignored(resolved.as_std_path()) {
                return Err(ToolError::drox_ignore(resolved.to_path_buf()));
            }
        }
        Ok(())
    }
}

impl std::fmt::Debug for ToolContext {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolContext")
            .field("workspace_root", &self.workspace_root)
            .field("apply_fs_writes", &self.apply_fs_writes)
            .field("plan_mode", &self.plan_mode)
            .field(
                "allow_outside_workspace_read",
                &self.allow_outside_workspace_read,
            )
            .field(
                "allow_outside_workspace_write",
                &self.allow_outside_workspace_write,
            )
            .field("user_asker", &self.user_asker.as_ref().map(|_| "<asker>"))
            .field(
                "session_notes",
                &self.session_notes.as_ref().map(SessionNotesHandle::len),
            )
            .field(
                "mcp_hub",
                &self.mcp_hub.as_ref().map(|h| h.server_names().len()),
            )
            .finish()
    }
}
