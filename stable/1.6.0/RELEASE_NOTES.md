# Drox IDE 1.6.0

## Stabilisation agent (boucles · contexte · compaction)

Correctifs moteur pour les boucles de réponse et les explosions de contexte observées en dogfood (locaux / GLM flash), **sans** changer le paradigme phases / MEMORY / régulation.

### Filets anti-boucle

- **L-1** — les nudges `DONE_ONLY` / générique ne remettent plus le LoopDetector à zéro.
- **L-2** — hard-stop si le même texte assistant se répète sans tool (thinking ignoré) : warn @2, abort @3.
- **L-tools** — détection `(tool, args)` répétée avec output identique ; output différent = progrès (polling).
- **L-3** — nudges mid-run repliés dans le bloc `system` unique (OpenAI / Ollama) : plus de faux message `user` `[System reminder]`.

### Contexte & compaction

- **C-1 / C-3** — après snip / microcompact / compaction live, le transcript JSONL IDE est **réécrit** (comme le TUI) et le curseur de flush recalibré.
- **C-2** — `session.compact` / `/compact` persiste le transcript quand la compaction live s’applique (`transcriptRewritten`).
- **T-1** — résultats d’outils > ~48 KiB spillés sous `.drox/tool-outputs/` ; le modèle reçoit un pointeur + aperçu.

### UI

- **G-1** — jauge contexte Agents : suffixe `estim.` (RoughTokenCounter) vs `provider` (`usage.input_tokens`).
- Shell cards dépliables (commande + sortie) ; Skip sur bash bloqué ; Agents : sortie terminal dans le panneau collapsible.
- **Max iterations** — plafond relevé à **1000** (settings + panneau Server) pour les gros plans.
- **Chip serveur** — connexion détectée dès qu’une URL `drox.server` est présente (plus d’état « Connect » fantôme si `llmHosting` absente) ; scroll horizontal si la barre est étroite.
- **Parité IDE ↔ Agents** — chips Server / Model / max iterations montés dans la barre d’input IDE (comme `NewChatInput` Agents), pas seulement la secondary toolbar ; CSS aussi sous `.drox-discussion-shell`.
- **Accounts** — icône compte (activity bar IDE) et accès Sign In Copilot / GitHub masqués en build Drox (`droxMicrosoftAgentsSurfaceEnabled` off) ; widget compte Agents déjà gated.
- **Max iterations** — aussi editable dans **Model settings** (section Agent), en plus de Server settings ; chip Server affiche `×N`.

### Dogfood terminal · Explore · lectures (post Vague 4)

- **Terminal** — cwd sans préfixe `\\?\` ; isolation stdout (marqueur + pas de scrollback stale) ; shell agent Windows = `cmd.exe`.
- **Classifieur bash** — préfixes PowerShell `[Console]::…=` + `Get-Content` / listings = inspect-only.
- **`file_read` hors workspace** — chemins absolus autorisés en lecture seule (écritures toujours gated).
- **Anti re-read** — même path `file_read` ×3 → nudge dur.
- **Explore** — prompts / outil `task` / nudge S-5 durcis (default-to-Explore pour compréhension / synthèse).
- **Explore ferme (1.6 dogfood)** — annex turn-0 si intent docs (« prendre connaissance », `docs/pedagogie`, calquer/remplacer documentation) → premier tool = `task` Explore ; CORE sans « explore freely » ; S-5 seuil **1** + `glob`/`grep` comptés.
- **Explore live** — avancement sub-agent streamé dans la carte chat (activité tools + rapport partiel, panneau scrollable type file-change).
- **Explore master (rescue)** — protocole session master **Plan → Assign → Merge** ; briefs avec `must_return` (champs numériques, pas de prose NL) ; télémetrie `truncated` / `iterations` ; nudges post-fail + rescue.
- **Situation card** — module `agent/situation/` (card, paths, todos, task_outcome) ; arbo n+1 depuis `situation.rs`.

### Project rules (`.drox/rules`)

- Règles style Cursor (`*.instructions.md` / `.mdc`) sous `.drox/rules/` (workspace) et `~/.drox/rules/` (user).
- Injection auto dans `agent.run` selon `alwaysApply` / `applyTo` / `globs`.
- Setting **`drox.rules.enabled`** (défaut ON) + toggle dans General settings ; OFF = pas d’inject + Customizations sans liste rules (`DROX.md` / MEMORY / Skills inchangés).

## Prérequis

- Windows 10+ (64 bits) / Linux x64
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Windows)
- [Ollama](https://ollama.com/) (recommandé) ou endpoint OpenAI-compatible

## Licence

MIT — Code OSS (Microsoft) + portions Drox (KDDS). Voir [NOTICE.md](../../NOTICE.md).
