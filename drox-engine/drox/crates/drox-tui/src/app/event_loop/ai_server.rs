//! Dialogue serveur IA.

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
    pub(super) fn open_ai_server_dialog(&mut self) {
        if self.state.phase == AppPhase::Running {
            self.state
                .push_system("Impossible pendant un run agent — annulez d'abord (Esc).");
            return;
        }
        let api_key = self.config.api_key.clone().unwrap_or_default();
        self.state.ai_server = Some(AiServerDialog::from_current(
            self.config.server.clone(),
            api_key,
            self.config.num_ctx,
        ));
        self.state.phase = AppPhase::AiServer;
        self.state.status_line = "/server — connexion IA (Ctrl+Shift+L)".into();
    }

    pub(super) fn close_ai_server_dialog(&mut self) {
        self.state.ai_server = None;
        self.ai_server_test_rx = None;
        self.state.phase = AppPhase::Idle;
    }

    pub(super) fn cycle_ai_server_focus(&mut self, reverse: bool) {
        let Some(dialog) = self.state.ai_server.as_mut() else {
            return;
        };
        if dialog.step != AiServerStep::Configure {
            return;
        }
        dialog.focus = match (dialog.focus, reverse) {
            (AiServerField::Server, false) => AiServerField::ApiKey,
            (AiServerField::ApiKey, false) => AiServerField::NumCtx,
            (AiServerField::NumCtx, false) => AiServerField::TestButton,
            (AiServerField::TestButton, false) => AiServerField::Server,
            (AiServerField::Server, true) => AiServerField::TestButton,
            (AiServerField::TestButton, true) => AiServerField::NumCtx,
            (AiServerField::NumCtx, true) => AiServerField::ApiKey,
            (AiServerField::ApiKey, true) => AiServerField::Server,
        };
    }

    pub(super) fn cycle_ai_server_context_preset(&mut self, reverse: bool) {
        let Some(dialog) = self.state.ai_server.as_mut() else {
            return;
        };
        dialog.context_preset_index = cycle_preset_index(dialog.context_preset_index, reverse);
    }

    pub(super) fn start_ai_server_test(&mut self) {
        let Some(dialog) = self.state.ai_server.as_mut() else {
            return;
        };
        if dialog.step == AiServerStep::Testing {
            return;
        }
        let server = dialog.server.trim().to_string();
        if server.is_empty() {
            dialog.status = "Adresse serveur requise".into();
            return;
        }
        if let Err(e) = dialog.resolved_num_ctx() {
            dialog.status = e;
            dialog.focus = AiServerField::NumCtx;
            return;
        }
        let api_key = dialog.api_key.clone();
        dialog.step = AiServerStep::Testing;
        dialog.status = "Test de connexion en cours…".into();

        let (tx, rx) = mpsc::channel(1);
        self.ai_server_test_rx = Some(rx);
        tokio::spawn(async move {
            let api = if api_key.trim().is_empty() {
                None
            } else {
                Some(api_key.as_str())
            };
            let result = crate::engine::probe_ollama(&server, api)
                .await
                .map_err(|e| e.to_string());
            let _ = tx.send(result).await;
        });
    }

    pub(super) fn poll_ai_server_test(&mut self) {
        let Some(rx) = self.ai_server_test_rx.as_mut() else {
            return;
        };
        let Ok(result) = rx.try_recv() else {
            return;
        };
        self.ai_server_test_rx = None;
        let Some(dialog) = self.state.ai_server.as_mut() else {
            return;
        };
        match result {
            Ok(models) if models.is_empty() => {
                dialog.step = AiServerStep::Configure;
                dialog.status = "Serveur joignable mais aucun modèle listé (ollama pull …)".into();
            }
            Ok(models) => {
                let current = self.config.model.clone();
                dialog.model_cursor = models.iter().position(|m| m == &current).unwrap_or(0);
                dialog.models = models;
                dialog.step = AiServerStep::SelectModel;
                dialog.status = format!("Connexion OK — {} modèle(s)", dialog.models.len());
            }
            Err(err) => {
                dialog.step = AiServerStep::Configure;
                dialog.status = format!("Connexion échouée : {err}");
            }
        }
    }

    pub(super) async fn apply_ai_server_model(&mut self, index: usize) -> anyhow::Result<()> {
        let (model, server, api_key, num_ctx) = {
            let dialog = self
                .state
                .ai_server
                .as_ref()
                .context("dialogue connexion IA")?;
            let model = dialog
                .models
                .get(index)
                .context("index modele invalide")?
                .clone();
            let server = dialog.server.trim().to_string();
            let api_key = if dialog.api_key.trim().is_empty() {
                None
            } else {
                Some(dialog.api_key.trim().to_string())
            };
            let num_ctx = dialog.resolved_num_ctx().map_err(anyhow::Error::msg)?;
            (model, server, api_key, num_ctx)
        };

        let runtime = self.runtime.as_ref().context("moteur non initialisé")?;
        runtime.apply_llm_connection(&server, &model, api_key.as_deref(), num_ctx)?;

        self.config.server = server.clone();
        self.config.model = model.clone();
        self.config.api_key = api_key.clone();
        self.config.num_ctx = num_ctx;

        let prefs = LlmConnectionPrefs {
            engine: crate::engine::LlmEngineKind::Ollama,
            server: server.clone(),
            api_key,
            model: model.clone(),
            num_ctx,
        };
        save_llm_connection(&prefs)?;
        self.tui_prefs.llm_connection = Some(prefs);
        self.state.llm_configured = true;

        self.close_ai_server_dialog();
        self.state.push_system(format!(
            "Connexion IA : Ollama @ {server} — modele `{model}` — context {num_ctx} tokens"
        ));
        self.refresh_status_snapshot().await;
        self.state.status_line = "Connexion IA enregistrée".into();

        if !self.tui_prefs.onboarding_done {
            self.state.onboarding = Some(OnboardingDialog::default());
            self.state.phase = AppPhase::Onboarding;
        }
        Ok(())
    }

    pub(super) fn handle_ai_server_key(&mut self, key: KeyEvent) -> bool {
        let Some(dialog) = self.state.ai_server.as_mut() else {
            self.state.phase = AppPhase::Idle;
            return false;
        };

        if dialog.step == AiServerStep::Testing {
            if key.code == KeyCode::Esc {
                self.close_ai_server_dialog();
                self.state.status_line = "Test connexion annulé".into();
            }
            return false;
        }

        match dialog.step {
            AiServerStep::SelectModel => match key.code {
                KeyCode::Esc => {
                    dialog.step = AiServerStep::Configure;
                    dialog.status = "Retour à la configuration".into();
                }
                KeyCode::Up if dialog.model_cursor > 0 => {
                    dialog.model_cursor -= 1;
                }
                KeyCode::Down if dialog.model_cursor + 1 < dialog.models.len() => {
                    dialog.model_cursor += 1;
                }
                KeyCode::Enter => {
                    let idx = dialog.model_cursor;
                    self.pending_slash = Some(PendingSlash::ApplyAiServer { index: idx });
                }
                _ => {}
            },
            AiServerStep::Configure => match key.code {
                KeyCode::Esc => {
                    self.close_ai_server_dialog();
                    self.state.status_line = "Connexion IA annulée".into();
                }
                KeyCode::Tab => {
                    self.cycle_ai_server_focus(key.modifiers.contains(KeyModifiers::SHIFT));
                }
                KeyCode::BackTab => {
                    self.cycle_ai_server_focus(true);
                }
                KeyCode::Up => {
                    if dialog.focus == AiServerField::NumCtx {
                        self.cycle_ai_server_context_preset(true);
                    } else {
                        self.cycle_ai_server_focus(true);
                    }
                }
                KeyCode::Down => {
                    if dialog.focus == AiServerField::NumCtx {
                        self.cycle_ai_server_context_preset(false);
                    } else {
                        self.cycle_ai_server_focus(false);
                    }
                }
                KeyCode::Enter if dialog.focus == AiServerField::TestButton => {
                    self.start_ai_server_test();
                }
                KeyCode::Enter if dialog.focus == AiServerField::Server => {
                    dialog.focus = AiServerField::ApiKey;
                }
                KeyCode::Enter if dialog.focus == AiServerField::ApiKey => {
                    dialog.focus = AiServerField::NumCtx;
                }
                KeyCode::Enter if dialog.focus == AiServerField::NumCtx => {
                    dialog.focus = AiServerField::TestButton;
                }
                KeyCode::Left => {
                    if dialog.focus == AiServerField::NumCtx
                        && dialog.context_preset_index != CONTEXT_CUSTOM_INDEX
                    {
                        self.cycle_ai_server_context_preset(true);
                    } else if dialog.focus != AiServerField::TestButton {
                        let (buf, cur) = dialog.active_buffer_and_cursor();
                        if *cur > 0 {
                            *cur -= 1;
                        }
                        let _ = buf;
                    }
                }
                KeyCode::Right => {
                    if dialog.focus == AiServerField::NumCtx
                        && dialog.context_preset_index != CONTEXT_CUSTOM_INDEX
                    {
                        self.cycle_ai_server_context_preset(false);
                    } else if dialog.focus != AiServerField::TestButton {
                        let (buf, cur) = dialog.active_buffer_and_cursor();
                        if *cur < buf.len() {
                            *cur += 1;
                        }
                    }
                }
                KeyCode::Backspace => {
                    if dialog.focus != AiServerField::TestButton {
                        let (buf, cur) = dialog.active_buffer_and_cursor();
                        if *cur > 0 && *cur <= buf.len() {
                            buf.remove(*cur - 1);
                            *cur -= 1;
                        }
                    }
                }
                KeyCode::Delete => {
                    if dialog.focus != AiServerField::TestButton {
                        let (buf, cur) = dialog.active_buffer_and_cursor();
                        if *cur < buf.len() {
                            buf.remove(*cur);
                        }
                    }
                }
                KeyCode::Char(c)
                    if !key.modifiers.contains(KeyModifiers::CONTROL)
                        && dialog.focus != AiServerField::TestButton =>
                {
                    if dialog.focus == AiServerField::NumCtx
                        && dialog.context_preset_index != CONTEXT_CUSTOM_INDEX
                    {
                        dialog.context_preset_index = CONTEXT_CUSTOM_INDEX;
                        dialog.context_custom.clear();
                        dialog.context_custom_cursor = 0;
                    }
                    let (buf, cur) = dialog.active_buffer_and_cursor();
                    buf.insert(*cur, c);
                    *cur += 1;
                }
                _ => {}
            },
            AiServerStep::Testing => {}
        }
        false
    }
}
