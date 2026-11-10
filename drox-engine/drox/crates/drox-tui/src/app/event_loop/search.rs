//! Historique du composer et recherche dans le transcript.

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
    pub(super) fn history_prev(&mut self) {
        if self.input_history.is_empty() {
            return;
        }
        let len = self.input_history.len();
        let idx = match self.history_cursor {
            Some(i) => i.saturating_sub(1),
            None => len - 1,
        };
        self.history_cursor = Some(idx);
        self.state.composer_buffer = self.input_history[idx].clone();
        self.vim.sync_cursor_end(&self.state.composer_buffer);
    }

    pub(super) fn history_next(&mut self) {
        let Some(cur) = self.history_cursor else {
            return;
        };
        if cur + 1 >= self.input_history.len() {
            self.history_cursor = None;
            self.state.composer_buffer.clear();
            self.vim.sync_cursor_end(&self.state.composer_buffer);
        } else {
            let next = cur + 1;
            self.history_cursor = Some(next);
            self.state.composer_buffer = self.input_history[next].clone();
            self.vim.sync_cursor_end(&self.state.composer_buffer);
        }
    }

    pub(super) fn start_transcript_search(&mut self) {
        let lines = self.state.flattened_log_lines();
        let query = self.last_transcript_query.clone();
        let match_lines = find_matching_line_indices(&lines, &query);
        let search = TranscriptSearchState::new(query, match_lines);
        if let Some(line_idx) = search.current_line_index() {
            let inner_h = 20usize;
            self.auto_scroll = false;
            self.state.scroll = scroll_to_line(lines.len(), inner_h, line_idx);
        }
        self.state.transcript_search = Some(search);
        self.state.status_line = "Recherche transcript (Ctrl+F)".into();
    }

    pub(super) fn refresh_transcript_search(&mut self) {
        let query = self
            .state
            .transcript_search
            .as_ref()
            .map(|s| s.query.clone())
            .unwrap_or_default();
        let lines = self.state.flattened_log_lines();
        let match_lines = find_matching_line_indices(&lines, &query);
        let Some(search) = self.state.transcript_search.as_mut() else {
            return;
        };
        search.match_lines = match_lines;
        search.current = 0;
        if let Some(line_idx) = search.current_line_index() {
            self.auto_scroll = false;
            self.state.scroll = scroll_to_line(lines.len(), 20, line_idx);
        }
    }

    pub(super) fn focus_transcript_match(&mut self) {
        let Some(search) = self.state.transcript_search.as_ref() else {
            return;
        };
        let Some(line_idx) = search.current_line_index() else {
            return;
        };
        let total = self.state.flattened_log_lines().len();
        self.auto_scroll = false;
        self.state.scroll = scroll_to_line(total, 20, line_idx);
    }

    pub(super) fn close_transcript_search(&mut self, keep_query: bool) {
        if let Some(search) = self.state.transcript_search.take() {
            if keep_query {
                self.last_transcript_query = search.query;
            }
        }
        self.state.status_line = "Recherche fermée".into();
    }

    pub(super) fn handle_transcript_search_key(&mut self, key: KeyEvent) -> bool {
        if self.keybindings.matches(BindingAction::CancelRun, &key) {
            self.close_transcript_search(false);
        } else if self.keybindings.matches(BindingAction::Submit, &key)
            && !key.modifiers.contains(KeyModifiers::SHIFT)
        {
            self.close_transcript_search(true);
        } else if self.keybindings.matches(BindingAction::SearchNext, &key) {
            if let Some(search) = self.state.transcript_search.as_mut() {
                search.next_match();
            }
            self.focus_transcript_match();
        } else if self.keybindings.matches(BindingAction::SearchPrev, &key) {
            if let Some(search) = self.state.transcript_search.as_mut() {
                search.prev_match();
            }
            self.focus_transcript_match();
        } else if key.code == KeyCode::Backspace {
            if let Some(search) = self.state.transcript_search.as_mut() {
                search.query.pop();
                self.refresh_transcript_search();
            }
        } else if let KeyCode::Char(c) = key.code {
            if !key.modifiers.contains(KeyModifiers::CONTROL) {
                if let Some(search) = self.state.transcript_search.as_mut() {
                    search.query.push(c);
                    self.refresh_transcript_search();
                }
            }
        }
        false
    }

    pub(super) fn toggle_history_search(&mut self) {
        self.history_search = Some(crate::view::HistorySearchState {
            query: String::new(),
            saved_buffer: self.state.composer_buffer.clone(),
            saved_history_cursor: self.history_cursor,
            match_indices: Vec::new(),
            current: 0,
        });
        self.state.status_line = "Recherche historique (Ctrl+R)".into();
    }

    pub(super) fn refresh_history_search(&mut self) {
        let Some(search) = self.history_search.as_mut() else {
            return;
        };
        search.match_indices = find_history_match_indices(&self.input_history, &search.query);
        search.current = 0;
        if let Some(idx) = search.current_history_index() {
            self.state.composer_buffer = self.input_history[idx].clone();
            self.history_cursor = Some(idx);
        } else if search.query.is_empty() {
            self.state.composer_buffer = search.saved_buffer.clone();
            self.history_cursor = search.saved_history_cursor;
        }
    }

    pub(super) fn handle_history_search_key(&mut self, key: KeyEvent) -> bool {
        let ctrl = key.modifiers.contains(KeyModifiers::CONTROL);
        match key.code {
            KeyCode::Esc => {
                if let Some(search) = self.history_search.take() {
                    self.state.composer_buffer = search.saved_buffer;
                    self.history_cursor = search.saved_history_cursor;
                }
                self.state.status_line = "Recherche historique annulée".into();
            }
            KeyCode::Enter => {
                self.history_search = None;
                self.state.status_line = "Historique accepté".into();
            }
            KeyCode::Char('r') if ctrl => {
                if let Some(search) = self.history_search.as_mut() {
                    search.next_match();
                    if let Some(idx) = search.current_history_index() {
                        self.state.composer_buffer = self.input_history[idx].clone();
                        self.history_cursor = Some(idx);
                    }
                }
            }
            KeyCode::Backspace => {
                if let Some(search) = self.history_search.as_mut() {
                    if search.query.is_empty() {
                        if let Some(saved) = self.history_search.take() {
                            self.state.composer_buffer = saved.saved_buffer;
                            self.history_cursor = saved.saved_history_cursor;
                            self.state.status_line = "Recherche historique annulée".into();
                        }
                    } else {
                        search.query.pop();
                        self.refresh_history_search();
                    }
                }
            }
            KeyCode::Char(c) if !ctrl => {
                if let Some(search) = self.history_search.as_mut() {
                    search.query.push(c);
                    self.refresh_history_search();
                }
            }
            _ => {}
        }
        false
    }
}
