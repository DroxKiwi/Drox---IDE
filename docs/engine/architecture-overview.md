# Architecture — vue d’ensemble

## Rôle du moteur

`drox` est un **processus agent autonome** : il orchestre les tours LLM, décide quels outils appeler, gère permissions / contexte / session, et stream des événements vers un **client** (IDE, TUI, ou autre).

Il ne remplace pas l’éditeur : l’IDE reste responsable du workbench, du FS « riche », du LSP, de l’UI chat. Le contrat entre les deux est le **JSON-RPC sur stdio** (voir [jsonrpc-protocol.md](jsonrpc-protocol.md)).

La TUI (`drox-tui`) lie la même crate `drox-engine` **dans le même process** — pas de RPC IDE. Détail : [clients-tui-vs-rpc.md](clients-tui-vs-rpc.md).

## Workspace Rust

Racine : [`drox-engine/drox/`](../../drox-engine/drox/) (Cargo workspace, voir [`Cargo.toml`](../../drox-engine/drox/Cargo.toml)).

```text
drox-types
    ↑
drox-llm · drox-bash · drox-permissions · drox-context
drox-session · drox-hooks · drox-mcp
    ↑
drox-tools
    ↑
drox-engine          ← Agent::run / drive_inner
    ↑
drox-cli             ← binaire `drox` (--serve, CLI one-shot)
drox-tui             ← binaire terminal (même Agent, in-process)
```

Dépendances **unidirectionnelles** : les feuilles ne importent pas `drox-engine`.

| Crate | Rôle | Entrée utile |
|-------|------|----------------|
| `drox-types` | Messages, IDs, schémas serde | [`crates/drox-types/src/lib.rs`](../../drox-engine/drox/crates/drox-types/src/lib.rs) |
| `drox-llm` | Trait `LlmClient`, streaming, factory Ollama / OpenAI-compat | [`factory.rs`](../../drox-engine/drox/crates/drox-llm/src/factory.rs) |
| `drox-tools` | Trait `Tool`, `ToolRegistry`, `simple/*` | [`registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) |
| `drox-mcp` | Hub MCP (`rmcp`), outils `mcp__*` | [`hub.rs`](../../drox-engine/drox/crates/drox-mcp/src/hub.rs) |
| `drox-bash` | Parse / classification shell pour permissions | [`crates/drox-bash/`](../../drox-engine/drox/crates/drox-bash/) |
| `drox-permissions` | Allow / ask / deny, modes | [`mode.rs`](../../drox-engine/drox/crates/drox-permissions/src/mode.rs) |
| `drox-context` | Budget tokens, snip, compact (sans FS) | [`lib.rs`](../../drox-engine/drox/crates/drox-context/src/lib.rs) |
| `drox-session` | Transcripts JSONL, memdir | [`lib.rs`](../../drox-engine/drox/crates/drox-session/src/lib.rs) |
| `drox-hooks` | `.drox/hooks.json` pre/post tool | [`lib.rs`](../../drox-engine/drox/crates/drox-hooks/src/lib.rs) |
| `drox-engine` | Orchestration mono-boucle (`tui_mono`) | [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) |
| `drox-cli` | Entrée process, JSON-RPC, prompts partagés | [`main.rs`](../../drox-engine/drox/crates/drox-cli/src/main.rs) |
| `drox-tui` | UI terminal (ratatui) | [`main.rs`](../../drox-engine/drox/crates/drox-tui/src/main.rs) |

Modules publics de `drox-engine` ([`lib.rs`](../../drox-engine/drox/crates/drox-engine/src/lib.rs)) :

```text
agent · compaction · context · error · event · memory · long_memory
permissions · professor · subagent · tool_hooks · tool_orchestration · tool_progress
```

`default_tool_registry()` appelle `ToolRegistry::with_simple_tools()`.

## Clients

| Client | Comment il parle au moteur |
|--------|----------------------------|
| **Drox IDE** | Spawn `drox --serve` depuis Electron main ; bridge chat → `agent.run` |
| **drox-tui** | Lie `drox-engine` dans le même process (pas de RPC IDE) |
| **CLI one-shot** | `drox` sans `--serve` : un prompt, sortie terminal |
| **Autre** | Tout process capable de NDJSON selon le protocole |

## Pipeline d’orchestration

Valeur annoncée au handshake : **`orchestrationPipeline = "tui_mono"`**  
([`protocol.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/protocol.rs) — `InitializeResult::current()`).

- Une seule boucle dans `drox-engine` (`agent.rs`), pas de split Architecte / Exécuteur côté code.
- Les champs legacy IDE (`orchestrationMode`, `architectInteractionMode`) peuvent encore être envoyés : ils sont **désérialisés puis ignorés** pour le routage.
- Un **shim** d’événements ([`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs)) traduit certaines phases TUI en marqueurs `rail_station_*` pour compat UI historique.

Détail de la boucle : [agent-run-loop.md](agent-run-loop.md).

## Flux d’un run (vue crates)

```text
handlers::agent_run          (drox-cli/jsonrpc)
    → create_llm_client      (drox-llm)
    → ToolRegistry + RemoteTool + MCP
    → PermissionsEngine      (drox-permissions)
    → Session / transcript   (drox-session)
    → Agent::run             (drox-engine)
         → drive_inner
              → LlmClient::stream_chat
              → consume_stream → AgentEvent
              → partition_tool_calls → Tool::execute
              → maybe_snip / compaction
    → agent/event + agent/done
```

## Fichiers pivots

| Sujet | Fichier |
|-------|---------|
| Membres workspace | [`drox-engine/drox/Cargo.toml`](../../drox-engine/drox/Cargo.toml) |
| `drive_inner` | [`drox-engine/src/agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) |
| Flags CLI / `--serve` | [`drox-cli/src/main.rs`](../../drox-engine/drox/crates/drox-cli/src/main.rs) |
| Cycle de vie process IDE | [`droxEngineService.ts`](../../src/vs/workbench/contrib/drox/electron-browser/droxEngineService.ts) |
