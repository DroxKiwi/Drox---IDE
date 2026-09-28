# 10 — Décisions produit figées (juin 2026)

**Parent** : [README](README.md)

---

| ID | Décision |
|----|----------|
| **C1** | Depth `short` : candidate après `READ` = **`ACT`** (pas `PROPOSE`) |
| **C2** | Runs **discuss / analyze** : **pas de rail** (comportement actuel inchangé) |
| **C3** | Marqueurs `[gate: hold]` / `[gate: advance]` |
| **C4** | Hold PROPOSE : attendre message user — **pas** `ask_user_question` forcé |
| **C5** | Depth `complex` : **modèle seul** via `[depth: complex]` — **pas** d’heuristique mots-clés moteur ; prompts/nudges **EN** |
| **C6** | Échec ACT : **nudge sévère** puis coupure run (v1) ; rattrapage progressif à affiner |
| **C7** | Seuils segment : choix dev (fichier ~8 Ko, 2 strikes même path) |
| **C8** | Rapport segment : **JSON interne**, persistant par projet sous `.drox/` |
| **C9** | Investigation `file_edit` en parallèle — voir [INVESTIGATION-file-edit.md](INVESTIGATION-file-edit.md) |
| **C10** | `droxVersion` **1.4.0** |
| **C11** | **Partition phase / rail** — rail on : progression + UI station = rail ; phase = `answering` + `done` + `internal_reasoning` ; phases intermédiaires silencieuses (pas de `PhaseEnter`) — détail [11-PHASE-RAIL-CONVERGENCE.md](11-PHASE-RAIL-CONVERGENCE.md) |
| **C12** | **Auto-advance heuristique** — le moteur avance la station depuis outils / type de tour si pas de `[gate:]` ; `[gate:]` / `[depth:]` l’emportent |
| **C13** | Clôture run = **`[phase: done]`** conservé (v1) — pas de `railRunComplete` avant dogfood signé |
| **C14** | Gate L2 testing : si rail actif, exiger **visite VERIFY** (pas `[phase: testing]`) |
| **C15** | Discuss : `literal_user_message` sans `[phase:]` — `[discussion: reply/done]` seulement |
| **C16** | Brief segment = **payload mutation** (`edits` / `contents` + libellé todo) — pas « pending mutation » seul — [12-SEGMENT-ACT-FIXES.md](12-SEGMENT-ACT-FIXES.md) |
| **C17** | **pre_gate avant exécution** : station effective = preview infer pour l’outil (bloquer mutation hors ACT/VERIFY) |
| **C18** | Pas de segment si le parent a **déjà muté** le même `path` dans le run |
| **C19** | Station **PLAN** = `todo_write` (+ reads) seulement ; mutations en **ACT** |
| **C20** | Segments : filtre phase C11 dans sous-boucle ; option désactivation preset `strict` |

---

## Implémentation par phase

| Phase | Décisions actives |
|-------|-------------------|
| 0 | C10, C9 log, squelette rail flag off |
| 1 | C1–C3, C5 parse `[depth: complex]` |
| 2 | C4, C6 nudge + stop |
| 3 | C7, C8 |
| 4 | UI U2/U3, export, preset `normal` rail on |
| **5** | **C11–C15** — convergence phase/rail + auto-advance — [11-PHASE-RAIL-CONVERGENCE.md](11-PHASE-RAIL-CONVERGENCE.md) |
| **5b** | **C16–C20** — segments ACT + pre_gate — [12-SEGMENT-ACT-FIXES.md](12-SEGMENT-ACT-FIXES.md) |
