//! Dialogue workspace.

#![allow(unused_imports)]

use super::App;

use std::collections::{HashMap, VecDeque};
use std::io;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::Context;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use drox_cli::env_file;
use drox_engine::{AgentEvent, EngineError};
use drox_session::{default_sessions_dir, list_sessions};
use drox_tools::UserAnswer;
use drox_types::ToolUseId;
use ratatui::Terminal;
use ratatui::backend::CrosstermBackend;
use ratatui::layout::Rect;
use serde_json::Value;
use tokio::sync::mpsc;

use crate::AppConfig;
use crate::asker::{AskCoordinator, PendingAsk, parse_answer};
use crate::engine::status_bar_snapshot::StatusBarSnapshot;
use crate::engine::{
    BindingAction, CONTEXT_CUSTOM_INDEX, CompactOutcome, EngineRuntime, TuiKeybindings,
    VimComposer, VimKeyResult, VimMode, apply_agent_event, compact_checkpoint_preview,
    cycle_preset_index,
};
use crate::slash::{
    PendingSlash, SLASH_PALETTE_ENTRIES, SlashOutcome, apply_theme, filter_entries, handle_config,
    handle_hooks, handle_plan, handle_slash,
};
use crate::terminal;
use crate::ui;
use crate::ui::TuiThemeSetting;
use crate::view::{
    ActiveBashRun, ActiveHookProgress, LogEntry, TranscriptSearchState, bash_progress,
    compute_permission_preview, find_history_match_indices, find_matching_line_indices,
    messages_to_log_entries, parse_plan_approval_preview, scroll_to_line,
};

use crate::app::state::{
    AiServerDialog, AiServerField, AiServerStep, AppPhase, AppState, ComposerMode,
    ComposerSuggestionDialog, CopyDialog, OnboardingDialog, PromptDialog, RewindChoiceView,
    RewindDialog, RunStatus, SlashPaletteDialog, ThemeDialog, WorkspaceDialog, WorkspaceField,
    WorkspaceStep,
};
use crate::engine::at_typeahead::{self, AtFileIndex};
use crate::engine::notices::{NoticeLevel, StatusNotice};
use crate::engine::preferences::{
    LlmConnectionPrefs, TuiPreferences, record_recent_workspace, resolve_llm_startup,
    save_llm_connection,
};
use crate::engine::unified_suggestions::{
    self, ComposerSuggestionItem, SkillSuggestionEntry, SuggestionKind, preserve_cursor,
};
use crate::terminal::set_terminal_title;

impl App {
    pub(super) fn open_workspace_dialog(&mut self, initial: Option<String>) {
        if self.state.phase == AppPhase::Running {
            self.state
                .push_system("Impossible pendant un run agent — annulez d'abord (Esc).");
            return;
        }
        let current = self
            .runtime
            .as_ref()
            .map(|r| r.workspace.to_string())
            .unwrap_or_else(|| self.config.workspace.to_string());
        let recents = self.tui_prefs.recent_workspaces.clone();
        self.state.workspace_dialog = Some(WorkspaceDialog::new(current, recents, initial));
        self.state.phase = AppPhase::Workspace;
        self.state.status_line =
            "/workspace — changer le répertoire de travail (Ctrl+Shift+W)".into();
    }

    pub(super) fn close_workspace_dialog(&mut self) {
        self.state.workspace_dialog = None;
        if self.state.phase == AppPhase::Workspace {
            self.state.phase = AppPhase::Idle;
        }
    }

