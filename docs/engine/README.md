# Moteur Drox — documentation

Documentation **actuelle** du moteur agent Rust (`drox.exe` / workspace `drox-engine/drox/`).  
Pipeline d’orchestration : **`tui_mono`** (depuis 1.5.0).

Les dossiers `docs/1.3/`, `docs/1.4/`, `docs/1.5/` restent l’**historique de livraison** (plans, smokes, archives). Ici : le fonctionnement du code tel qu’il tourne.

## Intention

Expliquer avec précision comment un message chat devient des tours LLM, des appels d’outils, des événements UI — pour forker, intégrer, ou déboguer.

## Sommaire

| Document | Contenu |
|----------|---------|
| [architecture-overview.md](architecture-overview.md) | Crates, dépendances, clients (IDE / TUI / CLI) |
| [jsonrpc-protocol.md](jsonrpc-protocol.md) | Transport NDJSON, méthodes, `tool/exec`, capabilities |
| [agent-run-loop.md](agent-run-loop.md) | De `agent.run` à `drive_inner` : tours, phases, nudges, clôture |
| [tools-and-permissions.md](tools-and-permissions.md) | Palette, local vs remote, modes permission, hooks |
| [sessions-and-memory.md](sessions-and-memory.md) | Transcripts JSONL, RPC session.*, compaction, mémoire |
| [llm-backends.md](llm-backends.md) | Ollama, OpenAI-compat, factory, params sampling / thinking |
| [ide-integration.md](ide-integration.md) | Spawn `drox --serve`, bridge workbench, shim événements |
| [glossary.md](glossary.md) | Termes stables (`tui_mono`, `AgentEvent`, RemoteTool, …) |

## Carte mentale (1 minute)

```text
Toi + repo  ↔  Drox IDE (ou TUI)
                 ↕ stdio NDJSON (JSON-RPC)
              drox.exe  (drox-cli → drox-engine)
                 ↕ HTTP
              Ollama / endpoint OpenAI-compat
                 ↕
              modèle (Qwen, Gemma, …)
```

Un run : `initialize` → `agent.run` → boucle `drive_inner` (LLM → outils → …) → `agent/done`.  
Les outils que le moteur ne peut pas faire seul (LSP, certains FS IDE) partent en `tool/exec` vers le client.

## Code source

| Zone | Chemin |
|------|--------|
| Workspace Rust | [`drox-engine/drox/`](../../drox-engine/drox/) |
| Boucle agent | `drox-engine/drox/crates/drox-engine/src/agent.rs` |
| Serveur RPC | `drox-engine/drox/crates/drox-cli/src/jsonrpc/` |
| Intégration IDE | `src/vs/workbench/contrib/drox/` |

## Historique fonctionnel (audit par feature)

Carte plus ancienne (à lire avec prudence — certaines pages mentionnent encore `role_split`) :  
[`docs/1.4/moteur/`](../1.4/moteur/README.md).
