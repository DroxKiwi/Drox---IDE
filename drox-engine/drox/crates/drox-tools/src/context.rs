//! Contexte d'exécution passé à chaque tool.

use std::sync::Arc;

use camino::{Utf8Path, Utf8PathBuf};
use drox_mcp::McpHub;

use crate::error::ToolError;

use crate::asker::UserAsker;
use crate::scope_deferred::ScopeDeferredHandle;
use crate::session_notes::SessionNotesHandle;
use crate::simple::ArchitectHelpSnapshot;
use drox_session::{DroxIgnoreMatcher, WorkspaceMapStore};

/// Contexte partagé par tous les tools d'une session.
#[derive(Clone)]
pub struct ToolContext {
    pub workspace_root: Utf8PathBuf,
    pub apply_fs_writes: bool,
    pub plan_mode: bool,
    pub user_asker: Option<Arc<dyn UserAsker>>,
    pub session_notes: Option<SessionNotesHandle>,
    pub mcp_hub: Option<Arc<McpHub>>,
    pub scope_deferred: Option<ScopeDeferredHandle>,
    pub workspace_map: Option<WorkspaceMapStore>,
    pub drox_ignore: Option<DroxIgnoreMatcher>,
    /// Autorise clôture run architecte sans plan interne ouvert.
    pub orchestration_run_closable: bool,
    /// Snapshot pour `architect_help` (rôle Architecte uniquement).
    pub architect_help_snapshot: Option<ArchitectHelpSnapshot>,
}

impl ToolContext {
    #[must_use]
    pub fn new(workspace_root: Utf8PathBuf, apply_fs_writes: bool) -> Self {
        Self {
            workspace_root,
            apply_fs_writes,
            plan_mode: false,
            user_asker: None,
            session_notes: None,
            mcp_hub: None,
            scope_deferred: None,
            workspace_map: None,
            drox_ignore: None,
            orchestration_run_closable: false,
            architect_help_snapshot: None,
        }
    }

    #[must_use]
    pub fn with_architect_help_snapshot(mut self, snapshot: ArchitectHelpSnapshot) -> Self {
        self.architect_help_snapshot = Some(snapshot);
        self
    }

    #[must_use]
    pub fn with_user_asker(mut self, asker: Arc<dyn UserAsker>) -> Self {
        self.user_asker = Some(asker);
        self
    }

    #[must_use]
    pub const fn with_plan_mode(mut self, plan_mode: bool) -> Self {
        self.plan_mode = plan_mode;
        self
    }

    #[must_use]
    pub fn with_session_notes(mut self, notes: SessionNotesHandle) -> Self {
        self.session_notes = Some(notes);
        self
    }

    #[must_use]
    pub fn with_mcp_hub(mut self, hub: Arc<McpHub>) -> Self {
        self.mcp_hub = Some(hub);
        self
    }

    #[must_use]
    pub fn with_scope_deferred(mut self, handle: ScopeDeferredHandle) -> Self {
        self.scope_deferred = Some(handle);
        self
    }

    #[must_use]
    pub fn with_workspace_map(mut self, store: WorkspaceMapStore) -> Self {
        self.workspace_map = Some(store);
        self
    }

    #[must_use]
    pub fn with_drox_ignore(mut self, matcher: DroxIgnoreMatcher) -> Self {
        self.drox_ignore = Some(matcher);
        self
    }

    #[must_use]
    pub fn effective_workspace(&self) -> Utf8PathBuf {
        crate::git_worktree::effective_workspace_root(&self.workspace_root)
    }

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
