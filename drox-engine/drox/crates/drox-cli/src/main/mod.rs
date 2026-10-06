//! Binaire `drox`.
//!
//! Parse les arguments CLI, configure le runtime, instancie l'agent
//! (`drox-engine`) et streame ses événements sur stdout.
//!
//! À terme, expose aussi un mode JSON-RPC sur stdio pour les clients UI
//! (extension VS Code) au sprint 1.11.
//!
//! | Module | Rôle |
//! |--------|------|
//! | [`cli`] | Flags `clap` |
//! | [`setup`] | Tracing / workspace / env LLM |
//! | [`permissions`] | Policy depuis settings + CLI |
//! | [`headers`] | Headers HTTP LLM |
//! | [`run`] | Boucle agent interactive |

#[path = "../stdin_asker.rs"]
mod stdin_asker;
#[path = "../jsonrpc/mod.rs"]
mod jsonrpc;

mod cli;
mod headers;
mod cli_permission_policy;
mod interactive_agent;
mod setup;

/// Ponts lib → `crate::*` pour les handlers JSON-RPC (même package).
mod language {
    pub use drox_cli::language::*;
}
mod prompts {
    pub use drox_cli::prompts::*;
}

use anyhow::Context;
use clap::Parser;
use drox_cli::env_file;
use drox_engine::{default_sessions_dir, list_sessions};

use cli::Cli;
use setup::init_tracing;

#[tokio::main]
#[allow(clippy::too_many_lines)]
async fn main() -> anyhow::Result<()> {
    // Auto-load des fichiers `.env` : workspace (cwd) puis user (`~/.drox/env`).
    // Les vars d'env déjà définies par le shell sont prioritaires.
    let cwd = std::env::current_dir().ok();
    env_file::load_default(cwd.as_deref());

    let cli = Cli::parse();
    init_tracing(cli.verbose);

    tracing::info!(server = %cli.server, model = %cli.model, "drox démarre");

    if cli.serve {
        tracing::info!("drox : mode JSON-RPC stdio (sprint 1.11)");
        return jsonrpc::serve_stdio().await;
    }

    if cli.list_sessions {
        let dir = cli
            .session_dir
            .clone()
            .unwrap_or(default_sessions_dir().context("résolution répertoire sessions")?);
        let entries = list_sessions(&dir).await.context("liste des sessions")?;
        println!("{:<42} {:>12} {:>10}", "SESSION_ID", "MODIFIED_S", "BYTES");
        for e in entries {
            println!("{:<42} {:>12} {:>10}", e.id, e.modified_secs, e.size_bytes);
        }
        return Ok(());
    }

    let Some(prompt) = cli.prompt.clone() else {
        println!(
            "drox v{} — moteur agent (sprint 1.11)",
            env!("CARGO_PKG_VERSION")
        );
        println!("  server   : {}", cli.server);
        println!("  model    : {}", cli.model);
        println!("  provider : {}", cli.provider);
        println!("  apply    : {}", cli.apply);
        println!("  plan     : {}", cli.plan);
        println!("  mode     : {}", cli.mode.as_deref().unwrap_or("(auto)"));
        println!(
            "  rules    : allow={}, ask={}, deny={}",
            cli.allow.len(),
            cli.ask.len(),
            cli.deny.len()
        );
        println!("  max_iter : {}", cli.max_iterations);
        println!();
        println!("  --list-sessions   Lister les transcripts ~/.drox/sessions");
        println!("  --session SES_ID  Reprendre / persister une session JSONL");
        println!("  --serve           Démarrer le serveur JSON-RPC v1 sur stdio");
        println!();
        println!("Utiliser `--prompt \"...\"` pour lancer une session agent.");
        return Ok(());
    };

    interactive_agent::run_interactive_agent(cli, &prompt).await
}
