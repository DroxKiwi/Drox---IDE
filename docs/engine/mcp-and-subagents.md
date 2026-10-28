# MCP et sous-agents Explore

## MCP

Crate [`drox-mcp`](../../drox-engine/drox/crates/drox-mcp/src/lib.rs) — hub **`rmcp`** (stdio + HTTP streamable).

Tools serveurs externes → noms **`mcp__*`** → même pipeline permissions / hooks que la palette native.

```text
Config MCP → McpHub → register_mcp_tools → ToolRegistry → ToolSpec LLM
```

- [`simple/mcp.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/mcp.rs) · [`hub.rs`](../../drox-engine/drox/crates/drox-mcp/src/hub.rs)
- Run : `mcpToolsEnabled` dans `agent.run` ([`rpc_types.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/rpc_types.rs))

Exécution **dans le process moteur** (sauf shadow remote rare).

## Sous-agents — `task` (Explore)

> Doc `docs/1.4/moteur/07-sous-agents` (suppression) : **périmé**. Explore = **`task`** + module [`subagent/`](../../drox-engine/drox/crates/drox-engine/src/subagent/).

### Activation

1. Settings IDE **`drox.subagents.enabled`** (défaut produit **on** sauf désactivation explicite).
2. Bridge envoie `subagentsEnabled: true` sur `agent.run` quand master + gate régulation OK ([`droxAgentRunBridge.ts`](../../src/vs/workbench/contrib/drox/common/droxAgentRunBridge.ts)).
3. Handler : `registry.register_subagent_task()` → `task`, `explore_index_list`, `explore_artifact_read` ([`handlers/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs)).

Tool : [`simple/task.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/task.rs) — V1 **`explore`** uniquement · pas concurrent · retour `{ subagent_type, report }`.

### Exécuteur — [`EngineSubagentExecutor`](../../drox-engine/drox/crates/drox-engine/src/subagent/explore_executor/mod.rs)

| Propriété | Valeur |
|-----------|--------|
| Concurrence | Semaphore `subagentsMaxConcurrent` |
| Parent Explore | `apply_fs_writes: false`, `plan_mode: true`, pas de `task` imbriqué |
| Parallélisme enfant | `max_parallel_tool_calls` **4** |
| Registre enfant | [`explore_tool_registry()`](../../drox-engine/drox/crates/drox-engine/src/subagent/explore_tool_registry.rs) : read-only + **`explore_commit`** (pas bash / écriture) |
| Phase 1 | Boucle LLM enfant — `explore_execution` : stop sur `answering`/`done` sans tool ([`phase1.rs`](../../drox-engine/drox/crates/drox-engine/src/subagent/explore_executor/phase1.rs)) |
| Rapport | Phase moteur + merge vers parent (prompts [`drox-prompts/explore`](../../drox-engine/drox/crates/drox-prompts/src/explore/)) |

Livrables volumineux : spill / `.drox/scratch` côté parent ([`tool_result_spill`](../../drox-engine/drox/crates/drox-engine/src/agent/tool_result_spill/)).

### Quand l’utiliser

CORE + annexes Explore ([`drox-prompts`](../../drox-engine/drox/crates/drox-prompts/)) recommandent `task` pour périmètre large ; profils **local** = supplément **`SUBAGENTS_EXPLORE_LOCAL`**.

Kickoffs soft parent : nudges runtime (`step_explore`, post-merge, …) — [system-prompts-and-phases.md](system-prompts-and-phases.md).

## État produit (IDE)

| | |
|--|--|
| Moteur Explore / `task` | ✅ |
| Settings + bridge RPC | ✅ (1.5.23+, défaut subagents **on** en UI générale) |
| Régulation L2 | Master ON + L2 ∈ { standard, full } pour envoyer `subagentsEnabled` |
| UI cartes Explore | ✅ |
| Plans historiques | [PLAN-SUBAGENTS-EXPLORE](../1.5/1.5.23/PLAN-SUBAGENTS-EXPLORE.md) |

Pédagogie : [11-mcp-et-explore.md](../pedagogie/11-mcp-et-explore.md).

## Fichiers

| Rôle | Chemin |
|------|--------|
| MCP | [`drox-mcp/`](../../drox-engine/drox/crates/drox-mcp/) |
| Register MCP | [`simple/mcp.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/mcp.rs) |
| `task` | [`simple/task.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/task.rs) |
| Explore index / read | [`explore_index.rs`](../../drox-engine/drox/crates/drox-tools/src/simple/explore_index.rs) (`explore_index_list`, `explore_artifact_read`) |
| Exécuteur | [`subagent/`](../../drox-engine/drox/crates/drox-engine/src/subagent/) |
