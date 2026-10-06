//! Arguments CLI (`clap`).

use camino::Utf8PathBuf;
use clap::Parser;

#[derive(Debug, Parser)]
#[command(
    name = "drox",
    version,
    about = "Moteur agent Drox — autonome, branché sur un LLM (Ollama par défaut)"
)]
#[allow(clippy::struct_excessive_bools)] // struct d'arguments clap : nombreux flags booléens attendus
pub(crate) struct Cli {
    /// URL du serveur LLM (par défaut <http://localhost:11434> pour Ollama).
    #[arg(long, env = "DROX_SERVER", default_value = "http://localhost:11434")]
    pub(crate) server: String,

    /// Modèle à utiliser (e.g. llama3.2, qwen2.5-coder:32b).
    #[arg(long, env = "DROX_MODEL", default_value = "llama3.2")]
    pub(crate) model: String,

    /// Identifiant provider catalogue (`ollama`, `vllm`, `openai_compatible`, …).
    /// Défaut `ollama` — tout autre id utilise le client OpenAI-compatible.
    #[arg(long, env = "DROX_PROVIDER", default_value = "ollama")]
    pub(crate) provider: String,

    /// Racine du workspace exposée aux tools (par défaut : `cwd`).
    #[arg(long, env = "DROX_WORKSPACE")]
    pub(crate) workspace: Option<Utf8PathBuf>,

    /// Si défini, les tools `file_write`/`file_edit` appliquent réellement
    /// les écritures. Sinon, ils retournent une proposition JSON.
    #[arg(long)]
    pub(crate) apply: bool,

    /// Active le mode plan : aucun tool d'écriture ne peut s'exécuter.
    /// L'agent doit terminer sa réflexion par `exit_plan_mode` pour valider.
    #[arg(long)]
    pub(crate) plan: bool,

    /// Mode de permission : `default`, `plan`, `acceptEdits`, `bypassPermissions`.
    /// Si non précisé, lu depuis `settings.json` puis `default`.
    /// `--plan` est équivalent à `--mode plan`.
    #[arg(long)]
    pub(crate) mode: Option<String>,

    /// Règle à autoriser inconditionnellement, ex. `Bash(npm:*)` (peut être
    /// répété). Source `cliArg`, prioritaire sur les fichiers de settings.
    #[arg(long = "allow")]
    pub(crate) allow: Vec<String>,

    /// Règle à demander avant exécution, ex. `Bash(git push:*)` (répétable).
    #[arg(long = "ask")]
    pub(crate) ask: Vec<String>,

    /// Règle à refuser inconditionnellement, ex. `Bash(rm -rf *)` (répétable).
    #[arg(long = "deny")]
    pub(crate) deny: Vec<String>,

    /// Désactive le chargement de `~/.drox/settings.json` et
    /// `<workspace>/.drox/settings.json`. Utile pour les tests.
    #[arg(long)]
    pub(crate) no_settings: bool,

    /// Nombre max de tours LLM ↔ tools dans une exécution (default: 12).
    #[arg(long, default_value_t = 12)]
    pub(crate) max_iterations: usize,

    /// System prompt optionnel injecté en tête de conversation.
    #[arg(long)]
    pub(crate) system: Option<String>,

    /// Verbosité des logs (`-v`, `-vv`, `-vvv`).
    #[arg(short, long, action = clap::ArgAction::Count)]
    pub(crate) verbose: u8,

    /// Prompt à envoyer au modèle. Si omis, affiche juste la config et sort.
    #[arg(short = 'p', long)]
    pub(crate) prompt: Option<String>,

    /// Température de sampling (0.0 - 2.0).
    #[arg(long)]
    pub(crate) temperature: Option<f32>,

    /// Nombre maximum de tokens à générer par tour.
    #[arg(long)]
    pub(crate) max_tokens: Option<u32>,

    /// Liste les sessions (`ses_*.jsonl`) puis quitte.
    #[arg(long)]
    pub(crate) list_sessions: bool,

    /// Répertoire des transcripts (défaut : `~/.drox/sessions`).
    #[arg(long)]
    pub(crate) session_dir: Option<Utf8PathBuf>,

    /// Identifiant `ses_…` : charge `<dir>/<id>.jsonl` s'il existe et
    /// enregistre la suite de la conversation dans le même fichier.
    #[arg(long)]
    pub(crate) session: Option<String>,

    /// Démarre le serveur JSON-RPC v1 sur stdio (NDJSON, une ligne par message).
    /// Tous les autres flags sont ignorés (la configuration se fait par
    /// requête `agent.run`). Voir `docs/PROTOCOLE-JSONRPC.md`.
    #[arg(long)]
    pub(crate) serve: bool,

    /// API key envoyée comme header HTTP `x-api-key` au serveur LLM. Utile
    /// quand Ollama est exposé derrière un reverse-proxy / API gateway.
    /// Lue depuis `DROX_API_KEY` à défaut.
    #[arg(long, env = "DROX_API_KEY")]
    pub(crate) api_key: Option<String>,

    /// Header HTTP supplémentaire au format `Name: Value`. Répétable.
    /// Ex. `--header "Authorization: Bearer xxx"`.
    #[arg(long = "header")]
    pub(crate) headers: Vec<String>,
}
