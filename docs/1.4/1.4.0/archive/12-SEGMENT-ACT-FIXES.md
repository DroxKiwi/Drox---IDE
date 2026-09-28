# 12 — Correctifs segments ACT + pre_gate (dogfood juin 2026)

**Parent** : [README](README.md) · **Suite** : [11-PHASE-RAIL-CONVERGENCE.md](11-PHASE-RAIL-CONVERGENCE.md) · **Segments** : [04-SEGMENTS.md](04-SEGMENTS.md)

**Statut** : **spécifié — à implémenter avant CLOSURE 1.4.0** (bloque dogfood multi-fichiers / Qwen 27B)

**Preuve** : [`chat_qwen27b.txt`](../../../1.3/chat_qwen27b.txt) — session `ses_a131c190` (README OK + feature lentille **non livrée**)

---

## Contexte

Phase 5 (convergence phase/rail + auto-advance) est **partiellement validée** :

| Critère | Statut dogfood |
|---------|----------------|
| G1 `railStation*` | ✅ `intent→read`, `read→plan`, `plan→act` |
| G2 pas de `PHASE · reading` (parent) | ✅ |
| G3 `[phase: done]` | ✅ sur tâche README |
| G4 `pre_gate` observable | ❌ zéro blocage dans l’export |
| Feature lentille (5 todos) | ❌ 1/5 seulement (`layout.tsx`) |

Le rail **principal** tient. La chaîne **PLAN → mutation → segment ACT** casse avec Qwen 27B dès qu’un `todo_write` déclenche un segment.

---

## Symptômes observés

### S1 — Brief segment vide (« pending mutation »)

Le segment reçoit (code actuel `segment/trigger.rs`) :

```text
Apply the architect's pending mutation for `{path}` using `{tool_name}`.
Parent ACT step count: N. Use only scoped paths.
```

Le modèle segment **n’a pas** le diff, les `edits`, ni le libellé todo. Qwen 27B enchaîne ~150 steps UI à fouiller `.drox/rail-segments/`, sessions JSONL, grep — sans jamais appliquer l’edit attendu au premier essai.

### S2 — Double travail parent + segment

| Step export | Événement |
|-------------|-----------|
| 101 | Architecte `file_edit` sur `layout.tsx` **en station PLAN** |
| 103–105 | Rail `plan→act` + `RAIL SEGMENT START` même tâche |
| 1450+ | Après reprise user, **2ᵉ** `file_edit` + **2ᵉ** segment identique |

L’architecte mute avant le segment ; le segment relance la même tâche sans savoir ce qui a déjà été fait.

### S3 — `pre_gate` inefficace en pratique

Aucun message `Run rail: tool … not allowed in station …` dans l’export.

**Cause** : `infer` / transition rail s’appliquent **après** le tour assistant ; `pre_gate` lit `state.station` **avant** exécution outil. Si le tour contient `file_edit` sans `[gate:]`, la station peut encore être READ/PLAN au moment du `pre_gate`, mais l’outil passe quand même (timing + infer post-tour).

Fichiers concernés : `loop.rs` (ordre hooks), `infer.rs`, `pre_gate.rs`, `gates.rs`.

### S4 — Plan todo non piloté

- `todo_write` 5 tâches (lentille) affiché en UI
- Tâche 1 reste `in_progress` alors que le segment rapporte `completed`
- Tâches 2–5 (`globals.css`, `LensSection`, `home-content.tsx`, verify) **jamais lancées**

### S5 — Phases legacy dans les segments

Les sous-boucles segment émettent `PHASE · reading` / `acting` (C11 non appliqué aux segments). Bruit UI massif (6047 events journal / 263 steps export).

### S6 — Infra (hors scope moteur)

Erreurs HTTP Ollama (steps 68, 127) → messages user dupliqués, reprises « Tu peux reprendre ? ».

---

