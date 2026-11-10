//! Premier lancement.

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
    pub(super) fn finish_onboarding(&mut self) {
        self.state.onboarding = None;
        self.state.phase = AppPhase::Idle;
        let _ = crate::engine::preferences::mark_onboarding_done();
        self.state
            .push_toast("Onboarding terminé — /onboarding pour revoir");
    }

    pub(super) fn handle_onboarding_key(&mut self, key: KeyEvent) -> bool {
        const STEPS: usize = 9;
        match key.code {
            KeyCode::Esc => {
                self.finish_onboarding();
            }
            KeyCode::Enter => {
                if let Some(ref mut d) = self.state.onboarding {
                    if d.step + 1 >= STEPS {
                        self.finish_onboarding();
                    } else {
                        d.step += 1;
                    }
                }
            }
            _ => {}
        }
        false
    }
}
