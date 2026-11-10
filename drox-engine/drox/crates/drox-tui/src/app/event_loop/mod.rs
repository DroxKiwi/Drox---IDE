//! Boucle événements principale (crossterm + ratatui + moteur).

mod ai_server;
mod composer;
mod keys;
mod onboarding;
mod prompt;
mod run;
mod search;
mod sessions;
mod slash;
mod status;
mod workspace;

pub use sessions::print_sessions_list;

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Instant;

use drox_engine::{AgentEvent, EngineError};
use drox_types::ToolUseId;
use tokio::sync::mpsc;

use crate::AppConfig;
use crate::app::state::AppState;
use crate::asker::{AskCoordinator, PendingAsk};
use crate::engine::at_typeahead::AtFileIndex;
use crate::engine::preferences::TuiPreferences;
use crate::engine::status_bar_snapshot::StatusBarSnapshot;
use crate::engine::unified_suggestions::SkillSuggestionEntry;
use crate::engine::{EngineRuntime, TuiKeybindings, VimComposer};
use crate::slash::PendingSlash;

/// Application TUI complète.
pub struct App {
    config: AppConfig,
    state: AppState,
    runtime: Option<Arc<EngineRuntime>>,
    ask: Arc<AskCoordinator>,
    agent_rx: Option<mpsc::Receiver<Result<AgentEvent, EngineError>>>,
    agent_handle: Option<tokio::task::JoinHandle<()>>,
    pending_reply: Option<PendingAsk>,
    tool_names: HashMap<ToolUseId, String>,
    auto_scroll: bool,
    message_queue: VecDeque<String>,
    input_history: Vec<String>,
    history_cursor: Option<usize>,
    pending_hydrate: bool,
    pending_title_refresh: bool,
    pending_slash: Option<PendingSlash>,
    ctrl_c_streak: u8,
    last_ctrl_c: Option<Instant>,
    /// Recherche historique composer (`Ctrl+R`) — état dans `App`, pas `AppState`.
    history_search: Option<crate::view::HistorySearchState>,
    /// Dernière requête recherche transcript (réutilisée au prochain Ctrl+F).
    last_transcript_query: String,
    status_snapshot: StatusBarSnapshot,
    session_started: Instant,
    status_tick: u8,
    keybindings: TuiKeybindings,
    tui_prefs: TuiPreferences,
    /// Index fichiers pour le typeahead `@` (lazy, invalidé au changement de workspace).
    at_file_index: Option<AtFileIndex>,
    /// Empreinte des racines indexées (workspace + `/add-dir`).
    at_file_roots_key: Option<String>,
    /// Contenus des collages smart paste (`[Pasted text #N]`).
    paste_store: crate::engine::PastedTextStore,
    /// Cache noms skills pour complétion `/skills`.
    skill_suggestions: Vec<SkillSuggestionEntry>,
    /// Mode vim composer (`/vim`).
    vim: VimComposer,
    /// Résultat async test connexion IA.
    ai_server_test_rx: Option<mpsc::Receiver<Result<Vec<String>, String>>>,
}

impl App {
    #[must_use]
    pub fn new(config: AppConfig) -> Self {
        let tui_prefs = crate::engine::preferences::load_preferences();
        let mut vim = VimComposer::default();
        vim.set_enabled(tui_prefs.vim_enabled, "");
        Self {
            config,
            state: AppState::new(),
            runtime: None,
            ask: Arc::new(AskCoordinator::new()),
            agent_rx: None,
            agent_handle: None,
            pending_reply: None,
            tool_names: HashMap::new(),
            auto_scroll: true,
            message_queue: VecDeque::new(),
            input_history: Vec::new(),
            history_cursor: None,
            pending_hydrate: false,
            pending_title_refresh: false,
            pending_slash: None,
            ctrl_c_streak: 0,
            last_ctrl_c: None,
            history_search: None,
            last_transcript_query: String::new(),
            status_snapshot: StatusBarSnapshot::default(),
            session_started: Instant::now(),
            status_tick: 0,
            keybindings: TuiKeybindings::load(),
            tui_prefs,
            at_file_index: None,
            at_file_roots_key: None,
            paste_store: crate::engine::PastedTextStore::default(),
            skill_suggestions: Vec::new(),
            vim,
            ai_server_test_rx: None,
        }
    }
}
