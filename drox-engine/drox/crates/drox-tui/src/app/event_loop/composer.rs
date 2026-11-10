//! Palette slash, suggestions, vim et collage.

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
    pub(super) fn open_slash_palette(&mut self, filter: String) {
        let matches = filter_entries(&filter);
        self.state.slash_palette = Some(SlashPaletteDialog {
            filter,
            matches,
            cursor: 0,
        });
        self.state.phase = AppPhase::SlashPalette;
        self.state.status_line = "Palette slash — /".into();
    }

    pub(super) fn refilter_slash_palette(&mut self) {
        let Some(dialog) = self.state.slash_palette.as_mut() else {
            return;
        };
        dialog.matches = filter_entries(&dialog.filter);
        dialog.cursor = dialog.cursor.min(dialog.matches.len().saturating_sub(1));
    }

    pub(super) fn handle_slash_palette_key(&mut self, key: KeyEvent) -> anyhow::Result<bool> {
        let Some(dialog) = self.state.slash_palette.as_mut() else {
            self.state.phase = AppPhase::Idle;
            return Ok(false);
        };
        match key.code {
            KeyCode::Esc => {
                self.state.slash_palette = None;
                self.state.phase = AppPhase::Idle;
                self.state.status_line = "Palette slash fermee".into();
            }
            KeyCode::Up if dialog.cursor > 0 => {
                dialog.cursor -= 1;
            }
            KeyCode::Down if dialog.cursor + 1 < dialog.matches.len() => {
                dialog.cursor += 1;
            }
            KeyCode::Enter => {
                if let Some(&idx) = dialog.matches.get(dialog.cursor) {
                    let command = SLASH_PALETTE_ENTRIES[idx].command.to_string();
                    self.state.slash_palette = None;
                    self.state.phase = AppPhase::Idle;
                    return self.dispatch_slash_command(&command);
                }
            }
            KeyCode::Backspace => {
                dialog.filter.pop();
                self.refilter_slash_palette();
            }
            KeyCode::Char(c) if !key.modifiers.contains(KeyModifiers::CONTROL) => {
                dialog.filter.push(c);
                self.refilter_slash_palette();
            }
            _ => {}
        }
        Ok(false)
    }

    /// Recalcule les suggestions unifiées (`@` · `/` · skills).
    pub(super) fn refresh_composer_suggestions(&mut self) {
        if self.state.composer_mode == ComposerMode::Bash
            || self.state.phase == AppPhase::Running
            || self.history_search.is_some()
        {
            self.state.composer_suggestions = None;
            return;
        }

        let Some(rt) = self.runtime.as_ref() else {
            return;
        };

        let roots = rt.working_directories();
        let roots_key = roots
            .iter()
            .map(|r| r.as_str())
            .collect::<Vec<_>>()
            .join("\0");
        if self.at_file_roots_key.as_deref() != Some(roots_key.as_str()) {
            self.at_file_index = Some(AtFileIndex::build_roots(&roots, &rt.drox_ignore));
            self.at_file_roots_key = Some(roots_key);
        }

        let Some(mut dialog) = unified_suggestions::build_suggestions(
            &self.state.composer_buffer,
            self.at_file_index.as_ref(),
            &self.skill_suggestions,
        ) else {
            self.state.composer_suggestions = None;
            return;
        };

        dialog.cursor = preserve_cursor(self.state.composer_suggestions.as_ref(), &dialog);
        self.state.composer_suggestions = Some(dialog);
    }

    /// Tab — applique la suggestion surlignée.
    pub(super) fn apply_composer_suggestion(&mut self) {
        let Some(dialog) = self.state.composer_suggestions.clone() else {
            return;
        };
        let Some(item) = dialog.items.get(dialog.cursor) else {
            return;
        };
        self.apply_suggestion_item(item, &dialog);
        self.refresh_composer_suggestions();
    }

    pub(super) fn apply_suggestion_item(
        &mut self,
        item: &ComposerSuggestionItem,
        dialog: &ComposerSuggestionDialog,
    ) {
        match item.kind {
            SuggestionKind::File => {
                let Some(ctx) = dialog.file_ctx.as_ref() else {
                    return;
                };
                self.state.composer_buffer =
                    at_typeahead::apply_completion(&self.state.composer_buffer, ctx, &item.payload);
                self.state.status_line = format!("Référence @{} insérée", item.payload);
            }
            SuggestionKind::Slash => {
                self.state.composer_buffer = item.payload.clone();
                self.state.status_line = format!("Commande {} — Entrée pour exécuter", item.label);
            }
            SuggestionKind::Skill => {
                self.state.composer_buffer = format!("/skills {}", item.payload);
                self.state.status_line = format!("Skill {} — Entrée pour lire", item.payload);
            }
        }
    }

    pub(super) async fn load_skill_suggestions(&mut self, runtime: &EngineRuntime) {
        use drox_tools::skills::load_skills_catalog;
        self.skill_suggestions = match load_skills_catalog(&runtime.workspace).await {
            Ok(catalog) => catalog
                .into_iter()
                .map(|e| SkillSuggestionEntry {
                    name: e.name,
                    description: e.description,
                })
                .collect(),
            Err(_) => Vec::new(),
        };
    }

    /// Touches réservées quand le composer est vide (avant le handler vim).
    pub(super) fn try_composer_special_char(
        &mut self,
        c: char,
        key: &KeyEvent,
    ) -> anyhow::Result<bool> {
        if c == '!'
            && self.state.composer_mode == ComposerMode::Normal
            && self.state.composer_buffer.is_empty()
        {
            self.state.composer_mode = ComposerMode::Bash;
            self.state.status_line = "Mode bash — Entrée exécute · Esc quitte".into();
            return Ok(true);
        }
        if c == '/'
            && self.state.composer_buffer.is_empty()
            && self.keybindings.matches(BindingAction::SlashPalette, key)
        {
            self.open_slash_palette(String::new());
            return Ok(true);
        }
        if c == '?'
            && self.state.phase != AppPhase::Running
            && self.state.composer_buffer.is_empty()
        {
            self.state.composer_help = !self.state.composer_help;
            return Ok(true);
        }
        Ok(false)
    }

    pub(super) fn apply_vim_key(&mut self, key: &KeyEvent) {
        match self.vim.handle_key(key, &mut self.state.composer_buffer) {
            VimKeyResult::NotHandled => {}
            VimKeyResult::Handled {
                refresh_suggestions,
                status,
            } => {
                if refresh_suggestions {
                    self.refresh_composer_suggestions();
                }
                if let Some(s) = status {
                    self.state.status_line = s;
                }
            }
        }
    }

    /// Collage presse-papiers (mode bracketed paste crossterm).
    pub(super) fn handle_paste(&mut self, text: String) {
        if self.state.phase == AppPhase::Running
            || self.history_search.is_some()
            || self.state.composer_mode == ComposerMode::Bash
        {
            return;
        }

        // Collage vide : tenter une image clipboard (Windows — leak macOS natif plus tard).
        if text.trim().is_empty() {
            if let Some(img) = crate::engine::image_paste::read_clipboard_image() {
                let ins = self.paste_store.ingest_image(img);
                if self.vim.enabled {
                    self.vim.insert_text(&mut self.state.composer_buffer, &ins);
                } else {
                    self.state.composer_buffer.push_str(&ins);
                }
                self.refresh_composer_suggestions();
                self.state.status_line = format!("Image collée — {ins}");
            }
            return;
        }

        // Chemin fichier image collé en texte.
        if let Some(path) = crate::engine::image_paste::as_image_file_path(&text) {
            let roots = self
                .runtime
                .as_ref()
                .map(|r| r.working_directories())
                .unwrap_or_else(Vec::new);
            if let Some(img) = crate::engine::image_paste::read_image_file(&path, &roots) {
                let label = img.label.clone();
                let ins = self.paste_store.ingest_image(img);
                if self.vim.enabled {
                    self.vim.insert_text(&mut self.state.composer_buffer, &ins);
                } else {
                    self.state.composer_buffer.push_str(&ins);
                }
                self.refresh_composer_suggestions();
                self.state.status_line = format!("Image — {label} → {ins}");
                return;
            }
        }

        let insert = self.paste_store.ingest_paste(&text);
        let summary = if insert.contains("[Pasted text #") {
            format!("Collage réduit — {insert}")
        } else {
            format!("Collage ({})", text.len())
        };
        if self.vim.enabled {
            self.vim
                .insert_text(&mut self.state.composer_buffer, &insert);
        } else {
            self.state.composer_buffer.push_str(&insert);
        }
        self.refresh_composer_suggestions();
        self.state.status_line = summary;
    }
}
