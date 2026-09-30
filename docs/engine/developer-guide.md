# Guide développeur — build, tests, où patcher

## Prérequis

- Rust toolchain (édition du workspace — voir `rust-toolchain` / `Cargo.toml` du workspace si présent)
- Pour l’IDE complet : Node / scripts fork (hors scope moteur — [`operations/`](../operations/README.md))

## Build moteur

Depuis [`drox-engine/drox/`](../../drox-engine/drox/) :

```powershell
cd drox-engine\drox
cargo build -p drox-cli
cargo build -p drox-tui
cargo build --workspace
```

Binaire debug typique : `target/debug/drox` (ou `.exe` sous Windows).

## Tests

```powershell
cargo test -p drox-engine
cargo test -p drox-cli
cargo test -p drox-tools
cargo test -p drox-session
cargo test --workspace
```

Les tests JSON-RPC / handlers vivent surtout dans `drox-cli` (`jsonrpc/`).  
Les tests de boucle / gates / stream sont dans `agent.rs` (fin de fichier) et modules satellites.

## Où patcher selon le bug

| Besoin | Fichier / crate |
|--------|-----------------|
| Protocole wire / nouveaux champs RPC | [`protocol.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/protocol.rs) + [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) |
| Comportement de clôture / nudges | [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) |
| Texte imposé au modèle | [`prompts.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts.rs) |
| Nouvel outil | `drox-tools/src/simple/<name>.rs` + register dans [`registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) |
| Mode permission | [`drox-permissions`](../../drox-engine/drox/crates/drox-permissions/) + pont [`permissions.rs`](../../drox-engine/drox/crates/drox-engine/src/permissions.rs) |
| Provider LLM | [`drox-llm`](../../drox-engine/drox/crates/drox-llm/) |
| Explore / task | [`subagent.rs`](../../drox-engine/drox/crates/drox-engine/src/subagent.rs), [`task.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/task.rs) |
| Compat UI IDE events | [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) |

## Smoke manuel RPC (idée)

```powershell
# Lancer le serveur puis envoyer des lignes NDJSON (outil perso / script)
.\target\debug\drox.exe --serve
```

Voir aussi smokes historiques sous `docs/0.0/operations/` et `docs/1.5/` (peuvent diverger — croiser avec le code).

## Conventions fork

[`RULES.md`](../../RULES.md) — commits FR, pas de trailer Cursor, branding, releases.

## Doc à tenir à jour

Quand tu changes un comportement **observable** (gates, outils, RPC, phases) : mets à jour la page correspondante sous [`docs/engine/`](README.md) dans le même PR / commit doc si possible.
