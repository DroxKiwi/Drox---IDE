//! Préférences TUI persistantes (`~/.drox/tui-preferences.json`).

use std::io;

use anyhow::Context;
use camino::Utf8PathBuf;

use crate::ui::{SessionAccent, TuiThemeSetting};

/// Moteur IA supporté (extensible).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LlmEngineKind {
    #[default]
    Ollama,
}

impl LlmEngineKind {
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Ollama => "Ollama",
        }
    }
}

/// Connexion serveur IA persistée.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LlmConnectionPrefs {
    #[serde(default)]
    pub engine: LlmEngineKind,
    pub server: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    pub model: String,
    #[serde(default = "default_num_ctx_pref")]
    pub num_ctx: i64,
}

fn default_num_ctx_pref() -> i64 {
    crate::engine::default_num_ctx()
}

/// Préférences utilisateur TUI.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct TuiPreferences {
    #[serde(default)]
    pub theme: TuiThemeSetting,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_color: Option<SessionAccent>,
    #[serde(default = "default_true")]
    pub terminal_title_from_rename: bool,
    /// Copier la réponse complète sans sélecteur de blocs.
    #[serde(default)]
    pub copy_full_response: bool,
    /// Mode vim dans le composer (`/vim` pour basculer).
    #[serde(default)]
    pub vim_enabled: bool,
    /// Onboarding TUI terminé (premier lancement).
    #[serde(default)]
    pub onboarding_done: bool,
    /// Connexion serveur IA (`/server`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub llm_connection: Option<LlmConnectionPrefs>,
    /// Workspaces récents (`/workspace`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub recent_workspaces: Vec<String>,
}

fn default_true() -> bool {
    true
}

impl Default for TuiPreferences {
    fn default() -> Self {
        Self {
            theme: TuiThemeSetting::Dark,
            session_color: None,
            terminal_title_from_rename: true,
            copy_full_response: false,
            vim_enabled: false,
            onboarding_done: false,
            llm_connection: None,
            recent_workspaces: Vec::new(),
        }
    }
}

/// URL Ollama préremplie dans le modal `/server` (pas un modèle implicite).
pub const OLLAMA_DEFAULT_SERVER: &str = "http://localhost:11434";

/// Placeholder interne — le moteur boot sans modèle réel tant que l'utilisateur n'a pas configuré.
pub const LLM_BOOT_PLACEHOLDER_MODEL: &str = "-";

/// Applique les préférences LLM persistées à la config de démarrage.
pub fn apply_llm_prefs_to_config(config: &mut crate::app::AppConfig, prefs: &LlmConnectionPrefs) {
    config.server = prefs.server.clone();
    config.model = prefs.model.clone();
    config.api_key = prefs.api_key.clone();
    config.num_ctx = prefs.num_ctx;
}

/// Résout la connexion IA au démarrage TUI.
///
/// Priorité : préférences persistées → flags/env CLI explicites → non configuré.
#[must_use]
pub fn resolve_llm_startup(
    config: &mut crate::app::AppConfig,
    prefs: &TuiPreferences,
) -> bool {
    if let Some(ref conn) = prefs.llm_connection {
        if !conn.server.trim().is_empty() && !conn.model.trim().is_empty() {
            apply_llm_prefs_to_config(config, conn);
            return true;
        }
    }

    let model_explicit = !config.model.trim().is_empty();
    let server_explicit = !config.server.trim().is_empty();

    if model_explicit {
        if !server_explicit {
            config.server = OLLAMA_DEFAULT_SERVER.to_string();
        }
        return true;
    }

    config.server = OLLAMA_DEFAULT_SERVER.to_string();
    config.model = LLM_BOOT_PLACEHOLDER_MODEL.to_string();
    config.api_key = None;
    config.num_ctx = crate::engine::default_num_ctx();
    false
}

pub fn save_llm_connection(prefs: &LlmConnectionPrefs) -> anyhow::Result<()> {
    let mut all = load_preferences();
    all.llm_connection = Some(prefs.clone());
    save_preferences(&all)
}

const MAX_RECENT_WORKSPACES: usize = 10;

/// Enregistre un workspace dans l'historique récent.
pub fn record_recent_workspace(path: &str) -> anyhow::Result<()> {
    let mut prefs = load_preferences();
    prefs.recent_workspaces.retain(|p| p != path);
    prefs.recent_workspaces.insert(0, path.to_string());
    prefs.recent_workspaces.truncate(MAX_RECENT_WORKSPACES);
    save_preferences(&prefs)
}

#[must_use]
pub fn preferences_path() -> Utf8PathBuf {
    dirs::home_dir()
        .and_then(|h| Utf8PathBuf::from_path_buf(h.join(".drox").join("tui-preferences.json")).ok())
        .unwrap_or_else(|| Utf8PathBuf::from(".drox/tui-preferences.json"))
}

pub fn load_preferences() -> TuiPreferences {
    let path = preferences_path();
    match std::fs::read_to_string(path.as_std_path()) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(e) if e.kind() == io::ErrorKind::NotFound => TuiPreferences::default(),
        Err(_) => TuiPreferences::default(),
    }
}

pub fn save_preferences(prefs: &TuiPreferences) -> anyhow::Result<()> {
    let path = preferences_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent.as_std_path()).context("création ~/.drox")?;
    }
    let body = serde_json::to_string_pretty(prefs).context("sérialisation préférences")?;
    std::fs::write(path.as_std_path(), body).context("écriture tui-preferences.json")?;
    Ok(())
}

pub fn mark_onboarding_done() -> anyhow::Result<()> {
    let mut prefs = load_preferences();
    prefs.onboarding_done = true;
    save_preferences(&prefs)
}

