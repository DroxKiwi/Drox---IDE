//! Types `params` et `result` du protocole drox JSON-RPC v1.
//!
//! Aucun de ces types n'embarque de logique : ce sont des DTO `serde`
//! exclusivement. Les implémentations des méthodes vivent dans
//! [`super::handlers`].

use std::collections::BTreeMap;

use camino::Utf8PathBuf;
use drox_engine::SessionUiStats;
use drox_types::Message;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::PROTOCOL_VERSION;

/// `initialize` — handshake initial.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    #[serde(default)]
    pub protocol_version: Option<String>,
    #[serde(default)]
    pub client_name: Option<String>,
    #[serde(default)]
    pub client_version: Option<String>,
    /// Capabilities annoncées par le client (depuis v1.1).
    #[serde(default)]
    pub client_capabilities: Option<ClientCapabilities>,
}

/// Capabilities annoncées par le client à `initialize`. Permettent au serveur
/// de savoir quelles fonctionnalités exposer (tools délégués, etc.).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCapabilities {
    /// Liste des tools que le client peut exécuter à distance. Le serveur
    /// remplace les implémentations locales correspondantes par des wrappers
    /// qui envoient `tool/exec` au client (et attendent la réponse).
    ///
    /// Exemples : `["file_write", "file_edit", "bash"]`. Les tools non listés
    /// continuent à s'exécuter côté serveur comme avant.
    #[serde(default)]
    pub executable_tools: Vec<String>,
    /// Le client peut afficher une carte « Questions bloquantes » (§2.13 du
    /// backlog) et répondre à la requête serveur→client `user/ask`. Si
    /// `false`/absent, le serveur installe un `RefuseAsker` (le tool
    /// `ask_user_question` retournera `ToolError::Interactive`).
    #[serde(default)]
    pub interactive_ask: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    pub server_name: &'static str,
    pub server_version: &'static str,
    pub protocol_version: &'static str,
    pub capabilities: ServerCapabilities,
    /// Pipeline agent annoncé à l'IDE (`droxEngineService` / warm start).
    /// `tui_mono` = boucle unique TUI 1.5 (plus d'orchestration `role_split`).
    pub orchestration_pipeline: &'static str,
}

