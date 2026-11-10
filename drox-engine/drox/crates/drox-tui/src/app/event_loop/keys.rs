//! Clavier global : raccourcis, composer, modales simples.

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
    pub(super) fn handle_rewind_key(&mut self, key: KeyEvent) -> bool {
        let Some(dialog) = self.state.rewind.as_mut() else {
            self.state.phase = AppPhase::Idle;
            return false;
        };
        match key.code {
            KeyCode::Esc => {
                self.state.rewind = None;
                self.state.phase = AppPhase::Idle;
                self.state.status_line = "Rembobinage annulé".into();
            }
            KeyCode::Up => {
                if dialog.cursor > 0 {
                    dialog.cursor -= 1;
                }
            }
            KeyCode::Down if dialog.cursor + 1 < dialog.choices.len() => {
                dialog.cursor += 1;
            }
            KeyCode::Enter if !dialog.choices.is_empty() => {
                let idx = dialog.choices[dialog.cursor].message_index;
                self.state.rewind = None;
                self.state.phase = AppPhase::Idle;
                self.pending_slash = Some(PendingSlash::RewindApply { message_index: idx });
            }
            _ => {}
        }
        false
    }

    pub(super) fn handle_tool_output_viewer_key(&mut self, key: KeyEvent) -> bool {
        const PAGE: usize = 18;
        if self.keybindings.matches(BindingAction::ExpandBash, &key) || key.code == KeyCode::Esc {
            self.state.scroll_viewer = None;
            self.state.status_line = "Viewer outil fermé".into();
            return false;
        }
        let Some(viewer) = self.state.scroll_viewer.as_mut() else {
            return false;
        };
        if self.keybindings.matches(BindingAction::ScrollUp, &key) {
            viewer.scroll_page(PAGE, PAGE);
        } else if self.keybindings.matches(BindingAction::ScrollDown, &key) {
            viewer.scroll_page_down(PAGE, PAGE);
        }
        false
    }

    pub(super) fn handle_copy_key(&mut self, key: KeyEvent) -> bool {
        let Some(dialog) = self.state.copy.as_mut() else {
            self.state.phase = AppPhase::Idle;
            return false;
        };
        match key.code {
            KeyCode::Esc => {
                self.state.copy = None;
                self.state.phase = AppPhase::Idle;
                self.state.status_line = "Copie annulée".into();
            }
            KeyCode::Up if dialog.cursor > 0 => {
                dialog.cursor -= 1;
            }
            KeyCode::Down if dialog.cursor + 1 < dialog.choices.len() => {
                dialog.cursor += 1;
            }
            KeyCode::Char('w') | KeyCode::Char('W') => {
                let choice = dialog.choices[dialog.cursor].clone();
                let full = dialog.full_text.clone();
                let blocks = dialog.blocks.clone();
                self.state.copy = None;
                self.state.phase = AppPhase::Idle;
                self.pending_slash = Some(PendingSlash::CopyApply {
                    full_text: full,
                    blocks,
                    choice,
                    clipboard: false,
                });
            }
            KeyCode::Enter if !dialog.choices.is_empty() => {
                let choice = dialog.choices[dialog.cursor].clone();
                let full = dialog.full_text.clone();
                let blocks = dialog.blocks.clone();
                self.state.copy = None;
                self.state.phase = AppPhase::Idle;
                self.pending_slash = Some(PendingSlash::CopyApply {
                    full_text: full,
                    blocks,
                    choice,
                    clipboard: true,
                });
            }
            _ => {}
        }
        false
    }

    pub(super) fn handle_theme_key(&mut self, key: KeyEvent) -> bool {
        let Some(dialog) = self.state.theme_dialog.as_mut() else {
            self.state.phase = AppPhase::Idle;
            return false;
        };
        match key.code {
            KeyCode::Esc => {
                self.state.theme_dialog = None;
                self.state.phase = AppPhase::Idle;
                self.state.status_line = "Sélection thème annulée".into();
            }
            KeyCode::Up if dialog.cursor > 0 => {
                dialog.cursor -= 1;
            }
            KeyCode::Down if dialog.cursor + 1 < TuiThemeSetting::ALL.len() => {
                dialog.cursor += 1;
            }
            KeyCode::Enter => {
                let theme = TuiThemeSetting::ALL[dialog.cursor];
                self.state.theme_dialog = None;
                self.state.phase = AppPhase::Idle;
                apply_theme(&mut self.state, theme);
                self.state.push_system(format!("Thème : {}", theme.label()));
                self.state.status_line = "Thème appliqué".into();
            }
            _ => {}
        }
        false
    }

    /// `true` = quitter l'application.
    pub(super) fn handle_key(&mut self, key: KeyEvent) -> anyhow::Result<bool> {
        if self.keybindings.matches(BindingAction::Quit, &key) {
            return Ok(true);
        }

        if self.keybindings.matches(BindingAction::QuitConfirm, &key) {
            return self.handle_ctrl_c();
        }

        // Raccourcis globaux (modals) — actifs sauf pendant un run agent.
        if self.state.phase != AppPhase::Running {
            if self.keybindings.matches(BindingAction::AiServer, &key) {
                self.open_ai_server_dialog();
                return Ok(false);
            }
            if self.keybindings.matches(BindingAction::Workspace, &key) {
                self.open_workspace_dialog(None);
                return Ok(false);
            }
        }

        if self.state.phase == AppPhase::Prompt {
            return Ok(self.handle_prompt_key(key));
        }

        if self.state.phase == AppPhase::Rewind {
            return Ok(self.handle_rewind_key(key));
        }
        if self.state.phase == AppPhase::Copy {
            return Ok(self.handle_copy_key(key));
        }

        if self.state.phase == AppPhase::Theme {
            return Ok(self.handle_theme_key(key));
        }

        if self.state.phase == AppPhase::SlashPalette {
            return self.handle_slash_palette_key(key);
        }

        if self.state.phase == AppPhase::Onboarding {
            return Ok(self.handle_onboarding_key(key));
        }

        if self.state.phase == AppPhase::AiServer {
            return Ok(self.handle_ai_server_key(key));
        }

        if self.state.phase == AppPhase::Workspace {
            return Ok(self.handle_workspace_key(key));
        }

        if self.state.scroll_viewer.is_some() {
            return Ok(self.handle_tool_output_viewer_key(key));
        }

        if self.state.transcript_search.is_some() {
            return Ok(self.handle_transcript_search_key(key));
        }

        if self.history_search.is_some() {
            return Ok(self.handle_history_search_key(key));
        }

        // Typeahead `@fichier` — prioritaire sur historique ↑↓ quand des candidats existent.
        if key.code == KeyCode::Esc {
            if self.vim.enabled
                && self.vim.mode == VimMode::Insert
                && self.state.phase != AppPhase::Running
                && self.state.composer_mode != ComposerMode::Bash
            {
                self.apply_vim_key(&key);
                return Ok(false);
            }
            if self.state.composer_help {
                self.state.composer_help = false;
                return Ok(false);
            }
            if self.state.scroll_viewer.is_some() {
                self.state.scroll_viewer = None;
                return Ok(false);
            }
            if self.state.composer_suggestions.is_some() {
                self.state.composer_suggestions = None;
                return Ok(false);
            }
        }

        if self
            .state
            .composer_suggestions
            .as_ref()
            .is_some_and(|s| !s.items.is_empty())
        {
            match key.code {
                KeyCode::Tab => {
                    self.apply_composer_suggestion();
                    return Ok(false);
                }
                KeyCode::Up => {
                    if let Some(s) = self.state.composer_suggestions.as_mut() {
                        if s.cursor > 0 {
                            s.cursor -= 1;
                        }
                    }
                    return Ok(false);
                }
                KeyCode::Down => {
                    if let Some(s) = self.state.composer_suggestions.as_mut() {
                        if s.cursor + 1 < s.items.len() {
                            s.cursor += 1;
                        }
                    }
                    return Ok(false);
                }
                _ => {}
            }
        }

        if self.keybindings.matches(BindingAction::CancelRun, &key)
            && self.state.phase == AppPhase::Running
        {
            self.cancel_run();
            return Ok(false);
        }

        if self
            .keybindings
            .matches(BindingAction::TranscriptSearch, &key)
        {
            if self.state.phase != AppPhase::Running && self.history_search.is_none() {
                self.start_transcript_search();
            }
        } else if self.keybindings.matches(BindingAction::HistorySearch, &key) {
            if self.state.phase != AppPhase::Running
                && self.state.transcript_search.is_none()
                && self.state.prompt.is_none()
            {
                self.toggle_history_search();
            }
        } else if self.keybindings.matches(BindingAction::CancelRun, &key) {
            if self.state.composer_mode == ComposerMode::Bash {
                if self.state.composer_buffer.is_empty() {
                    self.state.composer_mode = ComposerMode::Normal;
                    self.state.status_line = "Mode bash quitté".into();
                } else {
                    self.state.composer_buffer.clear();
                }
                return Ok(false);
            }
            return Ok(true);
        } else if self.keybindings.matches(BindingAction::HistoryUp, &key)
            && self.state.phase != AppPhase::Running
            && self.state.composer_buffer.is_empty()
        {
            self.history_prev();
        } else if self.keybindings.matches(BindingAction::HistoryDown, &key)
            && self.state.phase != AppPhase::Running
            && self.state.composer_buffer.is_empty()
        {
            self.history_next();
        } else if self.vim.enabled
            && self.state.phase != AppPhase::Running
            && matches!(
                key.code,
                KeyCode::Left | KeyCode::Right | KeyCode::Up | KeyCode::Down
            )
        {
            self.apply_vim_key(&key);
        } else if self.keybindings.matches(BindingAction::ScrollUp, &key) {
            self.auto_scroll = false;
            self.state.scroll = self.state.scroll.saturating_add(3);
        } else if self.keybindings.matches(BindingAction::ScrollDown, &key) {
            self.state.scroll = self.state.scroll.saturating_sub(3);
            if self.state.scroll == 0 {
                self.auto_scroll = true;
            }
        } else if self.keybindings.matches(BindingAction::Multiline, &key)
            && self.state.phase != AppPhase::Running
        {
            self.state.composer_mode = ComposerMode::Multiline;
            if self.vim.enabled {
                self.vim.insert_text(&mut self.state.composer_buffer, "\n");
            } else {
                self.state.composer_buffer.push('\n');
            }
        } else if self.keybindings.matches(BindingAction::Submit, &key)
            && !key.modifiers.contains(KeyModifiers::SHIFT)
            && self.state.phase != AppPhase::Running
            && self.submit_composer()?
        {
            return Ok(true);
        } else if self.keybindings.matches(BindingAction::ExpandBash, &key)
            && self.state.phase != AppPhase::Running
            && self.state.composer_buffer.is_empty()
        {
            if let Some(kind) = self.state.toggle_latest_expandable() {
                self.auto_scroll = true;
                self.state.scroll = 0;
                self.state.status_line = format!("Affichage {kind} basculé (e)");
            }
        } else if key.code == KeyCode::Char('y')
            && !key.modifiers.contains(KeyModifiers::CONTROL)
            && !self.vim.enabled
            && self.state.composer_buffer.is_empty()
            && self.state.phase == AppPhase::Idle
        {
            use crate::engine::copy_cmd::{collect_recent_assistant_texts, try_copy_clipboard};
            if let Some(text) = collect_recent_assistant_texts(&self.state.entries).first() {
                if try_copy_clipboard(text) {
                    self.state.push_toast("Réponse assistant copiée");
                } else {
                    self.state
                        .push_system("Presse-papiers indisponible — utilisez /copy");
                }
            } else {
                self.state.push_system("Aucune réponse assistant à copier.");
            }
        } else if let KeyCode::Char(c) = key.code {
            if self.state.phase != AppPhase::Running {
                if self.try_composer_special_char(c, &key)? {
                    return Ok(false);
                }
                if self.vim.enabled {
                    self.apply_vim_key(&key);
                    return Ok(false);
                }
                if !key.modifiers.contains(KeyModifiers::CONTROL) {
                    self.state.composer_buffer.push(c);
                    self.refresh_composer_suggestions();
                }
            }
        } else if key.code == KeyCode::Backspace && self.state.phase != AppPhase::Running {
            if self.vim.enabled {
                self.apply_vim_key(&key);
            } else {
                self.state.composer_buffer.pop();
                self.refresh_composer_suggestions();
            }
        }

        Ok(false)
    }

    pub(super) fn handle_ctrl_c(&mut self) -> anyhow::Result<bool> {
        let now = Instant::now();
        if self
            .last_ctrl_c
            .is_some_and(|t| now.duration_since(t) < Duration::from_secs(2))
        {
            self.ctrl_c_streak += 1;
        } else {
            self.ctrl_c_streak = 1;
        }
        self.last_ctrl_c = Some(now);

        if self.state.phase == AppPhase::Running {
            self.cancel_run();
            self.state.status_line = "Run annulé (Ctrl+C)".into();
            return Ok(false);
        }

        if self.ctrl_c_streak >= 2 {
            return Ok(true);
        }
        self.state.status_line = "Ctrl+C encore pour quitter".into();
        Ok(false)
    }

    pub(super) fn submit_composer(&mut self) -> anyhow::Result<bool> {
        self.state.composer_suggestions = None;
        self.state.composer_help = false;
        let mode = self.state.composer_mode;
        let raw = self.state.composer_buffer.trim().to_string();
        if raw.is_empty() {
            if mode == ComposerMode::Bash {
                self.state.composer_mode = ComposerMode::Normal;
                self.state.status_line = "Mode bash quitté".into();
            }
            return Ok(false);
        }

        if mode == ComposerMode::Bash {
            self.state.composer_buffer.clear();
            self.state.composer_mode = ComposerMode::Normal;
            self.history_cursor = None;
            if self.input_history.last().map(String::as_str) != Some(raw.as_str()) {
                self.input_history.push(raw.clone());
            }
            self.pending_slash = Some(PendingSlash::BashExec { command: raw });
            return Ok(false);
        }

        if let Some(stripped) = raw.strip_prefix('!') {
            let cmd = stripped.trim();
            self.state.composer_buffer.clear();
            self.state.composer_mode = ComposerMode::Normal;
            self.history_cursor = None;
            if cmd.is_empty() {
                self.state.composer_mode = ComposerMode::Bash;
                self.state.status_line = "Mode bash — commande sans agent".into();
                return Ok(false);
            }
            if self.input_history.last().map(String::as_str) != Some(cmd) {
                self.input_history.push(cmd.to_string());
            }
            self.pending_slash = Some(PendingSlash::BashExec {
                command: cmd.to_string(),
            });
            return Ok(false);
        }

        self.state.composer_buffer.clear();
        self.state.composer_mode = ComposerMode::Normal;
        self.vim.sync_cursor_end(&self.state.composer_buffer);
        self.history_cursor = None;
        if self.input_history.last().map(String::as_str) != Some(raw.as_str()) {
            self.input_history.push(raw.clone());
        }

        let runtime = self
            .runtime
            .as_ref()
            .context("moteur non initialisé")?
            .clone();

        let outcome = handle_slash(&raw, &mut self.state, &runtime);
        self.apply_slash_outcome(outcome, &runtime)
    }
}
