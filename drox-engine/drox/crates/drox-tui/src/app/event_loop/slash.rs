//! Commandes `/` et titre de session.

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
    pub(super) fn dispatch_slash_command(&mut self, raw: &str) -> anyhow::Result<bool> {
        let runtime = self
            .runtime
            .as_ref()
            .context("moteur non initialisé")?
            .clone();
        let outcome = handle_slash(raw, &mut self.state, &runtime);
        self.apply_slash_outcome(outcome, &runtime)
    }

    pub(super) fn apply_slash_outcome(
        &mut self,
        outcome: SlashOutcome,
        runtime: &EngineRuntime,
    ) -> anyhow::Result<bool> {
        match outcome {
            SlashOutcome::Handled => {}
            SlashOutcome::Quit => return Ok(true),
            SlashOutcome::RunPrompt(prompt) => {
                self.enqueue_or_run(prompt)?;
            }
            SlashOutcome::NewSession => {
                self.new_session()?;
                self.pending_title_refresh = true;
            }
            SlashOutcome::ResumeSession(sid) => {
                self.resume_session(sid)?;
            }
            SlashOutcome::Compact => {
                self.pending_slash = Some(PendingSlash::Compact);
            }
            SlashOutcome::MemoryList { limit } => {
                self.pending_slash = Some(PendingSlash::MemoryList { limit });
            }
            SlashOutcome::MemoryRead { slug } => {
                self.pending_slash = Some(PendingSlash::MemoryRead { slug });
            }
            SlashOutcome::Permissions => {
                self.pending_slash = Some(PendingSlash::Permissions);
            }
            SlashOutcome::Plan { args } => {
                match handle_plan(&args, &mut self.state, runtime) {
                    SlashOutcome::RunPrompt(p) => {
                        self.enqueue_or_run(p)?;
                    }
                    SlashOutcome::Handled => {}
                    other => {
                        // handle_plan ne renvoie que Handled ou RunPrompt
                        let _ = other;
                    }
                }
            }
            SlashOutcome::Context => {
                self.pending_slash = Some(PendingSlash::Context);
            }
            SlashOutcome::Hooks { args } => {
                handle_hooks(&args, &mut self.state, runtime);
            }
            SlashOutcome::Config => {
                handle_config(&mut self.state, runtime);
            }
            SlashOutcome::Doctor => {
                self.pending_slash = Some(PendingSlash::Doctor);
            }
            SlashOutcome::Mcp { args } => {
                self.pending_slash = Some(PendingSlash::Mcp { args });
            }
            SlashOutcome::Skills { args } => {
                self.pending_slash = Some(PendingSlash::Skills { args });
            }
            SlashOutcome::Cost => {
                self.pending_slash = Some(PendingSlash::Cost);
            }
            SlashOutcome::Diff => {
                self.pending_slash = Some(PendingSlash::Diff);
            }
            SlashOutcome::Files => {
                self.pending_slash = Some(PendingSlash::Files);
            }
            SlashOutcome::Branch => {
                self.pending_slash = Some(PendingSlash::Branch);
            }
            SlashOutcome::Rewind => {
                self.pending_slash = Some(PendingSlash::Rewind);
            }
            SlashOutcome::Export { filename } => {
                self.pending_slash = Some(PendingSlash::Export { filename });
            }
            SlashOutcome::ThemePicker => {
                let cursor = TuiThemeSetting::ALL
                    .iter()
                    .position(|t| *t == self.state.theme)
                    .unwrap_or(0);
                self.state.theme_dialog = Some(ThemeDialog { cursor });
                self.state.phase = AppPhase::Theme;
                self.state.status_line = "/theme — choisir un thème".into();
            }
            SlashOutcome::Keybindings { args } => {
                self.pending_slash = Some(PendingSlash::Keybindings { args });
            }
            SlashOutcome::TerminalSetup => {
                use crate::engine::keybindings_cmd::init_keybindings_file;
                use crate::engine::terminal_setup_cmd::format_terminal_setup_lines;
                let init_ok = init_keybindings_file().is_ok();
                for line in format_terminal_setup_lines(init_ok) {
                    self.state.push_system(line);
                }
            }
            SlashOutcome::Init => {
                self.pending_slash = Some(PendingSlash::Init);
            }
            SlashOutcome::Rename { title } => {
                self.pending_slash = Some(PendingSlash::Rename { title });
            }
            SlashOutcome::Copy { age } => {
                self.pending_slash = Some(PendingSlash::Copy { age });
            }
            SlashOutcome::MemorySearch { query, limit } => {
                self.pending_slash = Some(PendingSlash::MemorySearch { query, limit });
            }
            SlashOutcome::Statusline => {
                self.pending_slash = Some(PendingSlash::Statusline);
            }
            SlashOutcome::Settings => {
                for line in crate::engine::preferences::format_settings_lines(&self.tui_prefs) {
                    self.state.push_system(line);
                }
            }
            SlashOutcome::Onboarding => {
                self.state.onboarding = Some(OnboardingDialog::default());
                self.state.phase = AppPhase::Onboarding;
            }
            SlashOutcome::AiServer => {
                self.open_ai_server_dialog();
            }
            SlashOutcome::Workspace { initial } => {
                self.open_workspace_dialog(initial);
            }
            SlashOutcome::ToggleVim => {
                self.tui_prefs.vim_enabled = !self.tui_prefs.vim_enabled;
                self.vim
                    .set_enabled(self.tui_prefs.vim_enabled, &self.state.composer_buffer);
                let mut prefs = crate::engine::preferences::load_preferences();
                prefs.vim_enabled = self.tui_prefs.vim_enabled;
                if let Err(e) = crate::engine::preferences::save_preferences(&prefs) {
                    self.state.push_system(format!("Préférences : {e}"));
                }
                let msg = if self.tui_prefs.vim_enabled {
                    "Mode vim activé — Esc bascule INSERT/NORMAL · /vim pour désactiver"
                } else {
                    "Mode vim désactivé — édition standard"
                };
                self.state.push_system(msg);
                self.state.status_line = msg.into();
            }
        }
        Ok(false)
    }

    pub(super) async fn execute_slash(&mut self, cmd: PendingSlash) -> anyhow::Result<()> {
        if self.state.phase == AppPhase::Running {
            self.state
                .push_system("Impossible pendant un run agent — annulez d'abord (Esc).");
            return Ok(());
        }
        let runtime = self.runtime.as_ref().context("moteur non initialisé")?;
        match cmd {
            PendingSlash::Compact => {
                self.state.status_line = "Compaction LLM en cours…".into();
                match runtime.compact_current_transcript().await {
                    Ok(CompactOutcome::Live(report)) => {
                        self.hydrate_transcript_ui(false).await?;
                        self.state.push_entry(LogEntry::ContextCompacted {
                            tokens_before: report.tokens_before,
                            tokens_after: report.tokens_after,
                            messages_removed: report.messages_removed,
                        });
                        let preview = compact_checkpoint_preview(&report.summary_text);
                        if !preview.is_empty() {
                            self.state.push_system(preview);
                        }
                        self.state.status_line = "Compaction live terminée".into();
                    }
                    Ok(CompactOutcome::Preview(result)) => {
                        self.state.push_system(format!(
                            "Aperçu compaction (historique trop court pour réécriture live) — objectif : {}",
                            result.objective
                        ));
                        let summary = if result.summary.len() > 1200 {
                            format!("{}…", &result.summary[..1200])
                        } else {
                            result.summary.clone()
                        };
                        self.state.push_system(summary);
                        self.state.status_line = "Aperçu compaction affiché".into();
                    }
                    Err(e) => {
                        self.state.push_system(format!("Compaction : {e:#}"));
                        self.state.status_line = "Compaction échouée".into();
                    }
                }
            }
            PendingSlash::MemoryList { limit } => match runtime.list_archived_memory(limit).await {
                Ok(lines) if lines.is_empty() => {
                    self.state
                        .push_system("Aucune session archivée (.drox/memory/sessions/).");
                }
                Ok(lines) => {
                    self.state
                        .push_system(format!("Mémoire workspace ({limit} max) :"));
                    for line in lines {
                        self.state.push_system(line);
                    }
                }
                Err(e) => self.state.push_system(format!("Mémoire : {e:#}")),
            },
            PendingSlash::MemoryRead { slug } => match runtime.read_archived_memory(&slug).await {
                Ok(body) => {
                    self.state.push_system(format!("── mémoire [{slug}] ──"));
                    for line in body.lines() {
                        self.state.push_system(line.to_string());
                    }
                }
                Err(e) => self.state.push_system(format!("Mémoire [{slug}] : {e:#}")),
            },
            PendingSlash::MemorySearch { query, limit } => {
                match runtime.search_archived_memory(&query, limit).await {
                    Ok(lines) if lines.is_empty() => {
                        self.state.push_system(format!(
                            "Aucun résultat mémoire pour « {query} » (.drox/memory/sessions/)."
                        ));
                    }
                    Ok(lines) => {
                        self.state
                            .push_system(format!("Recherche mémoire « {query} » :"));
                        for line in lines {
                            self.state.push_system(line);
                        }
                        self.state.push_system("Lire en entier : /memory <slug>");
                    }
                    Err(e) => self.state.push_system(format!("Recherche mémoire : {e:#}")),
                }
            }
            PendingSlash::ApplyAiServer { index } => {
                if let Err(e) = self.apply_ai_server_model(index).await {
                    self.state.push_system(format!("Connexion IA : {e:#}"));
                    self.state.status_line = "Échec enregistrement connexion IA".into();
                }
            }
            PendingSlash::ApplyWorkspace { path } => {
                if let Err(e) = self.apply_workspace_switch(path).await {
                    self.state.push_system(format!("Workspace : {e:#}"));
                    self.state.status_line = "Échec changement workspace".into();
                }
            }
            PendingSlash::Statusline => {
                for line in crate::engine::format_statusline_lines(runtime, &self.status_snapshot) {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Permissions => {
                for line in runtime.format_permissions_lines() {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Context => {
                for line in runtime.format_context_lines().await {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Doctor => {
                self.state.status_line = "Diagnostic en cours…".into();
                for line in runtime.run_doctor_checks().await {
                    self.state.push_system(line);
                }
                self.state.status_line = "Diagnostic terminé".into();
            }
            PendingSlash::Mcp { args } => {
                self.state.status_line = "MCP…".into();
                for line in runtime.run_mcp_command(&args).await {
                    self.state.push_system(line);
                }
                self.refresh_mcp_panel().await;
                self.state.status_line.clear();
            }
            PendingSlash::Skills { args } => {
                for line in runtime.run_skills_command(&args).await {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Cost => {
                for line in runtime.format_cost_lines().await {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Diff => {
                for line in runtime.format_git_diff_lines().await {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Files => {
                for line in runtime.format_context_files_lines(&self.state.entries) {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Branch => {
                for line in runtime.format_branch_lines() {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Init => {
                for line in runtime.format_init_status_lines() {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Rewind => match runtime.list_rewind_choices().await {
                Ok(choices) if choices.is_empty() => {
                    self.state
                        .push_system("Aucun message utilisateur — rien à rembobiner.");
                }
                Ok(choices) => {
                    let cursor = choices.len().saturating_sub(1);
                    self.state.rewind = Some(RewindDialog {
                        choices: choices
                            .into_iter()
                            .map(|c| RewindChoiceView {
                                message_index: c.message_index,
                                label: c.label,
                                restore_text: c.restore_text,
                            })
                            .collect(),
                        cursor,
                    });
                    self.state.phase = AppPhase::Rewind;
                    self.state.status_line = "/rewind — choisir un message".into();
                }
                Err(e) => self.state.push_system(format!("Rewind : {e:#}")),
            },
            PendingSlash::RewindApply { message_index } => {
                match runtime.rewind_to_message_index(message_index).await {
                    Ok(report) => {
                        self.hydrate_transcript_ui(false).await?;
                        self.state.push_system(format!(
                            "Rembobiné — {} message(s) conservé(s), {} supprimé(s).",
                            report.messages_kept, report.messages_removed
                        ));
                        if !report.restore_text.is_empty() {
                            self.state.composer_buffer = report.restore_text;
                        }
                        self.state.status_line = "Transcript rembobiné".into();
                    }
                    Err(e) => self.state.push_system(format!("Rewind : {e:#}")),
                }
            }
            PendingSlash::Export { filename } => match runtime.export_transcript(&filename).await {
                Ok(report) => {
                    self.state.push_system(format!(
                        "Conversation exportée : {} ({} octets, {} messages)",
                        report.path, report.bytes, report.message_count
                    ));
                    self.state.status_line = "Export terminé".into();
                }
                Err(e) => self.state.push_system(format!("Export : {e:#}")),
            },
            PendingSlash::Keybindings { args } => {
                use crate::engine::keybindings_cmd::{
                    format_builtin_keybindings_lines, init_keybindings_file,
                };
                let args_trim = args.trim();
                if args_trim.eq_ignore_ascii_case("reload") {
                    match self.keybindings.reload() {
                        Ok(()) => {
                            self.state.push_system(format!(
                                "Keybindings rechargés : {}",
                                self.keybindings.path()
                            ));
                        }
                        Err(e) => self
                            .state
                            .push_system(format!("Keybindings reload : {e:#}")),
                    }
                } else if args_trim.eq_ignore_ascii_case("init") {
                    match init_keybindings_file() {
                        Ok((created, path)) => {
                            let msg = if created {
                                format!("Template keybindings créé : {path}")
                            } else {
                                format!("Keybindings existant (non écrasé) : {path}")
                            };
                            self.state.push_system(msg);
                            let _ = self.keybindings.reload();
                        }
                        Err(e) => self.state.push_system(format!("Keybindings init : {e:#}")),
                    }
                }
                for line in format_builtin_keybindings_lines() {
                    self.state.push_system(line);
                }
            }
            PendingSlash::Rename { title } => {
                use crate::engine::rename_cmd::rename_session;
                match rename_session(
                    &runtime.sessions_dir,
                    &runtime.session_id(),
                    &runtime.transcript_path(),
                    title.as_deref(),
                )
                .await
                {
                    Ok(new_title) => {
                        self.state.session_title = new_title.clone();
                        self.sync_terminal_title();
                        self.state
                            .push_system(format!("Session renommée : {new_title}"));
                        self.state.status_line = "Titre session mis à jour".into();
                    }
                    Err(e) => self.state.push_system(format!("Rename : {e:#}")),
                }
            }
            PendingSlash::Copy { age } => {
                use crate::engine::copy_cmd::{CopyPlan, prepare_copy};
                match prepare_copy(&self.state.entries, age, self.tui_prefs.copy_full_response) {
                    CopyPlan::Immediate { text, filename } => {
                        match crate::engine::copy_cmd::copy_text(&text, &filename).await {
                            Ok(msg) => {
                                self.state.push_system(msg);
                                self.state.status_line = "Copie terminée".into();
                            }
                            Err(e) => self.state.push_system(format!("Copy : {e:#}")),
                        }
                    }
                    CopyPlan::Picker { full_text, blocks } => {
                        self.state.copy = Some(CopyDialog::new(full_text, blocks));
                        self.state.phase = AppPhase::Copy;
                        self.state.status_line = "/copy — choisir le contenu".into();
                    }
                    CopyPlan::Error(msg) => self.state.push_system(msg),
                }
            }
            PendingSlash::CopyApply {
                full_text,
                blocks,
                choice,
                clipboard,
            } => {
                use crate::engine::copy_cmd::{CopyChoice, selection_content};
                use crate::engine::preferences::{load_preferences, save_preferences};
                if matches!(choice, CopyChoice::AlwaysFullResponse) {
                    let mut prefs = load_preferences();
                    prefs.copy_full_response = true;
                    if save_preferences(&prefs).is_ok() {
                        self.tui_prefs = prefs;
                    }
                }
                let (text, filename) = selection_content(&full_text, &blocks, &choice);
                let result = if clipboard {
                    crate::engine::copy_cmd::copy_text(&text, &filename).await
                } else {
                    crate::engine::copy_cmd::write_text_file(&text, &filename).await
                };
                match result {
                    Ok(msg) => {
                        let suffix = if matches!(choice, CopyChoice::AlwaysFullResponse) {
                            "\nPréférence enregistrée (copie complète par défaut)."
                        } else {
                            ""
                        };
                        self.state.push_system(format!("{msg}{suffix}"));
                        if clipboard {
                            self.state.push_toast("Copié dans le presse-papiers");
                        }
                        self.state.status_line = "Copie terminée".into();
                    }
                    Err(e) => self.state.push_system(format!("Copy : {e:#}")),
                }
            }
            PendingSlash::BashExec { command } => {
                if runtime.plan_mode() {
                    self.state
                        .push_system("Mode plan actif — bash intégré désactivé.");
                    return Ok(());
                }
                use crate::engine::bash_mode::BashModeProgressSink;

                self.state.push_entry(LogEntry::BashModeInput {
                    command: command.clone(),
                });
                let (sink, mut prx) = BashModeProgressSink::channel();
                self.state.active_bash = Some(ActiveBashRun::from_user_command(&command));
                self.state.status_line = format!("! {command}");

                let ask = Arc::clone(&self.ask);
                let cmd = command.clone();
                let rt = Arc::clone(runtime);
                let progress = Arc::new(sink);
                let handle =
                    tokio::spawn(
                        async move { rt.execute_user_bash(ask, &cmd, Some(progress)).await },
                    );

                while !handle.is_finished() {
                    while let Ok((out, lines)) = prx.try_recv() {
                        if let Some(b) = self.state.active_bash.as_mut() {
                            b.apply_progress(&out, lines);
                        }
                    }
                    tokio::time::sleep(Duration::from_millis(40)).await;
                }
                while let Ok((out, lines)) = prx.try_recv() {
                    if let Some(b) = self.state.active_bash.as_mut() {
                        b.apply_progress(&out, lines);
                    }
                }

                let output_id = self
                    .state
                    .active_bash
                    .as_ref()
                    .map(|b| b.id.clone())
                    .unwrap_or_else(ToolUseId::new);
                self.state.active_bash = None;

                match handle.await.context("tâche bash mode")? {
                    Ok(output) => {
                        let exit = output.get("exit_code").and_then(Value::as_i64).unwrap_or(0);
                        let timed_out = output
                            .get("timed_out")
                            .and_then(Value::as_bool)
                            .unwrap_or(false);
                        let is_error = exit != 0 || timed_out;
                        self.state.push_entry(LogEntry::BashModeOutput {
                            id: output_id,
                            output,
                            is_error,
                        });
                        self.state.status_line = if is_error {
                            "bash terminé (erreur)".into()
                        } else {
                            "bash terminé".into()
                        };
                    }
                    Err(e) => {
                        self.state.push_entry(LogEntry::Error {
                            text: format!("bash : {e}"),
                        });
                        self.state.status_line = "bash en erreur".into();
                    }
                }
            }
        }
        Ok(())
    }

    pub(super) async fn refresh_session_title(&mut self) {
        let Some(runtime) = self.runtime.as_ref() else {
            return;
        };
        self.state.session_title = crate::engine::rename_cmd::load_display_title(
            &runtime.sessions_dir,
            &runtime.session_id(),
        )
        .await;
        self.sync_terminal_title();
    }

    pub(super) fn sync_terminal_title(&self) {
        if !self.tui_prefs.terminal_title_from_rename {
            return;
        }
        let title = if self.state.session_title.is_empty() {
            "Drox".to_string()
        } else {
            self.state.session_title.clone()
        };
        set_terminal_title(&title);
    }
}
