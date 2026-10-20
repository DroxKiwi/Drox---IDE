# Anti-loop — déclenchement & méthodes d’identification (état actuel)

**Code** : `drox-engine/.../agent/loop_detect/` + `agent/loop_close/` + branchements mince `drive.rs`  
**Nudges** : `drox-prompts` → `gates.loop_detected`, `gates.loop_tool_family`, `gates.loop_force_conclude`, `gates.repeated_file_read`  
**Statut** : actif · escalade **Warn → ForceConclude → SyntheticDone** (2026-10-15) · angle mort rotation multi-fichiers adouci (R1/R4)

Ce document décrit **l’état actuel** du détecteur et de la clôture anti-boucle.

---

## 1. Où ça vit dans le run

```text
LLM tour → gates [phase: done] / todos / testing …
         → LoopDetector::observe(outcome)          // empreinte du tour
         → exécution tools
         → LoopDetector::observe_tool_outputs(...) // même call + même output ?
         → (à part) compteurs file_read_success_counts → soft repeated_file_read
```

`observe` est volontairement **après** les gates `done` (1.5.14) : un modèle qui répète `[phase: done]` avec todo ouverte doit recevoir le nudge todos, pas un faux « loop » trop tôt.

---

## 2. Décisions (escalade « clôturer le run »)

**Produit** : finir le **run** (Stop propre) prime sur finir tout le chantier. Plus d’abort `LoopDetected` pour les filets M1–M4 — l’utilisateur négocie un prochain run plus court.

| Décision | Effet |
|----------|--------|
| `Ok` | Rien |
| `Warn { kind }` | System Prefer (`LOOP_DETECTED_*` / `LOOP_TOOL_FAMILY_*`) · `continue` |
| `ForceConclude { kind }` | System MustText (`LOOP_FORCE_CONCLUDE_*`) · **tools retirés** au prochain tour LLM · `continue` |
| `SyntheticDone { kind, turns }` | Texte assistant synthétique + `PhaseEnter(answering)` + `Stop` · **pas** `EngineError` |

Seuils typiques : **Warn** strike 1 · **ForceConclude** strike 2 · **SyntheticDone** strike ≥ 3 (détail §3).

`EngineError::LoopDetected` reste réservé à d’autres filets (ex. `intent_only_write` soft-abort), **pas** aux empreintes M1–M4.

---

## 3. Méthodes d’identification (4 filets)

### M1 — Empreinte stricte de tour (`observe`)

**Signature** : `hash(trim(text) ⊕ trim(thinking)) ⊕ hash(tool_calls name+args)`  
(`id` tool ignoré.)

| | |
|--|--|
| **Match** | Empreinte **identique** au tour précédent (consécutif) |
| **Warn** | strike 1 |
| **ForceConclude** | strike 2 |
| **SyntheticDone** | strike ≥ 3 |
| **Kinds** | `text` / `tool_calls` / `both` |
| **Contournement** | Changer un caractère de thinking, ou un path tool, ou l’ordre des calls → plus de match |

C’est le filet historique « copy-paste exact du tour ».

### M2 — Body text-only (L-2)

**Quand** : pas de `tool_calls` + body assistant non vide.

| | |
|--|--|
| **Signature** | `hash(trim(text))` — **thinking ignoré** |
| **Match** | Même body que le tour text-only précédent |
| **Warn** | strike 1 |
| **ForceConclude** | strike 2 |
| **SyntheticDone** | strike ≥ 3 |
| **But** | Modèle qui régénère la même réponse en variant seulement le monologue natif |

### M3 — Famille tools normalisée (`bash` / `grep` seulement)

**Quand** : **tous** les tools du tour ∈ `{bash, grep}`.

| | |
|--|--|
| **Signature** | args normalisés (bash : commande canonisée ; grep : pattern/path/glob lower + `/`) |
| **Match** | Même famille hash **même si thinking change** |
| **Warn** | family_strike 1 |
| **ForceConclude** | family_strike 2 |
| **SyntheticDone** | family_strike ≥ 3 |
| **Hors scope** | `file_read`, `glob`, `task`, `file_edit`, … → **pas** cette voie |

### M4 — Progrès tools (`observe_tool_outputs`)

**Quand** : après exécution, round non vide.

