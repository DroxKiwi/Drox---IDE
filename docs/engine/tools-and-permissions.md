Rédigé à l'aide de Cursor Agent

# Outils et permissions

## Idée centrale

Un **outil** est une unité d’effet de bord (ou de lecture) que le modèle peut demander via un `tool_call` nommé. Le moteur ne « croit » pas le modèle : il passe chaque appel par **pre-gates → permissions → hooks → exécution → résultat typé**.

- Trait [`Tool`](../../drox-engine/drox/crates/drox-tools/src/tool.rs) : `name`, schéma d’entrée, `execute`, `is_read_only` / `is_concurrency_safe`.
- [`ToolRegistry`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) : map nom → `Arc<dyn Tool>` (dyn via `async-trait`).
- Contexte d’exécution : [`ToolContext`](../../drox-engine/drox/crates/drox-tools/src/context.rs) (workspace, flags apply/plan, notes, …).

**Local vs remote** n’est pas une propriété du tool dans le registry : c’est le **setup RPC** qui remplace certaines entrées par un `RemoteTool` quand le client a déclaré le nom dans `executableTools`. Sémantiquement : « qui possède l’API host ? » — le process `drox` (FS local, MCP) ou l’IDE (LSP VS Code, intégrations workbench).

## Palette exacte — `with_simple_tools()`

Source : [`registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs).

| Nom | Famille |
|-----|---------|
| `file_read`, `file_write`, `file_edit`, `notebook_edit` | Fichiers |
| `delete_path`, `copy_path` | FS |
| `grep`, `glob` | Recherche workspace |
| `web_fetch`, `web_search` | Web |
| `lsp` | Langage (souvent **remote** IDE) |
| `ask_user_question` | Interaction (`user/ask` si capability) |
| `exit_plan_mode` | Sortie mode plan |
| `bash` | Shell — classification via **`drox-bash`** (**tree-sitter** + grammar bash) pour distinguer inspectif vs mutateur |
| `todo_write`, `course_plan_write`, `scope_defer` | Plan / scope |
| `workspace_map_read`, `workspace_map_note` | Carte workspace |
| `session_note`, `memory_read`, `memory_list` | Mémoire locale |
| `skill_read`, `skill_list` | Skills |
| `git_worktree_enter`, `git_worktree_exit` | Worktrees |
| `session_compact`, `session_search`, `session_end` | Session (voir notes) |

**Notes :**

- `session_end` est enregistré mais **non exposé au LLM** (filtré dans `build_tool_specs`) — commande utilisateur IDE.
- `task` (sous-agent Explore) : **pas** dans `with_simple_tools` ; ajouté via `register_subagent_task()` si sous-agents activés. Voir [mcp-and-subagents.md](mcp-and-subagents.md).
- Outils MCP : préfixe `mcp__*` enregistrés dynamiquement.

Implémentations : [`drox-tools/src/simple/`](../../drox-engine/drox/crates/drox-tools/src/simple/).

## Local vs remote

| Mode | Qui exécute | Quand |
|------|-------------|--------|
| **Local** | Processus `drox` | Implémentation dans `drox-tools` / MCP attaché au moteur |
| **Remote** | Client (IDE) | Nom listé dans `initialize.clientCapabilities.executableTools` |

Remote = wrapper [`RemoteTool`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/remote_tool.rs) → JSON-RPC `tool/exec` → résultat client.

L’IDE déclare typiquement les outils qui ont besoin du host VS Code (LSP, certains FS, intégrations workbench) — côté TypeScript : [`droxClientTools.ts`](../../src/vs/workbench/contrib/drox/common/droxClientTools.ts).

## <a id="parallélisme"></a>Parallélisme

[`tool_orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tool_orchestration.rs) :

1. `partition_tool_calls` : lots **Parallel** si tous les tools du segment sont `is_concurrency_safe` ; sinon lot **Serial**.
2. Plafond : `AgentConfig.max_parallel_tool_calls` (défaut **8**).
3. Défaut `Tool::is_concurrency_safe` ≈ `is_read_only()` ; exception : **`task` → false** (même read-only).

Exemples : `file_read`+`grep`+`glob` → parallèle ; `file_edit`, `bash`, `todo_write` → série.

## Permissions

Modes ([`mode.rs`](../../drox-engine/drox/crates/drox-permissions/src/mode.rs)) — chaînes RPC : `default` \| `plan` \| `acceptEdits` \| `bypassPermissions` \| `professor`.

| Mode | Idée |
|------|------|
| `Default` | Pipeline règles ; si rien ne tranche → demander à l’humain |
| `Plan` | Interdit écritures ; lecture/grep OK |
| `AcceptEdits` | Auto-allow edits fichier workspace ; bash arbitraire peut encore demander |
| `BypassPermissions` | « Yolo » — auto-allow sauf `Deny` explicite (risqué) |
| `Professor` | Écritures seulement via gates pédagogiques (`workArea` + étape exercise/checkpoint) |

Alias parsing : `yolo` → Bypass ; `professeur` / `teacher` → Professor.

Mapping UI fréquent (IDE) :

- `analyze` → `plan`
- `trustEdit` → `acceptEdits`
- `imNotCrazy` → `default`

Règles `allow` / `ask` / `deny` peuvent aussi être passées dans `AgentRunParams`.  
Pont agent : [`drox-engine/src/permissions.rs`](../../drox-engine/drox/crates/drox-engine/src/permissions.rs).

## Hooks — `.drox/hooks.json`

Crate [`drox-hooks`](../../drox-engine/drox/crates/drox-hooks/). Emplacements : `<workspace>/.drox/hooks.json` + fusion optionnelle `~/.drox/hooks.json`.

### Schéma (V1)

```json
{
  "PreToolUse": [
    {
      "matcher": "bash|file_edit",
      "hooks": [
        { "type": "command", "command": "echo pre", "timeout": 30 }
      ]
    }
  ],
  "PostToolUse": [],
  "settings": {
    "default_timeout_secs": 60,
    "allowed_commands": []
  }
}
```

| Élément | Détail |
|---------|--------|
| `matcher` | Motif sur le nom d’outil |
| `type` | V1 : uniquement `"command"` |
| `command` | Shell à lancer |
| `timeout` | Secondes (optionnel) |
| `if` / `if_condition` | Condition optionnelle |
| `allowed_commands` | Allowlist 1er token ; vide = pas de filtre |
| Exit codes | `0` OK · `2` bloquant · autre = avertissement |

## Désactivation

- `disabled_tools` dans `agent.run`
- Permissions deny → résultat d’erreur / refus au modèle, pas d’effet de bord
- Retrait du registry

## Fichiers

| Rôle | Chemin |
|------|--------|
| Registre | [`registry.rs`](../../drox-engine/drox/crates/drox-tools/src/registry.rs) |
| Trait Tool | [`tool.rs`](../../drox-engine/drox/crates/drox-tools/src/tool.rs) |
| Permissions | [`drox-permissions/`](../../drox-engine/drox/crates/drox-permissions/) |
| Hooks | [`drox-hooks/`](../../drox-engine/drox/crates/drox-hooks/) |
| Remote | [`remote_tool.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/remote_tool.rs) |
