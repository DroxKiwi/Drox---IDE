# Clients : `drox --serve` vs `drox-tui`

Le cœur `drox-engine` est **unique**. Deux façons de l’entraîner :

| Client | Process | Transport | Binaire |
|--------|---------|-----------|---------|
| **IDE / RPC** | Process séparé | JSON-RPC NDJSON stdio | `drox --serve` ([`drox-cli`](../../drox-engine/drox/crates/drox-cli/src/main.rs)) |
| **TUI** | Même process | Appels Rust directs | `drox-tui` ([`drox-tui`](../../drox-engine/drox/crates/drox-tui/src/main.rs)) |
| **CLI one-shot** | Même process | Args → un run | `drox` sans `--serve` |

## Chemin RPC (IDE)

```text
Electron main spawn drox --serve
  → serve_stdio()
  → initialize / agent.run
  → Agent::run
  → agent/event, tool/exec, user/ask
```

Avantages : isolation crash, contrat clair pour tout client (pas seulement l’IDE).  
Inconvénients : sérialisation, latence IPC, besoin de répondre à `tool/exec`.

Doc protocole : [jsonrpc-protocol.md](jsonrpc-protocol.md).  
Pont IDE : [ide-integration.md](ide-integration.md).

## Chemin TUI (in-process)

```text
drox-tui main
  → engine/bootstrap.rs
  → construit AgentConfig + registry + LLM
  → Agent::run (même drive_inner)
  → widgets ratatui consomment AgentEvent
```

- Pas de `RemoteTool` IDE par défaut : beaucoup d’outils tournent **localement** dans le process TUI.
- Prompts / env : lib partagée `drox-cli` (`prompts`, `env_file`, `language`).
- Bootstrap : [`drox-tui/src/engine/bootstrap.rs`](../../drox-engine/drox/crates/drox-tui/src/engine/bootstrap.rs).

Le dépôt public **Drox---TUI** peut packager ce binaire séparément ; les sources moteur vivent dans ce monorepo sous `drox-engine/drox/`.

## Que partager / ne pas partager

| Partagé | Spécifique client |
|---------|-------------------|
| `drive_inner`, gates, phases | Shim `rail_station_*` (RPC IDE) |
| Registry / permissions / compaction | Widgets chat IDE / ratatui |
| `AgentEvent` | Mapping TypeScript UI |

## Déboguer « ça marche en TUI pas dans l’IDE »

1. Capability `executableTools` → tool remote vs local différent.
2. Params `agent.run` (mode permission, `disabled_tools`, MCP).
3. Client qui ne répond pas à `tool/exec` / `user/ask`.
4. Shim qui transforme les événements — comparer le JSON brut `agent/event` et l’UI.
