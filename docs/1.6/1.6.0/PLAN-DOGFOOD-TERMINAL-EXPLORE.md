# 1.6.0 — Dogfood terminal + Explore (post Vague 4)

**Statut** : approche **validée** (dogfood ses_9efe968e) · P0–P2 code/procédure ✅ · smoke manuel dû  
**Parent** : [README 1.6.0](README.md) · [PLAN-CONTEXT-SITUATION](PLAN-CONTEXT-SITUATION.md) (S-5)

## Constat

Le modèle boucle parce que **le shell ment** (cwd UNC `\\?\`, stdout = scrollback stale) → re-bash / re-read → abort + contexte pollué.  
En parallèle, le parent **n’utilise pas Explore** assez tôt → lectures / synthèses gonflent le contexte parent alors que `task` isole le bruit.

## Fixes produit (ordre validé)

| Priorité | Fix | État |
|----------|-----|------|
| **P0** | Terminal agent : cwd **sans** `\\?\` ; isoler chaque commande ; ne jamais renvoyer le scrollback précédent comme stdout | ✅ sanitize cwd + marker stdout + delta fallback |
| **P0** | Classifieur : `powershell -Command` avec préfixes `[Console]::…=` + `Get-Content` = inspect-only | ✅ |
| **P1** | Hors-workspace lecture : autoriser `file_read` hors WS en lecture seule **ou** outil « import docs » propre (pas 60 bash) | ✅ `file_read` always `allow_outside` |
| **P1** | Gate : même `(file_read, path)` réussi ×N → nudge dur « stop re-read, write / answer » | ✅ seuil 3 + `REPEATED_FILE_READ_NUDGE` |
| **P2** | Dogfood : ouvrir le workspace **qui contient** la doc cible, ou copier la doc **dans** le projet avant le run | ✅ procédure ci-dessous |

## Procédure dogfood (P2)

Scénario « adapter la pédagogie / docs externes » :

1. **Préférer** ouvrir un workspace multi-root (ou le repo) qui **contient déjà** `docs/pedagogie` (ou la doc source).  
2. Sinon : **copier** la doc sous le projet cible (ex. `site-kdds/docs/…`) **avant** le run — ne pas compter sur 60 bash hors WS.  
3. Avec 1.6.0 : `file_read` accepte les chemins absolus hors WS, mais le modèle doit quand même **Explore** (`task`) pour les synthèses, pas `Get-Content` en boucle.  
4. Smoke attendu : au moins 1 `task` explore sur overview ; pas de re-read ×3 du même path ; bash cwd projet (pas `C:\Windows`).

## Explore / subagents — durcissement (validé)

**Objectif** : le parent délègue dès qu’il s’agit de **lecture large, synthèse, compréhension de sujet / zone** — pas seulement « overview repo ».

| Levier | Action | État |
|--------|--------|------|
| Prompt CORE + `SUBAGENTS_EXPLORE_SUPPLEMENT` | Default-to-Explore pour compréhension / multi-fichiers ; when-not = needle / 1–2 paths connus | ✅ |
| Description outil `task` | Même message when / when-not | ✅ |
| S-5 runtime | Seuil **2** ; compter tout `file_read` (y compris borné) + dumps bash | ✅ |
| Nudge | Texte explicite : synthèse / compréhension → `task` explore | ✅ |

**Bornes (pragmatiques, pas parfaites)** :

| Appeler `task` explore | Rester sur outils directs |
|------------------------|---------------------------|
| Comprendre un sujet / module / doc set | Needle : symbole ou fichier déjà nommé |
| Synthèse / architecture / « comment ça marche » | 1–2 `file_read` bornés sur paths connus |
| ≥3 fichiers ou dossiers inconnus à cartographier | Mutation / bash write |
| Relire une arbo pour adapter des pages | |

Pas de spawn auto à seuil de tokens (policy Cursor). Filet = prompts + soft-nudge S-5.

### Session master / mega-brief (post dogfood)

| Levier | Action | État |
|--------|--------|------|
| `must_return` | Champs numériques / listes structurées dans le brief enfant — pas d’heuristiques NL | ✅ |
| Protocol parent | Plan → Assign (`task`) → Merge reports | ✅ prompts + nudges |
| Télémetrie | `truncated` / `iterations` sur outcome Explore | ✅ |
| Rescue | Nudges post-fail + parent rescue si Explore incomplet | ✅ |
| `explore.mission.decompose` | Question modèle pour découper une mega-mission | ✅ |

## Liens code

| Zone | Chemin |
|------|--------|
| Terminal IDE | `src/vs/workbench/contrib/drox/electron-browser/tools/droxIdeBashTerminal.ts` |
| Classifieur bash | `drox-engine/.../drox-bash/src/classify.rs` |
| Prompts | `drox-cli/src/prompts.rs` |
| Tool `task` | `drox-tools/src/simple/task.rs` |
| `file_read` hors WS | `drox-tools/src/simple/file_read.rs` |
| Nudge S-5 / re-read P1 | `drox-engine/.../agent/nudges.rs` · `agent/situation/` · `drive.rs` |
| Session master / `must_return` | `task.rs` · `nudges.rs` · `situation/task_outcome.rs` · `drive.rs` |
| Decompose mega-mission | `modelQuestions/questions/exploreMissionDecompose.ts` |
