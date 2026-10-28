# Guide développeur — build, tests, où patcher

## Prérequis

- Rust **1.85+** (edition 2024 — [`drox-engine/drox/Cargo.toml`](../../drox-engine/drox/Cargo.toml))
- IDE complet : Node / scripts fork — [`release/`](../release/README.md)

CLI : **clap** ; serveur `--serve` : **tracing-subscriber** (`RUST_LOG`).

## Build moteur

Depuis [`drox-engine/drox/`](../../drox-engine/drox/) :

```powershell
cd drox-engine\drox
cargo build -p drox-cli
cargo build -p drox-tui
cargo test -p drox-prompts
cargo build --workspace
```

Binaire dogfood : `target/debug/drox.exe` — snapshot IDE : [`scripts/package-drox.ps1`](../../scripts/package-drox.ps1) · [`resources/drox/README.md`](../../resources/drox/README.md).

Feature **embed** (GGUF local) : `cargo build -p drox-cli --features embed`.

## Tests

```powershell
cargo test -p drox-engine
cargo test -p drox-cli
cargo test -p drox-tools
cargo test -p drox-prompts
cargo test -p drox-session
cargo test --workspace
```

| Zone | Où |
|------|-----|
| RPC / handlers | `drox-cli` — `jsonrpc/`, `prompts/tests.rs` |
| Boucle, gates, phases, profils | `drox-engine` — [`agent/tests/`](../../drox-engine/drox/crates/drox-engine/src/agent/tests/) |
| Catalogue prompts | `drox-prompts` — lint catalog / claims |

## Où patcher selon le besoin

| Besoin | Fichier / crate |
|--------|-----------------|
| Champs RPC / wire | [`rpc_types.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/rpc_types.rs) + [`handlers/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs) |
| Clôture, nudges, gates | [`agent/run/drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs) + [`agent/gates/`](../../drox-engine/drox/crates/drox-engine/src/agent/gates/) |
| Texte CORE / nudges / tool descriptions | **[`drox-prompts/src/`](../../drox-engine/drox/crates/drox-prompts/src/)** (+ [`drox-prompts/docs/adding.md`](../../drox-engine/drox/crates/drox-prompts/docs/adding.md)) |
| Façade prompt CLI | [`drox-cli/src/prompts/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts/mod.rs) |
| Profil moteur / allowlist outils | [`agent/config.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs) |
| Nouvel outil | `drox-tools/src/simple/` + [`registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) |
| Permissions run | [`agent_permissions.rs`](../../drox-engine/drox/crates/drox-engine/src/agent_permissions.rs) + [`drox-permissions`](../../drox-engine/drox/crates/drox-permissions/) |
| Provider LLM | [`drox-llm`](../../drox-engine/drox/crates/drox-llm/) |
| Explore / `task` | [`subagent.rs`](../../drox-engine/drox/crates/drox-engine/src/subagent.rs), [`task.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/task.rs) |
| Embeddings RPC | [`handlers/embed.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/embed.rs), [`drox-embed`](../../drox-engine/drox/crates/drox-embed/) |
| Shim événements IDE | [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) |
| Pont IDE (spawn) | [`droxEngineService.ts`](../../src/vs/workbench/contrib/drox/electron-browser/droxEngineService.ts) |

## Smoke manuel RPC

```powershell
.\target\debug\drox.exe --serve
# NDJSON stdin : initialize → agent.run → lire agent/event + agent/done
```

Smokes historiques : `docs/0.0/operations/`, `docs/1.5/` — toujours croiser avec le code.

## Conventions fork

[`RULES.md`](../../RULES.md) — commits, branding, releases.

## Doc à tenir à jour

Comportement **observable** (gates, outils, RPC, phases, profils) → page [`docs/engine/`](README.md) dans le même lot doc que le code.