impl InitializeResult {
    pub const fn current() -> Self {
        Self {
            server_name: "drox",
            server_version: env!("CARGO_PKG_VERSION"),
            protocol_version: PROTOCOL_VERSION,
            capabilities: ServerCapabilities::CURRENT,
            orchestration_pipeline: "tui_mono",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerCapabilities {
    /// Le serveur émet des notifications `agent/event` pendant `agent.run`.
    pub run_streaming_events: bool,
    /// Le serveur expose `session.list` / `session.read`.
    pub sessions: bool,
    /// Le serveur expose un asker interactif via requêtes serveur→client.
    /// **v1 = `false`** : tout `Ask` retombe en refus côté serveur.
    pub interactive_ask: bool,
}

impl ServerCapabilities {
    pub const CURRENT: Self = Self {
        run_streaming_events: true,
        sessions: true,
        // Le serveur **sait** poser des questions interactives (`user/ask`) ;
        // l'activation effective dépend de `clientCapabilities.interactiveAsk`
        // — c'est `handlers.rs::build_user_asker` qui choisit l'asker
        // concret au moment d'`agent.run`. On annonce la capability au
        // niveau serveur pour que le client puisse interroger
        // `InitializeResult` et adapter son UI si besoin.
        interactive_ask: true,
    };
}

/// `agent.run` — démarre un run. Tous les champs (hors `prompt`) sont
/// optionnels et alignés sur les flags du CLI binaire.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunParams {
    pub prompt: String,
    #[serde(default)]
    pub server: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub workspace: Option<Utf8PathBuf>,
    #[serde(default)]
    pub system: Option<String>,
    #[serde(default)]
    pub apply_edits: Option<bool>,
    /// `default | plan | acceptEdits | bypassPermissions | professor`.
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub ask: Vec<String>,
    #[serde(default)]
    pub deny: Vec<String>,
    #[serde(default)]
    pub no_settings: Option<bool>,
    #[serde(default)]
    pub max_iterations: Option<usize>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub session_dir: Option<Utf8PathBuf>,
    /// API key envoyée comme `x-api-key` au serveur LLM. À défaut, lue depuis
    /// la variable d'environnement `DROX_API_KEY` côté serveur.
    #[serde(default)]
    pub api_key: Option<String>,
    /// Headers HTTP additionnels (en plus de `x-api-key` injecté via `apiKey`).
    /// Les noms sont insensibles à la casse.
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    /// Images attachées au prompt utilisateur (input multimodal). Chaque
    /// entrée embarque un `mime` et le payload base64 brut. Le moteur les
    /// transmet aux providers qui supportent la vision.
    #[serde(default)]
    pub images: Vec<AgentRunImage>,
    /// Active le flux *thinking* natif Ollama (`think: true` sur `/api/chat`)
    /// et l'affichage dans la phase UI `internal_reasoning`. `false` envoie
    /// explicitement `think: false`. `None` = ne pas envoyer la clé (défaut
    /// serveur / modèle).
    #[serde(default)]
    pub native_thinking: Option<bool>,
    /// Outils retirés du registre pour ce run (paramètres workspace §2.17).
    /// Le modèle ne reçoit pas leurs `ToolSpec`. `ask_user_question` et
    /// `todo_write` sont ignorés s'ils apparaissent ici.
    #[serde(default)]
    pub disabled_tools: Vec<String>,
    /// Si `false`, les outils MCP (`mcp__…`) ne sont pas enregistrés pour ce run.
    #[serde(default)]
    pub mcp_tools_enabled: Option<bool>,
    /// Objectif verrouillé du run (§2.25) — heuristique côté client.
    #[serde(default)]
    pub run_objective: Option<String>,
    /// Sous-agents (`task`, §2.10). `false` ou absent = désactivé (défaut).
    #[serde(default)]
    pub subagents_enabled: Option<bool>,
    /// Plafond d'itérations LLM par sous-agent Explore.
    #[serde(default)]
    pub subagents_max_iterations: Option<usize>,
    /// Nombre max de sous-agents en parallèle (file d'attente).
    #[serde(default)]
    pub subagents_max_concurrent: Option<usize>,
    /// Fenêtre de contexte Ollama (`num_ctx`) — vignette Architecte IDE.
    #[serde(default)]
    pub num_ctx: Option<i64>,
    /// Sampling Ollama — vignette Architecte (prioritaire sur env spawn).
    #[serde(default)]
    pub top_p: Option<f32>,
    #[serde(default)]
    pub top_k: Option<i64>,
    #[serde(default)]
    pub repeat_penalty: Option<f32>,
    #[serde(default)]
    pub min_p: Option<f32>,
    #[serde(default)]
    pub seed: Option<i64>,
    #[serde(default)]
    pub presence_penalty: Option<f32>,
    #[serde(default)]
    pub frequency_penalty: Option<f32>,
    #[serde(default)]
    pub keep_alive: Option<String>,
    /// Champs envoyés par l'IDE 1.4 — désérialisés puis **ignorés** (pas de
    /// rail `role_split` dans le moteur TUI).
    #[serde(default)]
    pub orchestration_mode: Option<String>,
    #[serde(default)]
    pub orchestration_max_parallel_executors: Option<usize>,
    #[serde(default)]
    pub architect_interaction_mode: Option<String>,
    /// Si `true`, reprend depuis le transcript sans nouveau tour user.
    #[serde(default)]
    pub skip_user_turn: Option<bool>,
    /// Si `true`, les tools fs acceptent des chemins hors workspace (session toggle IDE).
    #[serde(default)]
    pub allow_outside_workspace: Option<bool>,
}

/// Image attachée à un `agent.run`. `data` est la base64 brute (sans préfixe
/// `data:...;base64,`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunImage {
    pub mime: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunResult {
    pub run_id: String,
}

/// `agent.cancel`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCancelParams {
    pub run_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCancelResult {
    pub cancelled: bool,
}

/// `session.list`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListParams {
    #[serde(default)]
    pub dir: Option<Utf8PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListEntryDto {
    pub id: String,
    pub modified_secs: u64,
    pub size_bytes: u64,
}

/// `session.read`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReadParams {
    pub id: String,
    #[serde(default)]
    pub dir: Option<Utf8PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionReadResult {
    pub messages: Vec<Message>,
    /// Derniers compteurs barre de statut (persistés à côté du `.jsonl`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_stats: Option<SessionUiStats>,
}

/// `session.truncateAfterLastUser` — garde le transcript jusqu'au dernier `user` inclus.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTruncateAfterLastUserParams {
    pub id: String,
    #[serde(default)]
    pub dir: Option<Utf8PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTruncateAfterLastUserResult {
    pub message_count: usize,
}

/// `session.compact` — tour LLM de compaction sur le transcript d'une session
/// (même pipeline que la compaction M1/M2, sans run agent).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCompactParams {
    pub id: String,
    #[serde(default)]
    pub dir: Option<Utf8PathBuf>,
    #[serde(default)]
    pub server: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCompactUsageDto {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCompactResult {
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub objective: Option<String>,
    pub files_touched: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<SessionCompactUsageDto>,
}

/// Notification `agent/event` — `event` peut être un [`AgentEvent`] ou un
/// événement synthétique IDE (`rail_station_*`, …).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventNotification {
    pub run_id: String,
    pub event: Value,
}

/// Paramètres de la requête serveur→client `tool/exec`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolExecParams {
    /// Identifiant du run agent en cours (utile pour corréler côté client).
    pub run_id: String,
    /// Identifiant interne de l'appel (`ToolUseId`), unique par invocation.
    pub call_id: String,
    /// Nom du tool tel que déclaré par le serveur.
    pub tool_name: String,
    /// Arguments d'entrée du tool (JSON, schéma propre à chaque tool).
    pub input: serde_json::Value,
    /// Racine workspace résolue côté serveur. Le client est responsable de
    /// confiner ses opérations à cet espace.
    pub workspace: Utf8PathBuf,
    /// Vrai si le run est en mode plan : le client doit refuser toute
    /// écriture (renvoyer un `isError: true`).
    #[serde(default)]
    pub plan_mode: bool,
    /// Vrai si le run autorise l'application des écritures. Si faux, le
    /// client doit renvoyer une proposition (`applied: false`).
    #[serde(default)]
    pub apply_fs_writes: bool,
    /// Si `true`, le client peut résoudre des chemins hors workspace.
    #[serde(default)]
    pub allow_outside_workspace: bool,
}

/// Réponse client à `tool/exec`. Le champ `result` d'une `Response` JSON-RPC
/// est sérialisé en `Value` et déserialisé en `ToolExecResult` côté serveur.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolExecResult {
    /// Sortie du tool, qui sera transmise au modèle comme `tool_result`.
    pub output: serde_json::Value,
    /// Si vrai, signale au modèle que le tool a échoué.
    #[serde(default)]
    pub is_error: bool,
}

