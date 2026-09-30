Rédigé à l'aide de Cursor Agent

# TUI vs `drox --serve` — deux portes, même moteur

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : le **même** `drox-engine` (`Agent`, `drive_inner`) est entraîné soit par l’**IDE** via JSON-RPC, soit par la **TUI** dans le même process.

Prérequis : [01](01-contact-ollama.md), [04](04-moteur-et-affichage.md).

### L’histoire en une phrase

`--serve` = moteur isolé + messages NDJSON ; `drox-tui` = moteur + terminal **dans un seul binaire**, sans `tool/exec` IDE.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`drox-cli/main.rs`](../../drox-engine/drox/crates/drox-cli/src/main.rs) | Flag `--serve` |
| [`jsonrpc/`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/) | Serveur NDJSON |
| [`drox-tui/main.rs`](../../drox-engine/drox/crates/drox-tui/src/main.rs) | Entrée TUI |
| [`bootstrap.rs`](../../drox-engine/drox/crates/drox-tui/src/engine/bootstrap.rs) | Monte l’`Agent` in-process |
| Réf. | [clients-tui-vs-rpc.md](../engine/clients-tui-vs-rpc.md) |

---

## Partie A — Tableau

| | IDE / `--serve` | TUI |
|--|-----------------|-----|
| Process | Séparé d’Electron | Unique |
| Transport | JSON-RPC NDJSON | Appels Rust directs |
| UI | TypeScript / workbench | **ratatui** + **crossterm** |
| Tools host | Souvent `RemoteTool` + `tool/exec` | Surtout **locaux** |
| Crash moteur | Peut épargner l’éditeur | Emporte le terminal agent |

---

## Partie B — Ce qui est partagé

- `drive_inner`, gates, phases, permissions, compaction, registry de base ;
- prompts (`drox-cli` lib) ;
- `AgentEvent` (la TUI les consomme pour peindre le terminal).

Ce qui diverge : **qui** exécute LSP / certains FS, et **comment** les événements sont peints.

### Exemple concret — deux entrées binaires

**IDE** — [`main.rs`](../../drox-engine/drox/crates/drox-cli/src/main.rs) (idée) : si le flag `--serve` est présent → `jsonrpc::serve_stdio().await`.

**TUI** — [`bootstrap.rs`](../../drox-engine/drox/crates/drox-tui/src/engine/bootstrap.rs) : construit `LlmConfig`, `create_llm_client`, `ToolRegistry`, `AgentConfig`, puis `Agent::new(…)` **dans le même process**, sans passer par `send_request("tool/exec")`.

| Chemin | Ce que tu lis dans le code |
|--------|----------------------------|
| Serve | Boucle stdin ligne JSON → `handlers` → `Agent` → `notify("agent/event")` |
| TUI | Widgets ratatui consomment un stream d’`AgentEvent` local |

Même `drive_inner` ; façade différente.

---

## Partie C — Déboguer « marche en TUI, pas dans l’IDE »

1. `executableTools` différent → remote vs local.
2. Params `agent.run` (mode, disabled tools, MCP).
3. IDE qui ne répond pas à `tool/exec` / `user/ask`.
4. Shim d’événements qui transforme le flux pour l’UI historique.

---

## Récapitulatif

1. Un cœur, deux façades.
2. RPC = contrat + isolation ; TUI = dogfood terminal direct.
3. Beaucoup de bugs « IDE only » sont des bugs de **pont**, pas de boucle agent.

Index : [README.md](README.md).
