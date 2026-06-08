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

---

## Implémentation par phase

| Phase | Décisions actives |
|-------|-------------------|
| 0 | C10, C9 log, squelette rail flag off |
| 1 | C1–C3, C5 parse `[depth: complex]` |
| 2 | C4, C6 nudge + stop |
| 3 | C7, C8 |
