# Outils et permissions

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
| `bash` | Shell (`drox-bash` + permissions) |
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
