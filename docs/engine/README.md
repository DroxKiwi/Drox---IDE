# Moteur Drox — documentation

Documentation **actuelle** du moteur agent Rust (`drox` / workspace [`drox-engine/drox/`](../../drox-engine/drox/)).  
Pipeline d’orchestration : **`tui_mono`** (depuis 1.5.0).

Les dossiers `docs/1.3/`, `docs/1.4/`, `docs/1.5/` restent l’**historique de livraison** (plans, smokes, archives). Ici : le fonctionnement du code tel qu’il tourne.

> **Périmètre** : ce dossier documente le **moteur** (boucle agent, outils, RPC, LLM, sessions).  
> Pour naviguer dans l’**interface IDE** (chat, settings, Changes) : [tutoriel dédié](../tutorials/ide-navigation.md).

## Intention

Expliquer avec précision — pour débutant motivé comme pour contributeur confirmé — comment un message devient des tours LLM, des appels d’outils et des événements, avec des **liens vers le code source**.

## Parcours de lecture recommandé

| Étape | Document | Niveau |
|-------|----------|--------|
| 1 | Ce README + [architecture-overview.md](architecture-overview.md) | Débutant |
| 2 | [jsonrpc-protocol.md](jsonrpc-protocol.md) | Débutant |
| 3 | [agent-run-loop.md](agent-run-loop.md) | Débutant → confirmé |
| 4 | [system-prompts-and-phases.md](system-prompts-and-phases.md) | Confirmé |
| 5 | [agent-internals.md](agent-internals.md) | Confirmé (carte de `agent.rs`) |
| 6 | [tools-and-permissions.md](tools-and-permissions.md) | Confirmé |
| 7 | [sessions-and-memory.md](sessions-and-memory.md) · [llm-backends.md](llm-backends.md) | Selon le bug |
| 8 | [mcp-and-subagents.md](mcp-and-subagents.md) · [clients-tui-vs-rpc.md](clients-tui-vs-rpc.md) | Avancé |
| 9 | [developer-guide.md](developer-guide.md) | Pour patcher / tester |
| — | [glossary.md](glossary.md) | Référence lexicale |
| — | [migration-from-1.4.md](migration-from-1.4.md) | Si tu tombes sur de la doc rail / `role_split` |

## Sommaire complet

| Document | Contenu |
|----------|---------|
| [architecture-overview.md](architecture-overview.md) | Crates, dépendances, clients (IDE / TUI / CLI) |
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
| [developer-guide.md](developer-guide.md) | Build, tests Cargo, où patcher |
| [migration-from-1.4.md](migration-from-1.4.md) | Rail 1.4 / `role_split` → `tui_mono` |
| [glossary.md](glossary.md) | Termes stables |

## Carte mentale (1 minute)

```text
Toi + repo  ↔  Drox IDE (ou drox-tui)
                 ↕ stdio NDJSON (JSON-RPC)   ← IDE seulement
              drox  (drox-cli → drox-engine)
                 ↕ HTTP
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
