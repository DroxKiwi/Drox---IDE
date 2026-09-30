# Protocole JSON-RPC (stdio NDJSON)

Version protocole : **`PROTOCOL_VERSION = "1.0"`**  
([`jsonrpc/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/mod.rs)).

## Transport

- **Un objet JSON par ligne** sur stdin / stdout (NDJSON).
- Pas de framing LSP `Content-Length`.
- stderr : logs tracing (ne pas parser comme RPC).

Démarrage serveur :

```text
drox --serve
```

Implémentation : [`serve_stdio()`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/server.rs) dans `drox-cli`.

## Handshake — `initialize`

### Requête — `InitializeParams`

| Champ | Rôle |
|-------|------|
| `protocol_version` | Version client |
| `client_name` / `client_version` | Identification |
| `client_capabilities` | Voir ci-dessous |

### `ClientCapabilities`

| Champ | Rôle |
|-------|------|
| `executable_tools` | Noms d’outils que **le client exécute** → le serveur enregistre des `RemoteTool` |
| `interactive_ask` | Si vrai, le serveur peut envoyer `user/ask` |

### Réponse — `InitializeResult::current()`

| Champ | Valeur typique |
|-------|----------------|
| `server_name` | `"drox"` |
| `protocol_version` | `"1.0"` |
| `orchestration_pipeline` | **`"tui_mono"`** |
| `capabilities` | `run_streaming_events`, `sessions`, `interactive_ask` = true |

Côté client IDE, `executableTools` liste les outils host (LSP, certains FS, etc.).

## Méthodes client → serveur

| Méthode | Params | Résultat |
|---------|--------|----------|
| `initialize` | `InitializeParams` | `InitializeResult` |
| `agent.run` | `AgentRunParams` | `{ run_id }` |
| `agent.cancel` | `{ run_id }` | `{ cancelled }` |
| `session.list` | `{ dir? }` | tableau d’entrées |
| `session.read` | `{ id, dir? }` | messages + `ui_stats` |
| `session.compact` | id + config LLM | résumé + usage |
| `session.truncateAfterLastUser` | `{ id, dir? }` | `{ message_count }` |
| `shutdown` | — | arrêt propre |

### `AgentRunParams` — champs utiles

Source : [`protocol.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/protocol.rs).

| Groupe | Champs |
|--------|--------|
| Message | `prompt`, `images[]` (`mime` + `data` base64) |
| Workspace | `workspace`, `allow_outside_workspace` |
| LLM | `server` / base URL, `model`, `provider`, `api_key`, `headers` |
| Sampling | `temperature`, `max_tokens`, `num_ctx`, options Ollama |
| Thinking | `native_thinking`, `reasoning_effort`, `thinking_budget` |
| Permissions | `mode` (`default` \| `plan` \| `acceptEdits` \| `bypassPermissions` \| `professor`), `allow` / `ask` / `deny` |
| Outils | `disabled_tools`, `mcp_tools_enabled`, `apply_edits` |
| Session | `session_id`, `session_dir` |
| Boucle | `max_iterations`, `run_objective`, `skip_user_turn` |
| Sous-agents | `subagents_*` (activation / limites) |
| Legacy ignorés | `orchestration_mode`, `architect_interaction_mode`, … |

Handlers : [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) (`agent_run`, `build_agent_setup`, `drive_run`).

## Notifications serveur → client

| Notification | Payload |
|--------------|---------|
| `agent/event` | `{ run_id, event }` — `event` = `AgentEvent` sérialisé |
| `agent/done` | `{ run_id, status, error? }` — `status` : `completed` \| `cancelled` \| `error` |

Variantes d’événements : voir [agent-run-loop.md](agent-run-loop.md#agentevent) et [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs).

## Requêtes serveur → client

| Méthode | Quand | Réponse attendue |
|---------|-------|------------------|
| `tool/exec` | Outil remote (`RemoteTool`) | `{ output, is_error }` |
| `user/ask` | Si `interactive_ask` + permission / question | `{ answers }` (options / free text / skipped) |

### `ToolExecParams`

`run_id`, `call_id`, `tool_name`, `input`, `workspace`, `plan_mode`, `apply_fs_writes`, `allow_outside_workspace`.

Le client **doit** répondre, sinon la boucle bloque.

Implémentation remote : [`remote_tool.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/remote_tool.rs).

## Exemple minimal (conceptuel)

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocol_version":"1.0","client_name":"example","client_capabilities":{"executable_tools":["lsp"],"interactive_ask":true}}}
{"jsonrpc":"2.0","id":2,"method":"agent.run","params":{"prompt":"Liste les fichiers à la racine","workspace":"/path/to/repo","model":"qwen2.5","provider":"ollama","server":"http://127.0.0.1:11434","mode":"plan"}}
```

Puis des lignes `agent/event` jusqu’à `agent/done`.

## Fichiers

| Rôle | Chemin |
|------|--------|
| Types wire | [`protocol.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/protocol.rs) |
| Boucle stdio | [`server.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/server.rs) |
| Handlers | [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) |
| Shim UI | [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) |

Doc historique (peut diverger) : [`docs/0.0/architecture/PROTOCOLE-JSONRPC.md`](../0.0/architecture/PROTOCOLE-JSONRPC.md).