| | |
|--|--|
| **Signature call** | Même ensemble `(name, args)` que le round précédent |
| **Signature out** | Hash du blob d’outputs passé au modèle |
| **Match** | Même call **et** même output |
| **Warn** | strike 1 |
| **ForceConclude** | strike 2 |
| **SyntheticDone** | strike ≥ 3 |
| **Reset** | Call différent **ou** output différent (polling légitime) |

Utile si le modèle rejoue exactement le même tool avec le même résultat. Inefficace si les paths tournent (A→B→C).

---

## 4. Soft voisin (pas dans `LoopDetector`)

### S1 — `gates.repeated_file_read`

| | |
|--|--|
| **Compteur** | `file_read` **réussis** par path normalisé |
| **Seuil** | `REPEATED_FILE_READ_NUDGE_THRESHOLD` = **3** |
| **Effet** | **Un** message Prefer one-shot / run |
| **Pas d’abort** | Le modèle peut ignorer |

---

## 5. Resets du détecteur

`loop_detector.reset()` remet strikes + signatures tools.

**Ne reset plus** (L-1) : nudges `DONE_ONLY` / générique « continue or conclude » — sinon oubli de `done` = boucle jusqu’à `max_iterations`.

**Reset OK** : nudges structurels (todo ouverte, testing dû, InvalidArgs args nouveaux, context-load one-shot, etc.) — documentés au fil de `drive.rs`.

---

## 6. Angle mort dogfood (2026-10-07)

Pattern observé : centaines de `file_read` en **rotation** sur 2–3 paths UI (`page` / `layout` / `DocsSidebar`).

| Filet | Pourquoi ça rate |
|-------|------------------|
| M1 | Thinking + path changent → empreinte ≠ |
| M2 | Il y a des tool_calls |
| M3 | `file_read` ∉ famille |
| M4 | Call signature change à chaque path |
| S1 | Soft one-shot ; dose insuffisante |

→ **Livré (soft Prefer, 2026-10-07)** : `runtime.rotating_file_read` — fenêtre 10, ≥6 `file_read`, ≥2 paths chacun ≥2× ; reset sur mutation / `todo_write` / Explore. Complété par `runtime.post_merge_closure` après `task` OK.  
→ **Renforcé (2026-10-12)** : **R1** Prefer ré-injecté tous les 4 reads ; **R4** stub `[already_read]` dès ≥3 `file_read` même path (plus de re-IO).

→ **Suite 2026-10-12** (dogfood `ses_d4220fc4…` puis `ses_0ce29dd7…`) :
- **E1** `runtime.explore_covered_reread` — paths `paths_read` **+** fichiers kind `artifacts.*`
- **E2/E2b** `runtime.post_explore_stall_act` — seuil **1** heavy read ; hit kind → Prefer act immédiat
- **A** `runtime.explore_artifact_read_fail` — après erreur/orphan artifact_read, interdire psychologiquement le `file_read` kind
- **F1/F2** — ne plus spiller le merge (`task` / `explore_artifact_read` 64 KiB ; hot-snip `EXPLORE MERGE PRESERVED`)  
Détail : [APPROCHE §3bis](APPROCHE-CONTRATS-ETAPE.md) · [CONCENTRATION §9–10](PLAN-CONCENTRATION-CONTEXTE.md).

---

## 7. Escalade ForceConclude / SyntheticDone (2026-10-15)

Dogfood `ses_a215b2e4…` : diagnostic OK puis boucle bash (shell mort `O/N` + retries) → abort rouge inutile.

| Étape | Intent |
|-------|--------|
| Warn | Soft — changer d’outil / conclure |
| ForceConclude | Fermer le run côté modèle : **pas de tools**, MustText answering+done |
| SyntheticDone | Si le modèle ignore encore → clôture **moteur** (texte status + Stop) |

Lot 2 (non livré ici) : détection shell poison (`Terminer le programme`, build 300 ms stdout vide) → court-circuiter vers ForceConclude.

## 8. Fichiers & tests

| Rôle | Fichier |
|------|---------|
| Detector (arbo n+1) | `agent/loop_detect/` (`detector`, `decision`, `fingerprint`, `outcome`) |
| Clôture propre | `agent/loop_close/` (`synthetic`) |
| Branchement mince | `agent/run/drive.rs` |
| Tests | `agent/tests/loop_tests.rs` |
| Bodies | `drox-prompts/src/gates.rs` (`LOOP_FORCE_CONCLUDE_*`) |
| Checklist historique Vagues | [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md) |
