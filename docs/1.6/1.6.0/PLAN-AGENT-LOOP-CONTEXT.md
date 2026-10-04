# PLAN — Agent loop · contexte · compaction (1.6.0)

**Objectif** : éliminer (ou borner durement) les boucles de réponse et les explosions de contexte sans changer le paradigme Drox.  
**Baseline** : [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md)  
**Checklist opérable** : **[ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)** ← suivre ce fichier pour appliquer

---

## Non-objectifs

- Remplacer le protocole de phases (`analyzing` / `acting` / `answering` / `done`).  
- Abandonner MEMORY/DROX ou la régulation L1–L5.  
- « Fine-tuner » un modèle spécifique.  
- Refonte UI chat hors jauge / export debug.  
- MCP lazy discovery façon Cursor (backlog post-1.6.0).

---

## Ordre figé (décision produit)

```text
Vague 1 — filets     : L-1 → L-2 → C-1 (+ C-3)
Vague 2 — contexte   : T-1 → L-tools → G-1 → C-2
Vague 3 — preuve     : OBS-1 → OBS-2 → L-3 (optionnel)
Clôture              : dogfood → RELEASE_NOTES → CLOSURE → ship
```

Détail des actions, fichiers, tests et smokes : [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md).

---

## Lots (index IDs)

### LOOP

| ID | Tâche | Vague |
|----|--------|-------|
| L-1 | Retirer `loop_detector.reset()` sur nudges `DONE_ONLY` / générique | 1 |
| L-2 | Hard-stop après N réponses textuelles identiques sans tool (warn@2, hard@3) | 1 |
| L-tools | Hash `(tool, args)` global, progress-aware | 2 |
| L-3 | Nudges sans faux `user` `[System reminder]` (providers locaux) | 3 opt. |
| L-4 | Doc contrat « quand le moteur rappelle le modèle » | avec L-1/L-2 |

### COMPACT

| ID | Tâche | Vague |
|----|--------|-------|
| C-1 | Réécrire le transcript après compaction live JSON-RPC | 1 |
| C-3 | Recalibrer curseur `flush_transcript` après shrink | 1 |
| C-2 | Aligner `/compact` / `session.compact` | 2 |

### TOOLS / GAUGE / OBS

| ID | Tâche | Vague |
|----|--------|-------|
| T-1 | Gros tool results → fichier + pointeur | 2 |
| G-1 | UI `estim.` vs `provider` tokens | 2 |
| G-2 | Log ratio estimate/provider (debug) | avec G-1 / OBS |
| OBS-1 | Unlock debug prod (token / setting) | 3 |
| OBS-2 | Export `messages[]` par itération | 3 |
| OBS-3 | (= G-1 côté affichage) | 2 |

---

## Preuves d’acceptation (dogfood)

| Scénario | Avant | Cible Vague 1 | Cible Vague 2 |
|----------|-------|---------------|---------------|
| GLM/local flash répète la même réponse | ×2–12 jusqu’à max_iter | Stop ≤ 3 | idem |
| Message après compact | JSONL / jauge ×~2 | JSONL compacté | + jauge lisible |
| `file_read` même range en boucle | jusqu’à max_iter | partiel | stop hash tools |
| Gros Explore / stdout | explosion contexte | — | spill fichier |
| Export debug prod | impossible | — | unlock + dump |

---

## Fichiers touchés (indicatif)

- `drox-engine/.../agent/run/drive.rs`  
- `drox-engine/.../agent/run/lifecycle.rs`  
- `drox-engine/.../agent/loop_detect.rs`  
- `drox-engine/.../compaction/live.rs`  
- `drox-engine/.../drox-cli/.../handlers/mod.rs`  
- `drox-engine/.../drox-tui/.../commands.rs` (réf. `rewrite_transcript`)  
- `drox-engine/.../drox-llm/...` (L-3)  
- `src/vs/workbench/contrib/drox/browser/agents/*` (G-1, OBS)  
- Tests : `loop_tests.rs` · lifecycle / compact

---

## Liens

- [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)  
- [README 1.6.0](README.md)  
- [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md)
