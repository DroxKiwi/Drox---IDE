//! Boucle principale, runs agent et sessions.

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
    /// Lance la boucle jusqu'à quit explicite.
    pub async fn run(&mut self) -> anyhow::Result<()> {
        env_file::load_default(Some(self.config.workspace.as_std_path()));

        let llm_configured = resolve_llm_startup(&mut self.config, &self.tui_prefs);
        self.state.llm_configured = llm_configured;

        let _guard = terminal::setup().context("échec initialisation terminal")?;
        let mut stdout = io::stdout();
        let backend = CrosstermBackend::new(&mut stdout);
        let mut term = Terminal::new(backend).context("création terminal ratatui")?;

        let runtime = Arc::new(
            EngineRuntime::bootstrap(&self.config, Arc::clone(&self.ask))
                .await
                .context("bootstrap moteur")?,
        );
        self.runtime = Some(Arc::clone(&runtime));
        self.state
            .push_system(format!("Workspace : {}", runtime.workspace));
        if llm_configured {
            self.state.push_system(format!(
                "LLM : {} @ {}",
                self.config.model, self.config.server
            ));
        } else {
            self.state.push_system(
                "Serveur IA non configuré — Ctrl+Shift+L ou /server pour connecter Ollama et choisir un modèle.",
            );
        }
        self.state.push_system(format!(
            "Session : {} ({})",
            runtime.session_id(),
            runtime.transcript_path()
        ));
        self.hydrate_transcript_ui(true).await?;
        self.refresh_session_title().await;
        self.sync_terminal_title();
        self.refresh_status_snapshot().await;
        self.refresh_mcp_panel().await;
        self.state.status_notices = runtime.collect_startup_notices(&self.config);
        if !llm_configured {
            self.state.status_notices.insert(
                0,
                StatusNotice {
                    level: NoticeLevel::Warn,
                    text: "Serveur IA non configuré — Ctrl+Shift+L ou /server : adresse Ollama, test, choix du modèle."
                        .into(),
                },
            );
            self.state.status_line = "Ctrl+Shift+L — configurer le serveur IA (Ollama)".into();
        }
        self.load_skill_suggestions(&runtime).await;

        let prefs = crate::engine::preferences::load_preferences();
        if !llm_configured {
            self.open_ai_server_dialog();
            self.state
                .push_toast("Configurez Ollama pour envoyer des messages à l'agent");
        } else if !prefs.onboarding_done {
            self.state.onboarding = Some(OnboardingDialog::default());
            self.state.phase = AppPhase::Onboarding;
        }

        loop {
            if self.pending_hydrate {
                self.pending_hydrate = false;
                self.hydrate_transcript_ui(true).await?;
                self.refresh_session_title().await;
            }
            if self.pending_title_refresh {
                self.pending_title_refresh = false;
                self.refresh_session_title().await;
            }
            if let Some(cmd) = self.pending_slash.take() {
                self.execute_slash(cmd).await?;
            }
            if self.status_tick == 0 {
                self.refresh_status_snapshot().await;
                if self.keybindings.reload_if_changed() {
                    self.state.status_line =
                        format!("Keybindings rechargés : {}", self.keybindings.path());
                }
            }
            self.status_tick = self.status_tick.wrapping_add(1);
            if self.status_tick >= 25 {
                self.status_tick = 0;
            }
            self.state.ui_frame_tick = self.state.ui_frame_tick.wrapping_add(1);
            self.state.clear_expired_toast();
            if let Some(ref bash) = self.state.active_bash {
                self.state.status_line = bash_progress::status_hint(bash);
            }
            self.poll_agent_events();
            self.poll_ai_server_test();
            self.sync_prompt_modal();

            let model = if self.state.llm_configured {
                self.config.model.clone()
            } else {
                "IA non configurée".into()
            };
            let (model, workspace, permission_mode, plan_mode) = {
                let rt = self.runtime.as_ref().unwrap();
                (
                    model,
                    rt.workspace.to_string(),
                    rt.permission_mode().short_title().to_string(),
                    rt.plan_mode(),
                )
            };

            term.draw(|f| {
                ui::draw(
                    f,
                    &mut self.state,
                    self.history_search.as_ref(),
                    &self.status_snapshot,
                    &model,
                    &workspace,
                    &permission_mode,
                    plan_mode,
                    &self.vim,
                )
            })
            .context("rendu frame TUI")?;

            if event::poll(Duration::from_millis(80)).context("poll événements")? {
                match event::read().context("lecture événement")? {
                    Event::Key(key) => {
                        // Windows émet Press + Release pour chaque touche ; ignorer Release.
                        if !matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat) {
                            continue;
                        }
                        if self.handle_key(key)? {
                            break;
                        }
                    }
                    Event::Paste(text) => {
                        self.handle_paste(text);
                    }
                    Event::Resize(w, h) => {
                        term.resize(Rect::new(0, 0, w, h))
                            .context("resize terminal")?;
                    }
                    _ => {}
                }
            }
        }

        Ok(())
    }

    pub(super) fn poll_agent_events(&mut self) {
        let batch: Vec<_> = {
            let Some(rx) = self.agent_rx.as_mut() else {
                return;
            };
            let mut batch = Vec::new();
            while let Ok(event) = rx.try_recv() {
                batch.push(event);
            }
            batch
        };

        if !batch.is_empty() {
            self.status_tick = 0;
        }

        for event in batch {
            match event {
                Ok(ev) => {
                    let is_stop = matches!(ev, AgentEvent::Stop { .. });
                    if let AgentEvent::PhaseEnter { phase } = &ev {
                        self.state.active_phase = Some(*phase);
                    }
                    if let AgentEvent::ToolStart {
                        id,
                        name,
                        arguments,
                    } = &ev
                    {
                        if name == "bash" {
                            self.state.active_bash =
                                ActiveBashRun::from_tool_start(id.clone(), arguments);
                        }
                    }
                    if let AgentEvent::ToolProgress {
                        id,
                        name,
                        output,
                        total_lines,
                        ..
                    } = &ev
                    {
                        if name == "bash" {
                            if let Some(bash) = self.state.active_bash.as_mut() {
                                if bash.id == *id {
                                    bash.apply_progress(output, *total_lines);
                                }
                            }
                        }
                    }
                    if let AgentEvent::HookProgress {
                        tool_use_id,
                        hook_event,
                        in_progress,
                    } = &ev
                    {
                        self.state.hook_progress = ActiveHookProgress::from_event(
                            tool_use_id.clone(),
                            hook_event.clone(),
                            *in_progress,
                        );
                    }
                    apply_agent_event(
                        &mut self.state.entries,
                        &mut self.state.streaming,
                        &mut self.tool_names,
                        &ev,
                    );
                    if matches!(ev, AgentEvent::PhaseClose) {
                        self.state.active_phase = None;
                        self.state.auto_collapse_internal_reasoning();
                    }
                    if let AgentEvent::ToolFinish {
                        id,
                        output,
                        is_error,
                        ..
                    } = &ev
                    {
                        if self.state.active_bash.as_ref().is_some_and(|b| b.id == *id) {
                            self.state.active_bash = None;
                        }
                        if !is_error {
                            if let Some(name) = self.tool_names.get(id) {
                                match name.as_str() {
                                    "todo_write" => self.state.apply_todo_output(output),
                                    "course_plan_write" => {
                                        self.state.apply_course_plan_output(output)
                                    }
                                    "exit_plan_mode" => {
                                        if let (Some(accepted), Some(response)) = (
                                            output.get("accepted").and_then(Value::as_bool),
                                            output.get("user_response").and_then(Value::as_str),
                                        ) {
                                            self.state.push_entry(LogEntry::PlanApproval {
                                                accepted,
                                                response: response.to_string(),
                                            });
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                    if let Some(rt) = self.runtime.as_ref() {
                        rt.record_ui_stats_event(&ev);
                    }
                    if self.auto_scroll {
                        self.state.scroll = 0;
                    }
                    if is_stop {
                        self.finish_run(RunStatus::Completed);
                    }
                }
                Err(e) => {
                    if let Some(view) = crate::view::api_error::ApiErrorView::from_engine(&e) {
                        self.state.push_entry(crate::view::LogEntry::ApiError(view));
                    } else {
                        self.state.push_entry(crate::view::LogEntry::Error {
                            text: e.to_string(),
                        });
                    }
                    self.finish_run(RunStatus::Error);
                }
            }
        }
    }

    pub(super) fn sync_prompt_modal(&mut self) {
        if self.state.prompt.is_some() || self.pending_reply.is_some() {
            return;
        }
        if !self.ask.has_queued() {
            self.state.permission_queue_waiting = 0;
            return;
        }
        let Some(pending) = self.ask.take_next() else {
            self.state.permission_queue_waiting = 0;
            return;
        };
        self.state.permission_queue_waiting = self.ask.queued_count();
        let file_preview = self.runtime.as_ref().and_then(|rt| {
            compute_permission_preview(&rt.workspace, &pending.question.prompt)
                .or_else(|| parse_plan_approval_preview(&pending.question.prompt))
        });
        let dialog = PromptDialog {
            question: pending.question.clone(),
            buffer: String::new(),
            choice_index: 0,
            file_preview,
        };
        self.state.phase = AppPhase::Prompt;
        self.state.pending_ask = true;
        self.state.prompt = Some(dialog);
        self.pending_reply = Some(pending);
        self.state.status_line = if self.state.permission_queue_waiting > 0 {
            format!(
                "Réponse requise (+{} en attente)",
                self.state.permission_queue_waiting
            )
        } else {
            "Réponse requise".into()
        };
    }

    pub(super) fn finish_run(&mut self, status: RunStatus) {
        match status {
            RunStatus::Cancelled => {
                if let Some(handle) = self.agent_handle.take() {
                    handle.abort();
                }
            }
            _ => {
                self.agent_handle.take();
            }
        }
        self.agent_rx = None;
        self.state.phase = AppPhase::Idle;
        self.state.streaming = None;
        self.state.active_bash = None;
        self.state.hook_progress = None;
        self.state.scroll_viewer = None;
        self.state.run_started = None;
        self.state.active_phase = None;
        self.state.last_run = status;
        self.state.status_line = match status {
            RunStatus::Completed => "Prêt".into(),
            RunStatus::Cancelled => "Annulé".into(),
            RunStatus::Error => "Erreur — prêt".into(),
            RunStatus::None => "Prêt".into(),
        };
        self.drain_message_queue();
    }

    pub(super) fn cancel_run(&mut self) {
        if self.state.phase != AppPhase::Running {
            return;
        }
        if let Some(handle) = self.agent_handle.take() {
            handle.abort();
        }
        self.agent_rx = None;
        if let Some(buf) = self.state.streaming.take() {
            if !buf.trim().is_empty() {
                self.state
                    .push_entry(crate::view::LogEntry::Assistant { text: buf });
            }
        }
        self.state.push_entry(crate::view::LogEntry::RunCancelled {
            reason: "Esc / Ctrl+C".into(),
        });
        self.finish_run(RunStatus::Cancelled);
    }

    pub(super) fn drain_message_queue(&mut self) {
        self.state.queued_messages = self.message_queue.len();
        if self.state.phase != AppPhase::Idle || self.agent_rx.is_some() {
            return;
        }
        if let Some(next) = self.message_queue.pop_front() {
            self.state.queued_messages = self.message_queue.len();
            if let Err(e) = self.start_run(next) {
                self.state
                    .push_system(format!("Erreur lancement file : {e}"));
            }
        }
    }

    pub(super) fn enqueue_or_run(&mut self, raw: String) -> anyhow::Result<()> {
        if self.state.phase == AppPhase::Running {
            self.message_queue.push_back(raw);
            self.state.queued_messages = self.message_queue.len();
            self.state.push_system(format!(
                "Message en file ({}) — exécution après le run courant",
                self.state.queued_messages
            ));
            return Ok(());
        }
        self.start_run(raw)
    }

    pub(super) fn start_run(&mut self, prompt: String) -> anyhow::Result<()> {
        if !self.state.llm_configured {
            self.state.push_system(
                "Serveur IA non configuré — Ctrl+Shift+L ou /server avant d'envoyer un message.",
            );
            self.open_ai_server_dialog();
            return Ok(());
        }
        let runtime = self
            .runtime
            .as_ref()
            .context("moteur non initialisé")?
            .clone();

        // Expansion paste + `@fichier` : le fil affiche le texte saisi, l'agent reçoit le contenu complet.
        let roots = runtime.working_directories();
        let prepared = crate::engine::prepare_user_prompt(
            &mut self.paste_store,
            &prompt,
            &roots,
            &runtime.drox_ignore,
        );
        for note in &prepared.notes {
            self.state.push_system(note.clone());
        }
        let user_blocks = prepared.user_blocks;

        self.state.push_user(prompt);
        self.state.phase = AppPhase::Running;
        self.state.run_started = Some(Instant::now());
        self.state.active_phase = None;
        self.state.last_run = RunStatus::None;
        self.state.status_line = "Agent en cours…".into();
        self.auto_scroll = true;
        self.state.scroll = 0;

        let (tx, rx) = mpsc::channel(64);
        self.agent_rx = Some(rx);
        let handle = runtime.spawn_run(user_blocks, Arc::clone(&self.ask), tx);
        self.agent_handle = Some(handle);
        Ok(())
    }

    pub(super) fn new_session(&mut self) -> anyhow::Result<()> {
        if self.state.phase == AppPhase::Running {
            self.state
                .push_system("Impossible : un run est en cours. Annulez d'abord (Esc).");
            return Ok(());
        }
        let runtime = self.runtime.as_ref().context("moteur non initialisé")?;
        runtime.rotate_session();
        self.paste_store.clear();
        self.state.clear_transcript();
        self.state.push_system(format!(
            "Nouvelle session : {} ({})",
            runtime.session_id(),
            runtime.transcript_path()
        ));
        Ok(())
    }

    pub(super) fn resume_session(&mut self, sid: String) -> anyhow::Result<()> {
        if self.state.phase == AppPhase::Running {
            self.state
                .push_system("Impossible : un run est en cours. Annulez d'abord (Esc).");
            return Ok(());
        }
        let runtime = self.runtime.as_ref().context("moteur non initialisé")?;
        runtime.resume_session(&sid)?;
        self.pending_hydrate = true;
        self.state.push_system(format!(
            "Session reprise : {} ({})",
            runtime.session_id(),
            runtime.transcript_path()
        ));
        Ok(())
    }

    pub(super) async fn hydrate_transcript_ui(
        &mut self,
        announce_loaded: bool,
    ) -> anyhow::Result<()> {
        let runtime = self.runtime.as_ref().context("moteur non initialisé")?;
        let messages = runtime.load_history().await;
        if messages.is_empty() {
            self.state.clear_transcript();
            return Ok(());
        }
        let count = messages.len();
        let (entries, names) = messages_to_log_entries(&messages);
        self.state.clear_transcript();
        self.state.entries = entries;
        self.tool_names = names;
        self.auto_scroll = true;
        self.state.scroll = 0;
        if announce_loaded {
            self.state
                .push_system(format!("Historique chargé ({count} messages transcript)."));
        }
        self.state.rebuild_side_panels_from_entries();
        Ok(())
    }
}
