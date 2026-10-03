# Fix — redirects bash scratch / hors workspace = inspect-only

**Maj** : 1.5.22  
**Statut** : ✅ corrigé  
**Dogfood** : audit `site-kdds` — `git show … > %TEMP%\drox_env_hist.txt` compté à tort comme bash mutateur → gates `todo_write` / « N mutating tools » / confusion testing.

## Problème

`command_is_inspect_only` traitait **tout** `>` / `>>` (hors nul) comme mutation, **sans regarder la destination**.

Conséquence modèle-agnostique : dès qu’un modèle parque une sortie d’inspection hors projet (`%TEMP%`, `/tmp`, …), le moteur exigeait un plan / traitait le shell comme mutateur, alors qu’aucun fichier du workspace n’était touché.

## Correctif (généraliste)

Classification par **chemin de destination**, pas par modèle ni par pattern de prompt :

| Destination du redirect | Gate todo / step-tracking / phase |
|-------------------------|-----------------------------------|
| `%TEMP%`, `%TMP%`, `$TMPDIR`, `/tmp`, `AppData\Local\Temp`, `temp_dir()` process | **inspect-only** |
| `nul` / `/dev/null` | déjà ignoré |
| Chemin relatif (`> src/x`) | **mutateur** |
| Absolu **sous** le workspace | **mutateur** |
| Absolu **hors** workspace (si root connu) | **inspect-only** |

API :

- `has_workspace_affecting_file_redirect(cmd, workspace?)`
- `command_is_inspect_only` → délègue (scratch OK sans workspace)
- `command_is_inspect_only_with_workspace` — utilisé par `agent.rs` avec `ctx.workspace_root`

Fichiers : `drox-bash/src/classify.rs`, appels gates dans `drox-engine/src/agent.rs`, message de blocage + note prompts.

## Tests

- `scratch_redirects_are_inspect_only_for_gates`
- `workspace_aware_absolute_redirects`
- agent : `requires_todo_write_gate` n’exige pas de todo pour `git show … > %TEMP%\…`

## Bonus lié

`git cat-file` ajouté à `GIT_READ` (lecture pure) — souvent utilisé avec redirect temp dans les audits.

## Hors scope

- Permissions shell / deny destructif inchangés.
- Gate testing « code mutation » : les segments `git` restent exempts ; ce fix vise surtout todo / mutating-bash.

## Pour dogfooder

Rebuild le binaire moteur (`drox.exe`) puis relancer Drox — le fix est dans `drox-bash` / `drox-engine`, pas seulement l’IDE TS.
