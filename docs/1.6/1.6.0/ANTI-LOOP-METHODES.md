# Anti-loop — déclenchement & méthodes d’identification (état actuel)

**Code** : `drox-engine/.../agent/loop_detect.rs` + branchements `drive.rs`  
**Nudges** : `drox-prompts` → `gates.loop_detected`, `gates.loop_tool_family`, `gates.repeated_file_read`  
**Statut** : actif en prod moteur · **angle mort** documenté (relecture rotative multi-fichiers) — cible chantier post-dogfood 2026-10-07

Ce document décrit **ce qui existe**, pas la cible idéale.

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

## 2. Décisions

| Décision | Effet |
|----------|--------|
| `Ok` | Rien |
| `Warn { kind }` | Injecte un system Prefer (`LOOP_DETECTED_*` ou `LOOP_TOOL_FAMILY_*`) · `continue` (prochain tour LLM) |
| `Abort { kind, turns }` | `EngineError::LoopDetected` · fin de run |

Seuils typiques : **warn** aux 1ers strikes, **abort** ensuite (détail par méthode ci-dessous).

---

## 3. Méthodes d’identification (4 filets)

### M1 — Empreinte stricte de tour (`observe`)

**Signature** : `hash(trim(text) ⊕ trim(thinking)) ⊕ hash(tool_calls name+args)`  
(`id` tool ignoré.)

| | |
|--|--|
| **Match** | Empreinte **identique** au tour précédent (consécutif) |
| **Warn** | strike 1 et 2 |
| **Abort** | strike ≥ 3 |
| **Kinds** | `text` / `tool_calls` / `both` |
| **Contournement** | Changer un caractère de thinking, ou un path tool, ou l’ordre des calls → plus de match |

C’est le filet historique « copy-paste exact du tour ».

### M2 — Body text-only (L-2)

**Quand** : pas de `tool_calls` + body assistant non vide.

| | |
|--|--|
| **Signature** | `hash(trim(text))` — **thinking ignoré** |
| **Match** | Même body que le tour text-only précédent |
| **Warn** | 1er strike |
| **Abort** | 2e strike (hard rapide) |
| **But** | Modèle qui régénère la même réponse en variant seulement le monologue natif |

### M3 — Famille tools normalisée (`bash` / `grep` seulement)

**Quand** : **tous** les tools du tour ∈ `{bash, grep}`.

| | |
|--|--|
| **Signature** | args normalisés (bash : commande canonisée ; grep : pattern/path/glob lower + `/`) |
| **Match** | Même famille hash **même si thinking change** |
| **Warn** | family_strike 1–2 |
| **Abort** | family_strike ≥ 3 |
| **Hors scope** | `file_read`, `glob`, `task`, `file_edit`, … → **pas** cette voie |

### M4 — Progrès tools (`observe_tool_outputs`)

**Quand** : après exécution, round non vide.

| | |
|--|--|
| **Signature call** | Même ensemble `(name, args)` que le round précédent |
| **Signature out** | Hash du blob d’outputs passé au modèle |
| **Match** | Même call **et** même output |
| **Warn** | 1er strike |
| **Abort** | 2e+ |
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

→ **Livré (soft Prefer, 2026-10-07)** : `runtime.rotating_file_read` — fenêtre 10, ≥6 `file_read`, ≥2 paths chacun ≥2× ; reset sur mutation / `todo_write` / Explore. Complété par `runtime.post_merge_closure` après `task` OK. Pas d’abort V1.

---

## 7. Fichiers & tests

| Rôle | Fichier |
|------|---------|
| Detector | `agent/loop_detect.rs` |
| Branchement | `agent/run/drive.rs` |
| Tests | `agent/tests/loop_tests.rs` |
| Bodies | `drox-prompts/src/gates.rs` |
| Checklist historique Vagues | [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md) |