    pub(super) fn cycle_workspace_focus(&mut self, reverse: bool) {
        let Some(dialog) = self.state.workspace_dialog.as_mut() else {
            return;
        };
        if dialog.step != WorkspaceStep::Edit {
            return;
        }
        if dialog.recents.is_empty() {
            dialog.focus = match (dialog.focus, reverse) {
                (WorkspaceField::Path, false) => WorkspaceField::ValidateButton,
                (WorkspaceField::ValidateButton, true) => WorkspaceField::Path,
                _ => WorkspaceField::Path,
            };
            return;
        }
        dialog.focus = match (dialog.focus, reverse) {
            (WorkspaceField::Recents, false) => WorkspaceField::Path,
            (WorkspaceField::Path, false) => WorkspaceField::ValidateButton,
            (WorkspaceField::ValidateButton, false) => WorkspaceField::Recents,
            (WorkspaceField::Recents, true) => WorkspaceField::ValidateButton,
            (WorkspaceField::Path, true) => WorkspaceField::Recents,
            (WorkspaceField::ValidateButton, true) => WorkspaceField::Path,
        };
    }

    pub(super) fn validate_workspace_dialog(&mut self) {
        let Some(input) = self
            .state
            .workspace_dialog
            .as_ref()
            .map(|d| d.path.trim().to_string())
        else {
            return;
        };
        if input.is_empty() {
            if let Some(dialog) = self.state.workspace_dialog.as_mut() {
                dialog.status = "Chemin requis".into();
            }
            return;
        }
        let current = self.runtime.as_ref().map(|r| r.workspace.clone());
        match crate::engine::validate_workspace_path(&input) {
            Ok(canonical) => {
                let Some(dialog) = self.state.workspace_dialog.as_mut() else {
                    return;
                };
                if current.is_some_and(|c| c == canonical) {
                    dialog.status = "Déjà le workspace courant".into();
                    dialog.validated = None;
                    return;
                }
                dialog.validated = Some(canonical);
                dialog.step = WorkspaceStep::Confirm;
                dialog.status = "Entrée pour confirmer · nouvelle session".into();
            }
            Err(e) => {
                if let Some(dialog) = self.state.workspace_dialog.as_mut() {
                    dialog.status = e;
                    dialog.validated = None;
                }
            }
        }
    }

    pub(super) fn handle_workspace_key(&mut self, key: KeyEvent) -> bool {
        let Some(dialog) = self.state.workspace_dialog.as_mut() else {
            self.state.phase = AppPhase::Idle;
            return false;
        };

        if dialog.step == WorkspaceStep::Confirm {
            match key.code {
                KeyCode::Esc => {
                    dialog.step = WorkspaceStep::Edit;
                    dialog.validated = None;
                    dialog.status =
                        "Saisissez un chemin ou choisissez un récent · Entrée sur « Vérifier »"
                            .into();
                }
                KeyCode::Enter => {
                    if let Some(path) = dialog.validated.clone() {
                        self.close_workspace_dialog();
                        self.pending_slash = Some(PendingSlash::ApplyWorkspace { path });
                    }
                }
                _ => {}
            }
            return false;
        }

        match key.code {
            KeyCode::Esc => {
                self.close_workspace_dialog();
                self.state.status_line = "Changement workspace annulé".into();
            }
            KeyCode::Tab => self.cycle_workspace_focus(false),
            KeyCode::BackTab => self.cycle_workspace_focus(true),
            KeyCode::Up => {
                if dialog.focus == WorkspaceField::Recents && dialog.recent_cursor > 0 {
                    dialog.recent_cursor -= 1;
                } else if dialog.focus == WorkspaceField::ValidateButton {
                    self.cycle_workspace_focus(true);
                }
            }
            KeyCode::Down => {
                if dialog.focus == WorkspaceField::Recents
                    && dialog.recent_cursor + 1 < dialog.recents.len()
                {
                    dialog.recent_cursor += 1;
                } else if dialog.focus != WorkspaceField::ValidateButton {
                    self.cycle_workspace_focus(false);
                }
            }
            KeyCode::Enter if dialog.focus == WorkspaceField::ValidateButton => {
                self.validate_workspace_dialog();
            }
            KeyCode::Enter if dialog.focus == WorkspaceField::Recents => {
                if let Some(path) = dialog.recents.get(dialog.recent_cursor).cloned() {
                    dialog.path = path;
                    dialog.path_cursor = dialog.path.len();
                    dialog.focus = WorkspaceField::Path;
                }
            }
            KeyCode::Enter if dialog.focus == WorkspaceField::Path => {
                self.validate_workspace_dialog();
            }
            KeyCode::Left => {
                if dialog.focus == WorkspaceField::Path && dialog.path_cursor > 0 {
                    dialog.path_cursor -= 1;
                }
            }
            KeyCode::Right => {
                if dialog.focus == WorkspaceField::Path && dialog.path_cursor < dialog.path.len() {
                    dialog.path_cursor += 1;
                }
            }
            KeyCode::Backspace => {
                if dialog.focus == WorkspaceField::Path
                    && dialog.path_cursor > 0
                    && dialog.path_cursor <= dialog.path.len()
                {
                    dialog.path.remove(dialog.path_cursor - 1);
                    dialog.path_cursor -= 1;
                }
            }
            KeyCode::Delete => {
                if dialog.focus == WorkspaceField::Path && dialog.path_cursor < dialog.path.len() {
                    dialog.path.remove(dialog.path_cursor);
                }
            }
            KeyCode::Char(c)
                if !key.modifiers.contains(KeyModifiers::CONTROL)
                    && dialog.focus == WorkspaceField::Path =>
            {
                dialog.path.insert(dialog.path_cursor, c);
                dialog.path_cursor += 1;
            }
            _ => {}
        }
        false
    }