// ─── Questions bloquantes — requête serveur→client `user/ask` (§2.13) ───────

/// Option `{ id, label }` pour une question à choix. Voir
/// `drox_tools::simple::ask::AskOption`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAskOption {
    pub id: String,
    pub label: String,
}

/// Item de la file de questions exposé au client par `user/ask`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAskQuestion {
    pub id: String,
    pub prompt: String,
    #[serde(default)]
    pub options: Vec<UserAskOption>,
    #[serde(default)]
    pub allow_multiple: bool,
    #[serde(default)]
    pub allow_free_text: bool,
}

/// Paramètres de `user/ask`. Le `run_id` permet au client de corréler la
/// carte avec le run agent en cours ; l'`ask_id` est unique par appel.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAskParams {
    pub run_id: String,
    pub ask_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub questions: Vec<UserAskQuestion>,
}

/// Réponse du client à `user/ask`. Une `UserAskAnswer` par question posée,
/// dans **le même ordre** que `UserAskParams::questions`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAskAnswer {
    pub id: String,
    /// Ids des options retenues (vide si réponse libre uniquement).
    #[serde(default)]
    pub option_ids: Vec<String>,
    /// Texte libre saisi par l'utilisateur (peut compléter `optionIds`).
    #[serde(default)]
    pub free_text: String,
    /// Vrai si l'utilisateur a explicitement skipé cette question (touche
    /// Esc / bouton Ignorer).
    #[serde(default)]
    pub skipped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAskResult {
    pub answers: Vec<UserAskAnswer>,
}

/// Statut final d'un run, transporté par `agent/done`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Completed,
    Cancelled,
    Error,
}

