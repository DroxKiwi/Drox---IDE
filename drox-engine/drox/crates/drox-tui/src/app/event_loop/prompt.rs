//! Dialogue de question utilisateur.

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
    pub(super) fn handle_prompt_key(&mut self, key: KeyEvent) -> bool {
        enum PromptAction {
            Skip,
            Answer(UserAnswer),
        }

        let action = {
            let Some(dialog) = self.state.prompt.as_mut() else {
                return false;
            };

            match key.code {
                KeyCode::Esc => Some(PromptAction::Skip),
                KeyCode::Up if !dialog.question.choices.is_empty() => {
                    dialog.choice_index = dialog.choice_index.saturating_sub(1);
                    None
                }
                KeyCode::Down if !dialog.question.choices.is_empty() => {
                    let max = dialog.question.choices.len().saturating_sub(1);
                    dialog.choice_index = (dialog.choice_index + 1).min(max);
                    None
                }
                KeyCode::Char(c)
                    if dialog.question.choices.is_empty() || dialog.question.allow_free_text =>
                {
                    dialog.buffer.push(c);
                    None
                }
                KeyCode::Backspace => {
                    dialog.buffer.pop();
                    None
                }
                KeyCode::Char('y') | KeyCode::Char('Y')
                    if dialog.question.choices.len() == 2
                        && dialog.question.choices[0].eq_ignore_ascii_case("yes") =>
                {
                    Some(PromptAction::Answer(parse_answer(
                        &dialog.question,
                        "1".into(),
                    )))
                }
                KeyCode::Char('n') | KeyCode::Char('N')
                    if dialog.question.choices.len() == 2
                        && dialog.question.choices[0].eq_ignore_ascii_case("yes") =>
                {
                    Some(PromptAction::Answer(parse_answer(
                        &dialog.question,
                        "2".into(),
                    )))
                }
                KeyCode::Enter => {
                    let question = dialog.question.clone();
                    let answer = if question.choices.is_empty() {
                        parse_answer(&question, dialog.buffer.clone())
                    } else if !dialog.buffer.is_empty() {
                        parse_answer(&question, dialog.buffer.clone())
                    } else {
                        parse_answer(&question, (dialog.choice_index + 1).to_string())
                    };
                    Some(PromptAction::Answer(answer))
                }
                _ => None,
            }
        };

        match action {
            Some(PromptAction::Skip) => self.complete_prompt(UserAnswer {
                id: self
                    .state
                    .prompt
                    .as_ref()
                    .and_then(|d| d.question.id.clone()),
                text: String::new(),
                indices: Vec::new(),
                skipped: true,
            }),
            Some(PromptAction::Answer(answer)) => self.complete_prompt(answer),
            None => {}
        }
        false
    }

    pub(super) fn complete_prompt(&mut self, answer: UserAnswer) {
        if let Some(pending) = self.pending_reply.take() {
            pending.complete(answer);
        }
        self.state.prompt = None;
        self.state.pending_ask = false;

        if self.ask.has_queued() {
            self.sync_prompt_modal();
            return;
        }

        self.state.permission_queue_waiting = 0;
        if self.state.phase == AppPhase::Prompt {
            self.state.phase = if self.agent_rx.is_some() {
                AppPhase::Running
            } else {
                AppPhase::Idle
            };
        }
        self.state.status_line = if self.agent_rx.is_some() {
            "Agent en cours…".into()
        } else {
            "Prêt".into()
        };
    }
}
