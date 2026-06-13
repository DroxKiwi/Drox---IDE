# Plan 1.4.1.2a — Context diet (injection prompt)

**Version** : juin 2026 — **patch moteur** sur branche `1.4.1`  
**Parent** : [PLAN-1.4.1](PLAN-1.4.1.md)  
**Prérequis** : [PLAN-1.4.1.1](PLAN-1.4.1.1.md) clôturé (intent probes + English engine)  
**Suite** : [PLAN-1.4.1.2](PLAN-1.4.1.2.md) (rail / clôture / VERIFY) — **après** ce plan  
**Transcripts** : [`chat_qwen27b.txt`](../../chat_qwen27b.txt) (`ses_3c6ec330`, `ses_3eb8a6d5`)

> Réduire le **bruit d’injection** à chaque tour LLM : moins de snapshots redondants, moins de manuel outil inutile, profils compacts par station rail. **Pas** la refonte complète [CONTEXT-BUBBLES](../../1.3/1.3.2/gates/CONTEXT-BUBBLES.md) (→ 1.4.2 / 1.4.3).

---

## En une phrase

Le moteur **push** trop de contexte statique et répété ; sur Qwen 2.7B ça étouffe la réflexion, les retests et les secondes passes VERIFY — ce plan **allège** l’injection avant les patches rail de [PLAN-1.4.1.2](PLAN-1.4.1.2.md).

---

## Pourquoi maintenant (avant le rail pur)

| Signal smoke `ses_3c6ec330` | Lecture |
|----------------------------|---------|
| **77 912 tokens in** / **59 103 ctx** | Fenêtre saturée sur un brief plan+SVG |
| Boot OK (pas de « light message ») | Intent 1.4.1.1 aide — ne suffit pas |
| **B-CYCLE-01** | Pas de marge pour reopen VERIFY→ACT |
| **B-PROPOSE-01** | Trop de règles concurrentes dans le system |
| Erreurs `file_write` JSON | Moins de tokens pour générer des tool calls valides |
| Thinking « je relis le plan » | **B-MOTOR-01** — snapshots réinjectés identiques |

**Famille dogfood F — surcharge contexte** (complète A–E de [PLAN-1.4.1.2](PLAN-1.4.1.2.md)) :

```text
F. Context diet        push excessif — snapshots + 9 protocoles outil + historique gros file_read
```

---

## Ce qui s’empile aujourd’hui (cartographie code)

| Couche | Fichier / zone | Quand | Problème |
|--------|----------------|-------|----------|
| Noyau + 9× protocole outil | `prompts/.../edit/01_core_rail_solo.md`, `tools/mod.rs` | Boot system (reste dans `messages[]`) | Tout le manuel dès le tour 1 |
| `## Architect run (engine)` | `run_snapshot.rs`, `iteration_start.rs` | **Chaque tour** | Brief + todos + focus + paths même si inchangés |
| `## Run rail (engine)` | `rail/snapshot_block.rs`, `refresh_snapshot` | **Chaque tour** | Hints advance/hold/verify répétés |
| Tool results | Transcript | Croît | `home-content.tsx` ~9,5 Ko relu à chaque tour suivant |
| Nudges | `agent/nudges/*` | Sur erreur | Corrects mais cumulatifs |

**Principe cible** : *push minimal par défaut* — réinjecter seulement ce qui a **changé** ou ce qui est **requis par la station courante**.

---

## Backlog 1.4.1.2a

| ID | Sujet | Phase | Priorité | Statut |
|----|-------|-------|----------|--------|
| **B-CTX-02a** | Snapshots dédupliqués (fingerprint tour N−1) | P1 | P0 | ☑ code |
| **B-CTX-02b** | Protocoles outil **par station** rail | P2 | P0 | ☑ code |
| **B-CTX-02c** | Profils snapshot architecte par station | P3 | P1 | ☐ |
| **B-CTX-02d** | Rail snapshot compact si état stable | P3 | P1 | ☐ |
| **B-CTX-02e** | Observabilité : log taille snapshots / tour | P4 | P1 | ☐ |
| **B-MOTOR-01** | (partiel) Préambules thinking — chevauche 02a/d | P1–P3 | P1 | ☐ |

**Hors scope 2a** : allocator narrative/code 50k/70k · bulles TOML · GraphContext ([1.4.3](../1.4.3/PLAN-1.4.3.md)) · compaction transcript (déjà partiel en 1.4.0).

---

## Synthèse par thème

### P1 — Déduplication snapshots — B-CTX-02a

**Patch** :

1. Fingerprint stable (`architect_run` + `run_rail` : station, depth, todos hash, verify_outcome).
2. Si identique au tour précédent → **ne pas** `push` nouveau `Message::system` (garder le dernier).
3. Fichiers : `agent/state/snapshot.rs`, `iteration_start.rs`, `rail/snapshot_block.rs` (`refresh_*`).
4. Tests : deux tours consécutifs même état → un seul bloc snapshot architect + un seul rail.

