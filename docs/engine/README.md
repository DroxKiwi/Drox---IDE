# Moteur Drox — documentation

Documentation **actuelle** du moteur agent Rust (`drox` / workspace [`drox-engine/drox/`](../../drox-engine/drox/)).  
Pipeline d’orchestration : **`tui_mono`** (depuis 1.5.0).

Les dossiers `docs/1.3/`, `docs/1.4/`, `docs/1.5/` restent l’**historique de livraison** (plans, smokes, archives). Ici : le fonctionnement du code tel qu’il tourne.

> **Périmètre** : ce dossier documente le **moteur** (boucle agent, outils, RPC, LLM, sessions) en référence.  
> Pour une lecture **guidée** du code (syntaxe Rust, machine, parcours concrets) : [`docs/pedagogie/`](../pedagogie/README.md).  
> Pour naviguer dans l’**interface IDE** : [tutoriel dédié](../tutorials/ide-navigation.md).

## Intention

Expliquer avec précision comment un message devient des tours LLM, des appels d’outils et des événements — en reliant chaque idée au **code source**, aux **contrats** (JSON-RPC, phases) et aux **bibliothèques** qui portent le runtime.

## Ordre de lecture

| Ordre | Document | Ce qu’on y construit |
|-------|----------|----------------------|
| 1 | Ce README + [architecture-overview.md](architecture-overview.md) | Découpage en crates, runtime async, clients |
| 2 | **[Pedagogie](../pedagogie/README.md)** (série guidée) | Rust + moteur, ligne à ligne |
| 3 | [jsonrpc-protocol.md](jsonrpc-protocol.md) | Wire IDE ↔ moteur |
| 4 | [agent-run-loop.md](agent-run-loop.md) | Sémantique d’un run (`drive_inner`) |
| 5 | [system-prompts-and-phases.md](system-prompts-and-phases.md) | Contrat textuel imposé au modèle |
| 6 | [agent-internals.md](agent-internals.md) | Organisation de `agent.rs`, gates, nudges |
| 7 | [tools-and-permissions.md](tools-and-permissions.md) | Palette, local/remote, hooks, parallélisme |
| 8 | [sessions-and-memory.md](sessions-and-memory.md) · [llm-backends.md](llm-backends.md) | Persistance et backends d’inférence |
| 9 | [mcp-and-subagents.md](mcp-and-subagents.md) · [clients-tui-vs-rpc.md](clients-tui-vs-rpc.md) | Extensions MCP / Explore / TUI |
| 10 | [model-regulation.md](model-regulation.md) | Auto-régulation IDE : notes L1–L5, référentiel, Auto |
| 11 | [codebase-and-rag.md](codebase-and-rag.md) | Index local, auto-index lazy/coalesce, Agents |
| 12 | [developer-guide.md](developer-guide.md) | Build, tests, où patcher |
| — | [glossary.md](glossary.md) | Lexique |
| — | [migration-from-1.4.md](migration-from-1.4.md) | Ancien rail / `role_split` → `tui_mono` |

## Sommaire

| Document | Contenu |
|----------|---------|
| [architecture-overview.md](architecture-overview.md) | Crates, dépendances, clients (IDE / TUI / CLI) |
| **[Pedagogie →](../pedagogie/README.md)** | Guides accompagnés **01–15** (Ollama … régulation / notes) |
| [jsonrpc-protocol.md](jsonrpc-protocol.md) | Transport NDJSON, méthodes, schémas `agent.run`, `tool/exec` |
| [agent-run-loop.md](agent-run-loop.md) | De `agent.run` à `drive_inner` : tours, phases, nudges, clôture |
| [agent-internals.md](agent-internals.md) | Carte du monolithe `agent.rs`, `AgentConfig`, gates |
| [system-prompts-and-phases.md](system-prompts-and-phases.md) | Prompt système, protocole `[phase:]`, règles done/todos/testing |
| [tools-and-permissions.md](tools-and-permissions.md) | Palette exacte, local/remote, modes, parallélisme, hooks |
| [sessions-and-memory.md](sessions-and-memory.md) | JSONL `~/.drox/sessions`, compaction, mémoire `.drox/memory` |
| [llm-backends.md](llm-backends.md) | Ollama, OpenAI-compat, factory, thinking |
| [mcp-and-subagents.md](mcp-and-subagents.md) | MCP `mcp__*`, tool `task` / Explore |
| [clients-tui-vs-rpc.md](clients-tui-vs-rpc.md) | Deux entrées : `--serve` vs `drox-tui` in-process |
| [ide-integration.md](ide-integration.md) | Contrat IDE↔moteur (spawn, bridge) — pas le tutoriel UI |
| [model-regulation.md](model-regulation.md) | Notes L1–L5, signaux, formules v0, policy Auto, persistance |
| [codebase-and-rag.md](codebase-and-rag.md) | Codebase / RAG : index, inject, ordonnancement Agents |
| [developer-guide.md](developer-guide.md) | Build, tests Cargo, où patcher |
| [migration-from-1.4.md](migration-from-1.4.md) | Rail 1.4 / `role_split` → `tui_mono` |
| [glossary.md](glossary.md) | Termes stables |

## Carte mentale

```text
Toi + repo  ↔  Drox IDE (ou drox-tui)
                 ↕ stdio NDJSON (JSON-RPC)   ← IDE seulement
              drox  (drox-cli → drox-engine)
                 ↕ HTTP (reqwest)
              Ollama / endpoint OpenAI-compat
                 ↕
              modèle (Qwen, Gemma, …)
```

Un run IDE : `initialize` → `agent.run` → boucle `drive_inner` (LLM → outils → …) → `agent/done`.  
Les outils que le moteur ne peut pas faire seul (LSP, certains FS IDE) partent en `tool/exec` vers le client.

## Code source — points d’entrée

| Zone | Chemin |
|------|--------|
| Workspace Rust | [`drox-engine/drox/`](../../drox-engine/drox/) |
| Binaire `drox` | [`drox-cli/src/main.rs`](../../drox-engine/drox/crates/drox-cli/src/main.rs) |
| Serveur RPC | [`drox-cli/src/jsonrpc/`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/) |
| Boucle agent | [`drox-engine/src/agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) |
| Événements | [`drox-engine/src/event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs) |
| Outils | [`drox-tools/src/registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) |
| Prompts | [`drox-cli/src/prompts.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts.rs) |
| Intégration IDE (hors moteur) | [`src/vs/workbench/contrib/drox/`](../../src/vs/workbench/contrib/drox/) |

## Historique fonctionnel (audit)

Carte plus ancienne — **ne plus l’utiliser comme carte de fichiers** (chemins `agent/loop/`, rail, `role_split` obsolètes) :  
[`docs/1.4/moteur/`](../1.4/moteur/README.md). Voir [migration-from-1.4.md](migration-from-1.4.md).