/// Lignes `/settings` — préférences TUI utilisateur.
#[must_use]
pub fn format_settings_lines(prefs: &TuiPreferences) -> Vec<String> {
    let path = preferences_path();
    let mut lines = vec![
        "Réglages TUI (`~/.drox/tui-preferences.json`)".into(),
        format!("  fichier : {path}"),
        format!("  thème : {:?}", prefs.theme),
        format!(
            "  accent session : {}",
            prefs
                .session_color
                .map(|c| format!("{c:?}"))
                .unwrap_or_else(|| "défaut".into())
        ),
        format!("  vim composer : {}", prefs.vim_enabled),
        format!("  /copy réponse complète : {}", prefs.copy_full_response),
        format!("  titre terminal depuis /rename : {}", prefs.terminal_title_from_rename),
        format!("  onboarding vu : {}", prefs.onboarding_done),
        "Modifier : `/theme` · `/color` · `/vim` · Ctrl+Shift+L ou `/server` · Ctrl+Shift+W ou `/workspace` · `/onboarding`".into(),
    ];
    if !prefs.recent_workspaces.is_empty() {
        lines.push(format!(
            "  workspaces récents : {} (via `/workspace`)",
            prefs.recent_workspaces.len()
        ));
    }
    if let Some(ref llm) = prefs.llm_connection {
        lines.push("— Connexion IA".into());
        lines.push(format!("  moteur : {}", llm.engine.label()));
        lines.push(format!("  serveur : {}", llm.server));
        lines.push(format!("  modele : {}", llm.model));
        lines.push(format!("  num_ctx : {}", llm.num_ctx));
        lines.push(format!(
            "  x-api-key : {}",
            if llm.api_key.as_ref().is_some_and(|k| !k.is_empty()) {
                "définie"
            } else {
                "absente"
            }
        ));
    } else {
        lines.push("— Connexion IA : non configurée (Ctrl+Shift+L ou `/server`)".into());
    }
    lines
}

pub fn persist_from_state(state: &crate::app::AppState) -> anyhow::Result<()> {
    let existing = load_preferences();
    save_preferences(&TuiPreferences {
        theme: state.theme,
        session_color: state.session_accent,
        terminal_title_from_rename: existing.terminal_title_from_rename,
        copy_full_response: existing.copy_full_response,
        vim_enabled: existing.vim_enabled,
        onboarding_done: existing.onboarding_done,
        llm_connection: existing.llm_connection.clone(),
        recent_workspaces: existing.recent_workspaces.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_preferences_json() {
        let prefs = TuiPreferences::default();
        let json = serde_json::to_string(&prefs).unwrap();
        assert!(json.contains("dark"));
    }

    #[test]
    fn resolve_unconfigured_without_prefs_or_cli() {
        let mut config = crate::app::AppConfig {
            server: String::new(),
            model: String::new(),
            workspace: camino::Utf8PathBuf::from("."),
            apply: false,
            plan_mode: false,
            mode: None,
            allow: Vec::new(),
            ask: Vec::new(),
            deny: Vec::new(),
            no_settings: false,
            max_iterations: 12,
            api_key: None,
            num_ctx: crate::engine::default_num_ctx(),
            session: None,
            session_dir: None,
        };
        assert!(!resolve_llm_startup(&mut config, &TuiPreferences::default()));
        assert_eq!(config.model, LLM_BOOT_PLACEHOLDER_MODEL);
        assert_eq!(config.server, OLLAMA_DEFAULT_SERVER);
    }

    #[test]
    fn resolve_from_saved_prefs() {
        let mut config = crate::app::AppConfig {
            server: String::new(),
            model: String::new(),
            workspace: camino::Utf8PathBuf::from("."),
            apply: false,
            plan_mode: false,
            mode: None,
            allow: Vec::new(),
            ask: Vec::new(),
            deny: Vec::new(),
            no_settings: false,
            max_iterations: 12,
            api_key: None,
            num_ctx: crate::engine::default_num_ctx(),
            session: None,
            session_dir: None,
        };
        let prefs = TuiPreferences {
            llm_connection: Some(LlmConnectionPrefs {
                engine: LlmEngineKind::Ollama,
                server: "http://127.0.0.1:11434".into(),
                api_key: None,
                model: "qwen2.5".into(),
                num_ctx: crate::engine::default_num_ctx(),
            }),
            ..TuiPreferences::default()
        };
        assert!(resolve_llm_startup(&mut config, &prefs));
        assert_eq!(config.model, "qwen2.5");
    }

    #[test]
    fn resolve_from_explicit_cli_model() {
        let mut config = crate::app::AppConfig {
            server: String::new(),
            model: "mistral".into(),
            workspace: camino::Utf8PathBuf::from("."),
            apply: false,
            plan_mode: false,
            mode: None,
            allow: Vec::new(),
            ask: Vec::new(),
            deny: Vec::new(),
            no_settings: false,
            max_iterations: 12,
            api_key: None,
            num_ctx: crate::engine::default_num_ctx(),
            session: None,
            session_dir: None,
        };
        assert!(resolve_llm_startup(&mut config, &TuiPreferences::default()));
        assert_eq!(config.model, "mistral");
        assert_eq!(config.server, OLLAMA_DEFAULT_SERVER);
    }

    #[test]
    fn record_recent_workspace_dedupes_and_caps() {
        let mut prefs = TuiPreferences::default();
        for i in 0..12 {
            prefs.recent_workspaces.push(format!("/tmp/w{i}"));
        }
        save_preferences(&prefs).unwrap();
        record_recent_workspace("/tmp/new").unwrap();
        let loaded = load_preferences();
        assert_eq!(loaded.recent_workspaces.first().map(String::as_str), Some("/tmp/new"));
        assert!(loaded.recent_workspaces.len() <= MAX_RECENT_WORKSPACES);
    }
}