    pub(super) async fn apply_workspace_switch(
        &mut self,
        workspace: camino::Utf8PathBuf,
    ) -> anyhow::Result<()> {
        if self.state.phase == AppPhase::Running {
            self.state
                .push_system("Impossible pendant un run agent — annulez d'abord (Esc).");
            return Ok(());
        }

        self.config.workspace = workspace.clone();
        self.config.session = None;

        env_file::load_default(Some(self.config.workspace.as_std_path()));

        let runtime = Arc::new(
            EngineRuntime::bootstrap(&self.config, Arc::clone(&self.ask))
                .await
                .context("re-bootstrap workspace")?,
        );
        self.runtime = Some(Arc::clone(&runtime));

        self.paste_store.clear();
        self.at_file_index = None;
        self.at_file_roots_key = None;
        self.message_queue.clear();
        self.state.queued_messages = 0;
        self.tool_names.clear();
        self.history_cursor = None;
        self.history_search = None;
        self.state.transcript_search = None;
        self.state.composer_suggestions = None;
        self.state.slash_palette = None;
        self.state.session_title.clear();
        self.state.composer_buffer.clear();
        self.state.clear_transcript();

        self.state
            .push_system(format!("Workspace : {}", runtime.workspace));
        if self.state.llm_configured {
            self.state.push_system(format!(
                "LLM : {} @ {}",
                self.config.model, self.config.server
            ));
        }
        self.state.push_system(format!(
            "Nouvelle session : {} ({})",
            runtime.session_id(),
            runtime.transcript_path()
        ));

        record_recent_workspace(workspace.as_str())?;
        self.tui_prefs = crate::engine::preferences::load_preferences();

        self.refresh_session_title().await;
        self.sync_terminal_title();
        self.refresh_status_snapshot().await;
        self.refresh_mcp_panel().await;
        self.load_skill_suggestions(&runtime).await;
        self.state.status_notices = runtime.collect_startup_notices(&self.config);
        if !self.state.llm_configured {
            self.state.status_notices.insert(
                0,
                StatusNotice {
                    level: NoticeLevel::Warn,
                    text: "Serveur IA non configuré — Ctrl+Shift+L ou /server : adresse Ollama, test, choix du modèle."
                        .into(),
                },
            );
        }

        self.state.status_line = format!("Workspace : {}", runtime.workspace);
        self.state.push_toast("Workspace changé · nouvelle session");
        Ok(())
    }
}
