# Outils et permissions

## Palette

Le registre par défaut (`ToolRegistry::with_simple_tools`) expose notamment :

| Famille | Exemples |
|---------|----------|
| Fichiers | `file_read`, `file_write`, `file_edit`, `delete_path`, `copy_path`, `notebook_edit` |
| Recherche | `grep`, `glob`, `web_search` / `web_*`, outils LSP (souvent remote) |
| Plan | `todo_write`, `course_plan_write`, `exit_plan_mode` |
| Shell | `bash` (analyse via `drox-bash`) |
| Mémoire / session | `session_note`, `memory_*`, `session_*` |
| Skills / workspace | skills, workspace map, git worktree |
| Sous-agents | `task` (optionnel) |
| MCP | outils préfixés `mcp__*` via `drox-mcp` |

La liste exacte évolue avec le code : source de vérité = `drox-tools` + construction du registry dans `drox-engine`.

## Local vs remote

| Mode | Qui exécute | Quand |
|------|-------------|--------|
| **Local** | Processus `drox` | Outil implémenté dans `drox-tools` / MCP attaché au moteur |
| **Remote** | Client (IDE) | Outil listé dans `initialize.clientCapabilities.executableTools` |

Remote = wrapper `RemoteTool` → requête JSON-RPC `tool/exec` → le client renvoie le résultat.

L’IDE déclare typiquement les outils qui ont besoin du host VS Code (LSP, certains FS, intégrations workbench).

## Permissions

Modes usuels (`drox-permissions`) :

| Mode | Idée |
|------|------|
| `default` | Demander / restreindre selon règles |
| `plan` | Lecture / planification, mutations limitées |
| `acceptEdits` | Accepter les edits fichier plus largement |
| `bypassPermissions` | Moins de friction (dogfood / confiance) |
| `professor` | Mode pédagogique / guidé (si activé) |

Mapping UI fréquent (IDE) :

- `analyze` → `plan`
- `trustEdit` → `acceptEdits`
- `imNotCrazy` → `default`

Par run, le client peut aussi passer `disabledTools` et flags MCP.

## Hooks

Fichier projet optionnel : `.drox/hooks.json` (crate `drox-hooks`).

- **pre** / **post** tool : scripts ou actions configurées avant/après exécution.
- Permet d’auditer, bloquer, ou enrichir sans forker le moteur.

## Désactivation

- Outils retirés du registry / désactivés dans les params du run.
- Permissions deny → le modèle reçoit un résultat d’erreur / refus, pas l’effet de bord.

## Fichiers

- `drox-engine/drox/crates/drox-tools/src/registry.rs`
- `drox-engine/drox/crates/drox-permissions/`
- `drox-engine/drox/crates/drox-hooks/`
- `drox-engine/drox/crates/drox-cli/src/jsonrpc/remote_tool.rs`
- IDE : `src/vs/workbench/contrib/drox/common/droxClientTools.ts`