/// Notification `agent/done`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDoneNotification {
    pub run_id: String,
    pub status: RunStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn initialize_result_uses_current_protocol_version() {
        let r = InitializeResult::current();
        assert_eq!(r.server_name, "drox");
        assert_eq!(r.protocol_version, PROTOCOL_VERSION);
        assert_eq!(r.orchestration_pipeline, "tui_mono");
        assert!(r.capabilities.run_streaming_events);
        // Sprint Questions bloquantes (§2.13) — le serveur sait poser des
        // questions interactives via `user/ask`, indépendamment de la
        // capacité côté client (qui est lue dans `ClientCapabilities`).
        assert!(r.capabilities.interactive_ask);
    }

    #[test]
    fn agent_run_params_round_trip() {
        let p = AgentRunParams {
            prompt: "hi".into(),
            allow: vec!["Bash(npm:*)".into()],
            mode: Some("acceptEdits".into()),
            ..Default::default()
        };
        let j = serde_json::to_value(&p).unwrap();
        let back: AgentRunParams = serde_json::from_value(j).unwrap();
        assert_eq!(back.prompt, "hi");
        assert_eq!(back.allow, vec!["Bash(npm:*)".to_string()]);
        assert_eq!(back.mode.as_deref(), Some("acceptEdits"));
    }

    #[test]
    fn agent_run_params_round_trips_images() {
        let raw = json!({
            "prompt": "regarde",
            "images": [
                { "mime": "image/png", "data": "AAAA" },
                { "mime": "image/jpeg", "data": "BBBB" }
            ]
        });
        let p: AgentRunParams = serde_json::from_value(raw).unwrap();
        assert_eq!(p.images.len(), 2);
        assert_eq!(p.images[0].mime, "image/png");
        assert_eq!(p.images[1].data, "BBBB");
    }

    #[test]
    fn agent_run_params_round_trips_disabled_tools() {
        let raw = json!({
            "prompt": "hi",
            "disabledTools": ["bash", "web_fetch"],
            "mcpToolsEnabled": false
        });
        let p: AgentRunParams = serde_json::from_value(raw).unwrap();
        assert_eq!(p.disabled_tools, vec!["bash", "web_fetch"]);
        assert_eq!(p.mcp_tools_enabled, Some(false));
    }

    #[test]
    fn agent_run_params_camel_case_in_json() {
        let p = AgentRunParams {
            prompt: "hi".into(),
            apply_edits: Some(true),
            ..Default::default()
        };
        let j = serde_json::to_value(&p).unwrap();
        assert_eq!(j["applyEdits"], json!(true));
    }

    #[test]
    fn tool_exec_params_round_trip_camel_case() {
        let raw = json!({
            "runId": "run_1",
            "callId": "c1",
            "toolName": "file_write",
            "input": { "path": "a.txt", "content": "x" },
            "workspace": "/ws",
            "planMode": true,
            "applyFsWrites": false
        });
        let p: ToolExecParams = serde_json::from_value(raw.clone()).unwrap();
        assert_eq!(p.run_id, "run_1");
        assert_eq!(p.tool_name, "file_write");
        assert!(p.plan_mode);
        assert!(!p.apply_fs_writes);
        let back = serde_json::to_value(&p).unwrap();
        assert_eq!(back["planMode"], json!(true));
        assert_eq!(back["applyFsWrites"], json!(false));
    }

    #[test]
    fn user_ask_params_round_trip_camel_case() {
        let raw = json!({
            "runId": "run_2",
            "askId": "ask_1",
            "title": "Choix",
            "questions": [{
                "id": "q1",
                "prompt": "Continuer ?",
                "options": [{ "id": "opt1", "label": "Oui" }],
                "allowMultiple": false,
                "allowFreeText": true
            }]
        });
        let p: UserAskParams = serde_json::from_value(raw).unwrap();
        assert_eq!(p.run_id, "run_2");
        assert_eq!(p.questions[0].allow_free_text, true);
        let result = UserAskResult {
            answers: vec![UserAskAnswer {
                id: "q1".into(),
                option_ids: vec!["opt1".into()],
                free_text: String::new(),
                skipped: false,
            }],
        };
        let j = serde_json::to_value(&result).unwrap();
        assert_eq!(j["answers"][0]["optionIds"], json!(["opt1"]));
    }

    #[test]
    fn agent_run_params_round_trips_ide_vignette_fields() {
        let raw = json!({
            "prompt": "hi",
            "numCtx": 32768,
            "orchestrationMode": "role_split",
            "orchestrationMaxParallelExecutors": 1,
            "architectInteractionMode": "action",
            "mode": "trustEdit"
        });
        let p: AgentRunParams = serde_json::from_value(raw).unwrap();
        assert_eq!(p.num_ctx, Some(32_768));
        assert_eq!(p.orchestration_mode.as_deref(), Some("role_split"));
        assert_eq!(p.architect_interaction_mode.as_deref(), Some("action"));
        assert_eq!(p.mode.as_deref(), Some("trustEdit"));
    }

    #[test]
    fn run_status_serializes_snake_case() {
        assert_eq!(
            serde_json::to_value(RunStatus::Completed).unwrap(),
            json!("completed")
        );
        assert_eq!(
            serde_json::to_value(RunStatus::Cancelled).unwrap(),
            json!("cancelled")
        );
    }
}
