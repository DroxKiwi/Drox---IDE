Rédigé à l'aide de Cursor Agent

# MCP et sous-agents Explore

## MCP

Crate [`drox-mcp`](../../drox-engine/drox/crates/drox-mcp/src/lib.rs) — hub autour de **`rmcp`** (client MCP Rust : transport child-process et HTTP streamable).

MCP (Model Context Protocol) expose des tools d’un **processus serveur externe** (filesystem, browsers, APIs…). Drox les enregistre sous des noms préfixés `mcp__*` pour éviter les collisions avec la palette native, puis les traite comme n’importe quel `Tool` du registry (permissions / hooks inclus).

### Flux

```text
Config MCP (projet / user)
  → McpHub charge les serveurs
  → découverte des tools
  → register_mcp_tools → noms mcp__*
  → ToolRegistry
  → exposés au LLM comme tools normaux
```

- Enregistrement dynamique : [`drox-tools/src/simple/mcp.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/mcp.rs) (`register_mcp_tools`)
- Hub : [`hub.rs`](../../drox-engine/drox/crates/drox-mcp/src/hub.rs)
- Activation côté run : flag `mcp_tools_enabled` dans `AgentRunParams` (RPC)

Les tools MCP s’exécutent **localement** dans le process moteur (sauf si shadowés / remote — cas rare). Permissions et hooks s’appliquent comme aux autres tools selon matcher.

### Config typique

Les fichiers de config MCP (souvent `.mcp.json` / settings utilisateur) sont lus par le hub — voir commentaires et loaders dans `drox-mcp`. En cas de doute, lire `lib.rs` + tests du crate.

## Sous-agents — tool `task` (Explore)

> La doc `docs/1.4/moteur/07-sous-agents` annonçait une suppression : **périmé**. Explore est **réintroduit** via `task`.

### Activation

1. Settings sous-agents activés (`SubagentSettings.enabled`)
2. `ToolRegistry::register_subagent_task()` depuis le setup RPC ([`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs))
3. Le modèle appelle `task` avec `subagent_type: "explore"` (+ description, thoroughness)

Impl tool : [`simple/task.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/task.rs)  
- V1 : **uniquement** `explore`  
- `is_concurrency_safe` = **false**  
- Retour JSON `{ subagent_type, report }`

### Exécuteur Explore

[`EngineSubagentExecutor::run_explore`](../../drox-engine/drox/crates/drox-engine/src/subagent.rs) :

| Propriété | Valeur |
|-----------|--------|
| Concurrence | Semaphore `max_concurrent` |
| Écritures FS | `apply_fs_writes: false`, `plan_mode: true` |
| Sous-agents imbriqués | Non |
| `max_parallel_tool_calls` | **4** (local à l’Explore) |
| Registre outils | `file_read`, `glob`, `grep`, `lsp`, `web_fetch`, `web_search`, `workspace_map_read` — **pas** de `bash` ni écriture |
| Prompt | Read-only ; rapport structuré ; `[phase: answering]` puis `[phase: done]` |
| Collecte | `TextDelta` jusqu’à `Stop` / max iterations |

### Quand le modèle doit l’utiliser

Le prompt système recommande `task`/`explore` pour un périmètre **très large** plutôt que des dizaines de `glob` dans le parent ([`prompts.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts.rs) — playbook `analyzing`).

## État produit (IDE)

| | |
|--|--|
| Moteur Explore / `task` | ✅ code présent |
| Activé out-of-the-box dans Drox IDE | ❌ (défaut off + bridge non câblé) |
| Livraison prévue | **[1.5.21](../1.5/1.5.21/PLAN-SUBAGENTS-EXPLORE-IDE.md)** |

Voir aussi la pédagogie : [11-mcp-et-explore.md](../pedagogie/11-mcp-et-explore.md).

## Fichiers

| Rôle | Chemin |
|------|--------|
| MCP hub | [`drox-mcp/`](../../drox-engine/drox/crates/drox-mcp/) |
| Register MCP tools | [`simple/mcp.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/mcp.rs) |
| Tool `task` | [`simple/task.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/task.rs) |
| Exécuteur | [`subagent.rs`](../../drox-engine/drox/crates/drox-engine/src/subagent.rs) |
