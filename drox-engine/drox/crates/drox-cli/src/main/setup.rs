//! Tracing, workspace, env LLM, fusion system.

use anyhow::Context;
use camino::Utf8PathBuf;
use tracing_subscriber::EnvFilter;

pub(crate) fn init_tracing(verbose: u8) {
    let level = match verbose {
        0 => "warn",
        1 => "info",
        2 => "debug",
        _ => "trace",
    };
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new(format!(
            "drox={level},drox_llm={level},drox_engine={level},drox_tools={level}"
        ))
    });
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .init();
}
pub(crate) fn merge_optional_system(cli: Option<String>, mem: Option<String>) -> Option<String> {
    match (cli, mem) {
        (None, None) => None,
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (Some(a), Some(b)) => Some(format!("{a}\n\n{b}")),
    }
}

/// Lit une variable d'environnement et tente de la parser en `i64`. Aligné
/// sur l'helper `env_i64` du module JSON-RPC : utilisé pour
/// `DROX_NUM_PREDICT` / `DROX_NUM_CTX` / `DROX_TOP_K` / `DROX_SEED`.
pub(crate) fn parse_env_i64(key: &str) -> Option<i64> {
    std::env::var(key).ok().and_then(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            trimmed.parse::<i64>().ok()
        }
    })
}

/// Pendant `f32`. Utilisé pour `DROX_TOP_P` / `DROX_REPEAT_PENALTY`.
pub(crate) fn parse_env_f32(key: &str) -> Option<f32> {
    std::env::var(key).ok().and_then(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            trimmed.parse::<f32>().ok()
        }
    })
}

pub(crate) fn resolve_workspace(arg: Option<Utf8PathBuf>) -> anyhow::Result<Utf8PathBuf> {
    let raw = match arg {
        Some(p) => p,
        None => {
            Utf8PathBuf::try_from(std::env::current_dir()?).context("cwd is not valid UTF-8")?
        }
    };
    let canonical = std::fs::canonicalize(raw.as_std_path())
        .with_context(|| format!("workspace not found: {raw}"))?;
    Utf8PathBuf::try_from(canonical).context("workspace path is not valid UTF-8")
}