## Causes racines (moteur)

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. SegmentSpawnRequest.brief = méta-instruction sans payload │
│    (trigger.rs L64–68)                                       │
├─────────────────────────────────────────────────────────────┤
│ 2. Spawn segment sur todo in_progress SANS diff parent       │
│    (todo_hit seul déclenche segment — trigger.rs L50–54)    │
├─────────────────────────────────────────────────────────────┤
│ 3. pre_gate après infer — station pas à jour à l’appel outil │
│    (infer dans after_assistant_turn, pas before_tool)        │
├─────────────────────────────────────────────────────────────┤
│ 4. Pas de skip segment si parent a déjà muté le path         │
│    (segment_spawned_paths = après spawn seulement)           │
├─────────────────────────────────────────────────────────────┤
│ 5. Segment loop sans rail_active / phase_visible_in_ui       │
│    (runner segment = boucle agent classique)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Décisions produit (à figer en 10-DECISIONS)

| ID | Décision |
|----|----------|
| **C16** | Le **brief segment** inclut le **payload mutation** : `edits[]` / extrait `old_string`→`new_string`, ou contenu `file_write`, plus le **libellé todo** — jamais « pending mutation » seul |
| **C17** | **pre_gate avant exécution** : la station effective pour un outil = `max(station_courante, infer_preview(tool))` — bloquer mutation hors ACT/VERIFY **avant** `registry.execute` |
| **C18** | **Pas de segment** si le parent a **déjà réussi** une mutation sur le même `path` dans le tour courant ou le run (marqueur `RunRailState` ou hash path) |
| **C19** | **PLAN = todo_write seulement** : `file_edit` / `file_write` en station PLAN → **pre_gate** (renforce C17) ; l’architecte mute en ACT inline ou via segment |
| **C20** | Segments : appliquer **C11** (filtrage `PhaseEnter` intermédiaires) dans la sous-boucle segment ; option preset : **segments désactivés** pour `strict` / petits modèles |

---

## Modifications code prévues

### Étape F1 — Brief segment avec payload (`segment/trigger.rs`, `runner.rs`)

| Fichier | Changement |
|---------|------------|
| `segment/trigger.rs` | `SegmentSpawnRequest` : champs `mutation_payload: SegmentMutationBrief` (`tool_name`, `path`, `edits` ou `contents`) |
| `segment/trigger.rs` | `brief` construit depuis `arguments` du **tool call parent intercepté** (pas méta-texte) |
| `segment/runner.rs` | `format_segment_user_message` : inclure JSON edits ou diff lisible |

**Exemple brief cible** :

```markdown
## Segment task (engine)
task_id: 1
scope:
- app-kdds-main/src/app/layout.tsx

## Mutation to apply
Tool: file_edit
Path: app-kdds-main/src/app/layout.tsx
Edits:
1. Remove `overflow-hidden` from `<html className=...>`
2. Remove `overflow-hidden` from `<body className=...>`
```

### Étape F2 — pre_gate avant exécution (`infer.rs`, `loop.rs`, `pre_gate.rs`)

| Fichier | Changement |
|---------|------------|
| `run_rail/infer.rs` | `preview_station_for_tool(state, tool_name) -> RunStation` — sans muter l’état |
| `pre_gate.rs` | `tool_pre_gate_rail(state, tool_name, effective_station)` ou appel avec station preview |
| `loop.rs` | Avant `registry.execute` : si `preview_station` disallow → bloquer + nudge rail (message existant) |

**Critère** : export contient au moins un blocage quand le modèle tente `file_edit` en READ.

### Étape F3 — Anti double segment (`segment/trigger.rs`, `state.rs`)

| Fichier | Changement |
|---------|------------|
| `RunRailState` | `parent_mutated_paths: HashSet<String>` — rempli sur mutation **réussie** parent (hors segment) |
| `evaluate_segment_spawn` | `if parent_mutated_paths.contains(path) { return None; }` |
| `loop.rs` | Ne pas spawner segment si le tool call parent a déjà été exécuté inline dans ce tour |

### Étape F4 — Alignement plan / todo

