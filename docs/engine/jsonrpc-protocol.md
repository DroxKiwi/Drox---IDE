# Protocole JSON-RPC (stdio NDJSON)

Version protocole : **`PROTOCOL_VERSION = "1.0"`**  
([`jsonrpc/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/mod.rs)).

## Pourquoi ce transport ?

L’IDE Electron spawn `drox` en **processus enfant**. Canal **stdio** :

- **NDJSON** (un JSON + `\n`) — parsing async Tokio sur stdin ;
- pas de framing LSP `Content-Length` ;
- **stdout** = RPC ; **stderr** = `tracing` uniquement.

Types wire : **`serde`** sur [`rpc_types.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/rpc_types.rs). IDs JSON-RPC + `run_id` / `call_id` métier (**uuid**).

## Transport

```text
drox --serve
```

Boucle : [`serve_stdio()`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/server.rs).

## Handshake — `initialize`

### `InitializeParams`

| Champ | Rôle |
|-------|------|
| `protocol_version` | Version client |
| `client_name` / `client_version` | Identification |
| `client_capabilities` | Capacités client |

### `ClientCapabilities`

| Champ | Rôle |
|-------|------|
| `executable_tools` | Outils exécutés par le **client** → `RemoteTool` |
| `interactive_ask` | Autorise `user/ask` |

### `InitializeResult::current()`

| Champ | Valeur typique |
|-------|----------------|
| `server_name` | `"drox"` |
| `protocol_version` | `"1.0"` |
| `orchestration_pipeline` | **`"tui_mono"`** |
| `capabilities` | streaming, sessions, `interactive_ask` |

Source : [`rpc_types.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/rpc_types.rs).

## Méthodes client → serveur

| Méthode | Params | Résultat |
|---------|--------|----------|
| `initialize` | `InitializeParams` | `InitializeResult` |
| `agent.run` | `AgentRunParams` | `{ run_id }` |
| `agent.cancel` | `{ run_id }` | `{ cancelled }` |
| `session.list` | `{ dir? }` | entrées session |
| `session.read` | `{ id, dir? }` | messages + `ui_stats` |
| `session.compact` | id + config LLM | résumé + usage |
| `session.truncateAfterLastUser` | `{ id, dir? }` | `{ message_count }` |
| `embed.status` | — | statut modèle embed (feature `embed`) |
| `embed.load` | `{ modelPath }` | charge GGUF local |
| `embed.encode` | `{ texts[] }` | vecteurs |
| `shutdown` | — | arrêt propre |

Handlers : [`handlers/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs) · embed : [`handlers/embed.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/embed.rs).

### `AgentRunParams` — champs utiles

Source : [`AgentRunParams`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/rpc_types.rs) (`camelCase` wire).

| Groupe | Champs |
|--------|--------|
| Message | `prompt`, `images[]` |
| Workspace | `workspace`, `allowOutsideWorkspace` (+ read / write) |
| LLM | `server`, `model`, `provider`, `apiKey`, `headers` |
| Sampling | `temperature`, `maxTokens`, `numCtx`, `topP`, `topK`, `repeatPenalty`, `minP`, `seed`, `presencePenalty`, `frequencyPenalty`, `keepAlive` |
| Thinking | `nativeThinking`, `reasoningEffort`, `thinkingBudget` |
| Moteur | **`engineProfile`** (`local-9b` \| `local-27b` \| `cloud-full`) |
| Permissions | `mode`, `allow`, `ask`, `deny`, `applyEdits` |
| Outils | `disabledTools`, `mcpToolsEnabled` |
| Session | `sessionId`, `sessionDir`, `skipUserTurn`, `memoryEnabled` |
| Boucle | `maxIterations`, `runObjective` |
| Sous-agents | `subagentsEnabled`, `subagentsMaxIterations`, `subagentsMaxConcurrent`, `subagentsExecutionThink`, `subagentsReportThink` |
| Intent frames | `workPlanFrame`, `analysisFrame`, `docIngestionFrame`, `sessionIntentPreclassified` |
| Context-load | `contextLoad` (caps L2 soft) |
| Legacy **ignorés** | `orchestrationMode`, `architectInteractionMode`, … |

Construction agent : `build_agent_setup` → `drive_run` dans le même module handlers.

## Notifications serveur → client

| Notification | Payload |
|--------------|---------|
| `agent/event` | `{ run_id, event }` — `AgentEvent` |
| `agent/done` | `{ run_id, status, error? }` — `completed` \| `cancelled` \| `error` |

Variantes : [agent-run-loop.md](agent-run-loop.md#agentevent).

## Requêtes serveur → client

| Méthode | Quand | Réponse |
|---------|-------|---------|
| `tool/exec` | Outil remote | `{ output, is_error }` |
| `user/ask` | Permission / question interactive | `{ answers }` |

`ToolExecParams` : `run_id`, `call_id`, `tool_name`, `input`, `workspace`, `plan_mode`, `apply_fs_writes`, `allow_outside_workspace`.

Implémentation : [`remote_tool.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/remote_tool.rs).

## Exemple minimal (conceptuel)

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1.0","clientName":"example","clientCapabilities":{"executableTools":["lsp"],"interactiveAsk":true}}}
{"jsonrpc":"2.0","id":2,"method":"agent.run","params":{"prompt":"Liste les fichiers à la racine","workspace":"/path/to/repo","model":"qwen2.5","provider":"ollama","server":"http://127.0.0.1:11434","mode":"plan","engineProfile":"local-9b"}}
```

Puis `agent/event` … `agent/done`.

## Fichiers

| Rôle | Chemin |
|------|--------|
| Types wire | [`rpc_types.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/rpc_types.rs) |
| Serveur NDJSON | [`server.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/server.rs) |
| Handlers | [`handlers/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs) |
| Shim UI | [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) |

Archive : [`docs/0.0/architecture/PROTOCOLE-JSONRPC.md`](../0.0/architecture/PROTOCOLE-JSONRPC.md) (peut diverger).
