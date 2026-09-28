# Architecture — vue d’ensemble

## Rôle du moteur

`drox.exe` est un **processus agent autonome** : il choisit les tours LLM, décide quels outils appeler, gère permissions / contexte / session, et stream des événements vers un **client** (IDE, TUI, ou autre).

Il ne remplace pas l’éditeur : l’IDE reste responsable du workbench, du FS « riche », du LSP, de l’UI chat. Le contrat entre les deux est le **JSON-RPC sur stdio** (voir [jsonrpc-protocol.md](jsonrpc-protocol.md)).

## Workspace Rust

Racine : `drox-engine/drox/` (Cargo workspace).

```text
drox-types
    ↑
drox-llm · drox-bash · drox-permissions · drox-context
drox-session · drox-hooks · drox-mcp
    ↑
drox-tools
    ↑
drox-engine          ← boucle Agent::run / drive_inner
    ↑
drox-cli             ← binaire `drox` (--serve, CLI)
drox-tui             ← client terminal (même Agent, pas le chemin IDE)
```

Dépendances **unidirectionnelles** : les feuilles ne importent pas `drox-engine`.

| Crate | Rôle |
|-------|------|
| `drox-types` | Types partagés, schémas serde, erreurs |
| `drox-llm` | Clients LLM (Ollama, OpenAI-compat), streaming, factory |
| `drox-tools` | Implémentations d’outils + `ToolRegistry` |
| `drox-mcp` | Serveurs MCP (`rmcp`), outils `mcp__*` |
| `drox-bash` | Analyse / classification shell |
| `drox-permissions` | Allow / ask / deny, modes |
| `drox-context` | Budget tokens, snip, compaction |
| `drox-session` | Stockage transcript JSONL, métadonnées |
| `drox-hooks` | Hooks pre/post tool (`.drox/hooks.json`) |
| `drox-engine` | Orchestration mono-boucle (`tui_mono`) |
| `drox-cli` | Entrée process, JSON-RPC stdio |
| `drox-tui` | UI terminal (ratatui) |

## Clients

| Client | Comment il parle au moteur |
|--------|----------------------------|
| **Drox IDE** | Spawn `drox --serve` depuis le process main Electron ; bridge chat → `agent.run` |
| **drox-tui** | Lie directement `drox-engine` dans le même process (pas de RPC IDE) |
| **Autre** | Tout process capable de NDJSON sur stdin/stdout selon le protocole |

## Pipeline d’orchestration

Valeur annoncée au handshake : **`orchestrationPipeline = "tui_mono"`**.

- Une seule boucle dans `drox-engine` (`agent.rs`), pas de split Architecte / Exécuteur côté code.
- Les champs legacy IDE (`orchestrationMode`, `architectInteractionMode`) peuvent encore être envoyés : ils sont **désérialisés puis ignorés** pour le routage.
- Un **shim** d’événements traduit certaines phases TUI en marqueurs `rail_station_*` pour compat UI historique.

Détail de la boucle : [agent-run-loop.md](agent-run-loop.md).

## Fichiers pivots

- `drox-engine/drox/Cargo.toml` — membres du workspace
- `drox-engine/drox/crates/drox-engine/src/agent.rs` — `drive_inner`
- `drox-engine/drox/crates/drox-cli/src/main.rs` — flags CLI / `--serve`
- `src/vs/workbench/contrib/drox/electron-browser/droxEngineService.ts` — cycle de vie process côté IDE