**Critère** : logs `snapshot_skip=unchanged` ; thinking mid-run moins de « I re-read the plan ».

---

### P2 — Outils par station — B-CTX-02b

**Aujourd’hui** : `tool_supplements_all_architect` injecte **9 blocs** au boot (`edit.rs`).

**Patch** :

| Station | Protocoles injectés (system ou tour 0 station) |
|---------|--------------------------------------------------|
| READ / INTENT | `workspace_map_read`, `file_read`, `grep`, `glob` |
| PLAN / PROPOSE | + `todo_write` |
| ACT | + `file_edit`, `file_write` |
| VERIFY | + `bash`, `lsp` |
| ANSWER | (aucun protocole mutation) |

Les **schemas** function-calling restent filtrés par `filter_tool_specs_for_station` — aligner le **texte** procédural sur le même découpage.

**Fichiers** : `tools/mod.rs`, `prompts/system/gates/edit.rs`, évent. hook `iteration_start` si injection différée.

---

### P3 — Profils compacts — B-CTX-02c / B-CTX-02d

**Architect snapshot** (`run_snapshot.rs`) — profils par `RunStation` :

| Station | Sections gardées |
|---------|------------------|
| INTENT / READ | User request + « explore » |
| PLAN / PROPOSE | User request + todos |
| ACT | Focus task + todos |
| VERIFY | Focus + chemins modifiés (pas sample workspace entier) |
| ANSWER | User request + résumé todos (1 ligne) |

**Rail snapshot** : si `advance_hint` + `verify_line` inchangés → version **une ligne** (`Station: act · advance when done`).

---

### P4 — Observabilité — B-CTX-02e

- `tracing` : `context.architect_snapshot_bytes`, `context.rail_snapshot_bytes`, `context.messages_count` par tour.
- Export dogfood : noter avant/après dans `chat_qwen27b.txt` header ou Output moteur.

---

## Tableau d’exécution

| # | ☐ | Action | Fichier | ID |
|---|-----|--------|---------|-----|
| 0.1 | ☐ | Mesurer baseline `ses_3c6ec330` (tokens/tour ACT) | doc / logs | — |
| 1.1 | ☑ | Fingerprint + skip snapshot architecte identique | `state/snapshot.rs` | B-CTX-02a |
| 1.2 | ☑ | Fingerprint + skip snapshot rail identique | `rail/snapshot_block.rs` | B-CTX-02a |
| 1.3 | ☑ | Tests unit skip / refresh | `state/`, `rail/` | B-CTX-02a |
| 2.1 | ☑ | `tool_supplements_for_station(station)` | `tools/mod.rs` | B-CTX-02b |
| 2.2 | ☑ | Boot edit : noyau seul ; protocoles par station à chaque tour | `gates/edit.rs`, `iteration_start.rs` | B-CTX-02b |
| 3.1 | ☐ | `RunSnapshotProfile` par station | `run_snapshot.rs` | B-CTX-02c |
| 3.2 | ☐ | Rail block mode compact | `snapshot_block.rs` | B-CTX-02d |
| 4.1 | ☐ | Logs taille contexte par tour | `iteration_start.rs` | B-CTX-02e |
| 5.1 | ☐ | Re-smoke R1c brief plan+SVG | `chat_qwen27b.txt` | gate |
| 5.2 | ☐ | Comparer −30 % tokens in tours ACT (cible) | doc | gate |

### Gates

| Gate | Critère |
|------|---------|
| **G-test** | `cargo test -p drox-engine` vert |
| **G-build** | `cargo build -p drox-cli` |
| **G-diet-smoke** | R1c : boot OK ; tokens in ACT mid-run **≤ 70 %** baseline `ses_3c6ec330` |
| **G-diet-func** | Pas de régression : todos visibles en ACT ; VERIFY voit rappel bash/LSP |

---

## Critères de clôture 1.4.1.2a

- [ ] Snapshots architect + rail **non réinjectés** si fingerprint inchangé
- [ ] Protocoles outil **scoped station** (pas 9 blocs au boot)
- [ ] Profil snapshot **plus court** en VERIFY / ANSWER qu’en READ
- [ ] Logs taille contexte par tour documentés
- [ ] **G-diet-smoke** sur brief `site-kdds` plan+SVG
- [ ] `cargo test -p drox-engine` vert

**Ensuite seulement** : démarrer [PLAN-1.4.1.2](PLAN-1.4.1.2.md) (rail B-RAIL-02, B-MOTOR-05…).

---

## Liens

- [PLAN-1.4.1.1](PLAN-1.4.1.1.md) — prérequis
- [PLAN-1.4.1.2](PLAN-1.4.1.2.md) — suite (rail)
- [README 1.4.1](README.md) — feuille de route
- [CONTEXT-BUBBLES](../../1.3/1.3.2/gates/CONTEXT-BUBBLES.md) — vision long terme
- [08-gates-nudges-etat](../../1.4/moteur/08-gates-nudges-etat/README.md) — doc moteur snapshots
