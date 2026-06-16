//! Stamp de build dev — injecté dans le binaire à chaque compilation de `drox-cli`.
//! Désactivé quand `DROX_OMIT_DEV_BUILD=1` (package release / drox:ship).
//!
//! `rerun-if-changed` sur les crates workspace : toute modif `drox-engine` (etc.)
//! relance `build.rs` et un nouveau `DROX_DEV_BUILD`, même si Cargo ne recompile
//! que le link de `drox-cli`.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// Crates liés par `drox-cli` — toute modif source relance le stamp.
const WORKSPACE_CRATES: &[&str] = &[
    "../drox-engine",
    "../drox-session",
    "../drox-types",
    "../drox-llm",
    "../drox-tools",
    "../drox-hooks",
    "../drox-mcp",
    "../drox-permissions",
];

fn workspace_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn watch_workspace_inputs() {
    for crate_dir in WORKSPACE_CRATES {
        let base = Path::new(crate_dir);
        let src = base.join("src");
        if src.is_dir() {
            println!("cargo:rerun-if-changed={}", src.display());
        }
        let manifest = base.join("Cargo.toml");
        if manifest.is_file() {
            println!("cargo:rerun-if-changed={}", manifest.display());
        }
    }
    println!("cargo:rerun-if-changed=../../Cargo.lock");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=DROX_OMIT_DEV_BUILD");
}

fn git_short_sha() -> String {
    let root = workspace_root();
    let root_str = root.to_string_lossy();
    Command::new("git")
        .args(["-C", root_str.as_ref(), "rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".into())
}

fn main() {
    watch_workspace_inputs();

    let omit = std::env::var("DROX_OMIT_DEV_BUILD")
        .ok()
        .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));

    if omit {
        println!("cargo:rustc-env=DROX_DEV_BUILD=0");
        println!("cargo:rustc-env=DROX_ENGINE_GIT_SHA=");
        return;
    }

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_secs();
    let git_sha = git_short_sha();
    // Epoch Unix complet (secondes) — change à chaque exécution de ce build.rs.
    let dev_build = u32::try_from(ts).unwrap_or(u32::MAX);

    println!("cargo:rustc-env=DROX_DEV_BUILD={dev_build}");
    println!("cargo:rustc-env=DROX_ENGINE_GIT_SHA={git_sha}");
}