| Fichier | Changement |
|---------|------------|
| `loop_hooks.rs` | Après segment `completed` : `architect_state` marque todo item `completed` si `task_id` match |
| `01_core_rail.md` | Rappel : en PLAN, seul `todo_write` ; mutations en ACT |

Scope minimal v1 — pas de refonte todo UI.

### Étape F5 — C11 dans segments (`segment/runner.rs`, `agent_stream.rs`)

Passer `rail_active: false` + filtre phase **ou** `segment_mode: true` qui applique C11 dans la sous-boucle.

### Étape F6 — Preset / seuil segment (optionnel v1.4.0)

| Option | Détail |
|--------|--------|
| A | Monter `SEGMENT_ACT_STEPS_THRESHOLD` ou retirer `todo_hit` seul comme déclencheur |
| B | `EngineTuning.segment_act_enabled: false` sur preset `strict` |
| C | Inline mutation parent si fichier < 8 Ko **et** modèle < seuil (report 1.4.1) |

**Recommandation v1.4.0** : A + C16–C18 (brief + pre_gate + anti-double) ; B en 1.4.1 si besoin.

---

## Fichiers touchés (résumé)

```text
drox-engine/.../run_rail/
  segment/trigger.rs      ← C16, C18
  segment/runner.rs       ← C16, C20
  infer.rs                ← C17 preview
  pre_gate.rs             ← C17
  state.rs                ← C18 parent_mutated_paths
  loop_hooks.rs           ← F4 todo sync

drox-engine/.../agent/
  loop.rs                 ← C17 ordre pre_gate, C18 skip spawn
  agent_stream.rs         ← C20 segment stream

orchestration/prompts/
  01_core_rail.md         ← C19 PLAN discipline
```

---

## Tests à ajouter

| Test | Assertion |
|------|-----------|
| `trigger_brief_includes_edits` | `evaluate_segment_spawn` + json `edits` → brief contient `old_string` |
| `pre_gate_blocks_edit_in_read` | station READ + `file_edit` → `Some(block_msg)` avant execute |
| `skip_segment_if_parent_mutated` | path dans `parent_mutated_paths` → pas de spawn |
| `segment_stream_no_phase_reading` | segment loop + rail parent on → pas de `PhaseEnter(Reading)` |

---

## Critères dogfood (rejeu)

Rejouer sur `site-kdds` avec Qwen 27B, prompt lentille (session propre) :

| # | Critère |
|---|---------|
| D1 | Plan 5 todos visible |
| D2 | `layout.tsx` modifié **sans** segment « archéologie » > 30 steps |
| D3 | Au moins une mutation `globals.css` ou nouveau composant |
| D4 | Export : 0× « pending mutation » dans thinking segment |
| D5 | Optionnel : 1× message `pre_gate` si tentative edit trop tôt |

---

## Hors scope ce chantier

- Erreurs HTTP Ollama (infra)
- Polish UI trays / repliables ([1.5.1](../../1.5/1.5.1/README.md))
- B-MOTOR-01 thinking répétitif ([1.4.1](../../1.4.1/README.md))
- Désactivation complète segments sur tous presets (sauf C20 option)

---

## Ordre d’implémentation

```text
F1 brief payload (C16)     ← débloque le modèle segment
    └── F2 pre_gate (C17) ← discipline stations
            └── F3 anti-double (C18)
                    └── F4 todo sync
                            └── F5 segment phases (C20)
                                    └── Dogfood D1–D5
```

**Une PR par étape** F1→F3 recommandé ; F4–F5 peuvent suivre.

---

## Liens backlog

- [B-RAIL-02](SMOKE-BACKLOG.md) — pre_gate non observable
- [B-SEG-01](SMOKE-BACKLOG.md) — brief « pending mutation »
- [B-SEG-02](SMOKE-BACKLOG.md) — double parent/segment
- [CLOSURE-1.4.0](finalisation/CLOSURE-1.4.0.md)
