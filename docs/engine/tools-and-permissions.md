# Outils et permissions

## Idée centrale

Un **outil** est une unité d’effet de bord (ou de lecture) demandée via `tool_call`. Chaque appel passe par **pre-gates → permissions → hooks → exécution → résultat typé**.

- Trait [`Tool`](../../drox-engine/drox/crates/drox-tools/src/tool.rs) : `name`, schéma, `execute`, `is_read_only` / `is_concurrency_safe`.
- [`ToolRegistry`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) : nom → `Arc<dyn Tool>`.
- [`ToolContext`](../../drox-engine/drox/crates/drox-tools/src/context.rs) : workspace, plan/apply, notes, …

**Local vs remote** : le setup RPC remplace une entrée par [`RemoteTool`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/remote_tool.rs) si le nom est dans `executableTools` (handshake). L’IDE exécute LSP / intégrations host — [`droxClientTools.ts`](../../src/vs/workbench/contrib/drox/common/droxClientTools.ts).

## Palette — `with_simple_tools()`

Source : [`registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs).

| Nom | Famille |
|-----|---------|
| `file_read`, `file_write`, `file_edit`, `notebook_edit` | Fichiers |
| `delete_path`, `copy_path` | FS |
| `grep`, `glob` | Recherche workspace |
| `codebase_search` | Retrieval index local (souvent **remote** IDE) |
| `web_fetch`, `web_search` | Web |
| `lsp` | Langage (souvent **remote**) |
| `ask_user_question` | Interaction (`user/ask`) |
| `exit_plan_mode` | Sortie mode plan |
| `bash` | Shell — analyse **`drox-bash`** (inspectif vs mutateur) |
| `todo_write`, `course_plan_write`, `scope_defer` | Plan / scope |
| `workspace_map_read`, `workspace_map_note` | Carte workspace |
| `session_note`, `memory_read`, `memory_list` | Mémoire locale |
| `skill_read`, `skill_list` | Skills |
| `git_worktree_enter`, `git_worktree_exit` | Worktrees |
| `session_compact`, `session_search`, `session_end` | Session |

### Ajoutés si sous-agents activés — `register_subagent_task()`

| Nom | Rôle |
|-----|------|
| `task` | Lance Explore (sous-run) |
| `explore_index_list` | Liste artefacts index Explore |
| `explore_artifact_read` | Lit un artefact Explore |

Voir [mcp-and-subagents.md](mcp-and-subagents.md).

### Autres

- **`session_end`** : registry oui, **filtré** du LLM (`build_tool_specs`) — commande utilisateur IDE.
- **`mcp__*`** : enregistrement dynamique MCP.
- Descriptions textuelles outils : crate **`drox-prompts`** (`tools/`).

Implémentations : [`drox-tools/src/simple/`](../../drox-engine/drox/crates/drox-tools/src/simple/).

## Filtrage par profil moteur

En plus de `disabled_tools` RPC et régulation IDE (L2), [`EngineProfile::exposes_parent_tool`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs) masque des noms du schéma LLM :

- **`local-9b`** : allowlist courte (todo, reads, mutateurs, `task`, `codebase_search`, …).
- **`local-27b`** : allowlist élargie (+ LSP, web, `explore_artifact_read`, mémoire, …).
- **`cloud-full`** : pas d’allowlist (catalogue complet hors désactivations).

Les outils **`mcp__*`** restent exposés si enregistrés. Détail profils : [agent-internals.md](agent-internals.md).

## Local vs remote

| Mode | Exécuteur |
|------|-----------|
| **Local** | `drox` (`drox-tools`, MCP, bash local) |
| **Remote** | Client via `tool/exec` |

## <a id="parallélisme"></a>Parallélisme

[`tools/orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tools/orchestration.rs) :

1. `partition_tool_calls` : segment **Parallel** si tous `is_concurrency_safe`, sinon **Serial**.
2. Plafond : `max_parallel_tool_calls` (défaut **8**).
3. **`task`** : `is_concurrency_safe` = **false** même en lecture.

## Permissions

Modes ([`mode.rs`](../../drox-engine/drox/crates/drox-permissions/src/mode.rs)) — RPC : `default` \| `plan` \| `acceptEdits` \| `bypassPermissions` \| `professor`.

| Mode | Idée |
|------|------|
| `Default` | Règles + ask humain si indécis |
| `Plan` | Pas d’écritures |
| `AcceptEdits` | Auto-allow edits workspace |
| `BypassPermissions` | Auto-allow sauf deny explicite |
| `Professor` | **Non dispo IDE** — [pédagogie 14](../pedagogie/14-mode-professor.md) |

Mapping UI : `analyze`→plan · `trustEdit`→acceptEdits · `imNotCrazy`→default.

Règles `allow` / `ask` / `deny` dans `AgentRunParams`. Pont run : [`agent_permissions.rs`](../../drox-engine/drox/crates/drox-engine/src/agent_permissions.rs) + `PermissionEngine`.

## Hooks — `.drox/hooks.json`

Crate [`drox-hooks`](../../drox-engine/drox/crates/drox-hooks/). Fusion workspace + optionnel `~/.drox/hooks.json`.

```json
{
  "PreToolUse": [{ "matcher": "bash|file_edit", "hooks": [{ "type": "command", "command": "echo pre", "timeout": 30 }] }],
  "PostToolUse": [],
  "settings": { "default_timeout_secs": 60, "allowed_commands": [] }
}
```

Exit : `0` OK · `2` bloquant · autre = warning.

## Gros résultats outil

[`agent/tool_result_spill/`](../../drox-engine/drox/crates/drox-engine/src/agent/tool_result_spill/) : spill fichier, stub répétition `file_read`, hot-snip — réduit le bruit contexte (Explore / parent).

## Désactivation

- `disabledTools` RPC
- Deny permissions
- Profil / allowlist
- `registry.remove`

## Fichiers

| Rôle | Chemin |
|------|--------|
| Registre | [`registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) |
| Specs LLM / remote | [`agent/dispatch.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/dispatch.rs) |
| Permissions crate | [`drox-permissions/`](../../drox-engine/drox/crates/drox-permissions/) |
| Hooks | [`drox-hooks/`](../../drox-engine/drox/crates/drox-hooks/) |
| Remote | [`remote_tool.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/remote_tool.rs) |
