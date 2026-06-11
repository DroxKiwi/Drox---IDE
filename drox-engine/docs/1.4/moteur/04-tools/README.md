# 04 — Tools (outils)

**Question** : où sont définis les outils, comment sont-ils exposés au LLM et exécutés ?

---

## Rôle

Registre des capacités du modèle : lecture, édition, bash, web, MCP, délégation. Séparation **définition** (`drox-tools`) / **orchestration** (`drox-engine`).

---

## Crates & fichiers

| Emplacement | Rôle |
|-------------|------|
| `drox-tools/src/tool.rs` | Trait `Tool` |
| `drox-tools/src/registry.rs` | `ToolRegistry` |
| `drox-tools/src/simple/*.rs` | ~30 implémentations |
| `drox-tools/src/context.rs` | `ToolContext` (workspace, permissions, session notes…) |
| `drox-engine/.../helpers/tool_specs.rs` | `build_tool_specs` — filtre par `RunSpec` |
| `drox-engine/.../loop/tool_execution.rs` | Exécution + résultat dans messages |
| `drox-engine/tool_orchestration.rs` | Parallélisation batch tool calls |
| `drox-cli/.../remote_tool.rs` | Délégation exécution → IDE |

---

## Allowlists par rôle

`run_spec/mod.rs` :

- `ARCHITECT_TOOL_ALLOWLIST` — full edit + orchestration (~25 outils)
- `ARCHITECT_DISCUSSION_TOOL_ALLOWLIST` — lecture seule
- `EXECUTOR_TOOL_ALLOWLIST` — shard borné

`RunSpec::tool_visible()` filtre ce qui part vers l’API LLM.

---

## Tools notables

| Tool | Rôle |
|------|------|
| `file_read`, `grep`, `glob`, `lsp` | Exploration |
| `file_edit`, `file_write` | Mutations (souvent **remote** IDE) |
| `bash` | Shell (classifié par `drox-bash`) |
| `todo_write` | Plan architecte |
| `delegate_executor` | Spawn exécuteur → `orchestration_delegate.rs` |
| `task` | Sub-agent Explore → `subagent.rs` |
| `workspace_map_read` | Carte repo |
| `skill_list`, `skill_read` | Skills `.drox/skills/` |
| `mcp__*` | Outils MCP dynamiques |

---

## Exécution locale vs remote

```text
tool_execution
  → PermissionPolicy
  → pre_gate (gates + run_rail)
  → si tool IDE-délégué : RemoteTool::exec via JSON-RPC
  → sinon : registry.get(name).run(ctx, args)
  → Message::tool_result + AgentEvent::ToolFinish
```

---

## Liens

- [GUIDE-MOTEUR-DROX §tools](../../../0.0/guides/GUIDE-MOTEUR-DROX.md)
- Permissions : [05-permissions-hooks](../05-permissions-hooks/README.md)
- Sous-agents : [07-sous-agents](../07-sous-agents/README.md)
