# 07 — Phases d’implémentation

**Parent** : [README](README.md) · **Code** : [05-CODE-ARCHITECTURE.md](05-CODE-ARCHITECTURE.md)

---

## Règle d’or

**Documentation validée → Phase 0 squelette → comportement par phase → dogfood entre chaque phase.**

Pas de big-bang sur `loop.rs`.

---

## Phase 0 — Squelette (sans comportement)

**But** : arborescence compilable, tests vides, zéro changement UX.

| Tâche | Fichier | Statut |
|-------|---------|--------|
| Créer `agent/run_rail/` | `mod.rs`, `station.rs`, `state.rs` | ✅ |
| `RunRailState` dans `ArchitectRunState` | `architect_state.rs` | ✅ |
| Flag tuning `run_rail_enabled: false` | `EngineTuning` | ✅ |
| Tests `cargo test run_rail` | compilent | ✅ |
| Log diagnostic `file_edit` | `remote_tool.rs` + [INVESTIGATION](INVESTIGATION-file-edit.md) | ✅ |
| `droxVersion` 1.4.0 | `package.json` | ✅ |

**Critère merge** : `cargo test -p drox-engine` vert, flag off = comportement inchangé.

---

## Phase 1 — Protocole hold/advance (mode A)

**But** : stations + candidates + marqueurs ; pre_gate lecture/mutation grossier.

| Tâche | Détail |
|-------|--------|
| `markers.rs` | parse `[gate: hold\|advance]`, `[depth: complex]` |
| `transition.rs` | `next_candidate_mode_a` + depth short |
| `policy.rs` | allowlist par station |
| `pre_gate.rs` | bloquer mutation hors ACT/VERIFY |
| `snapshot_block.rs` | injecter candidate |
| `loop.rs` | hook minimal derrière flag |
| Prompt | `01_core_rail.md` (feature flag prompt) |

**Dogfood** : salut, lecture repo, typo README.

**Critère** : pas de `todo_write` sur salut ; pas de mutation en READ.

---

## Phase 2 — Depth complex + PROPOSE hold

**But** : chemin long charte CSS ; hold PROPOSE si question user.

| Tâche | Détail |
|-------|--------|
| `transition.rs` | candidate READ → PROPOSE si complex |
| PROPOSE hold | blocage advance jusqu’au message user suivant |
| `cycle_sanity` | attaché VERIFY seulement |
| Tests | scénarios chat.txt message 3 (sans segment) |

**Dogfood** : charte graphique — doit s’arrêter à proposition sans mutation.

---

## Phase 3 — Segments ACT

**But** : isolement contexte gros fichiers / todos.

| Tâche | Détail |
|-------|--------|
| `segment.rs` | wrapper `orchestration_delegate` |
| Circuit breaker | 2× fail même path |
| Events | `railSegmentStart/Done` |
| UI U2 | blocs station |

**Dogfood** : charte complète avec livrable CSS valide, run < 100 steps.

---

## Phase 4 — UI blocs + polish

| Tâche | Détail | Statut |
|-------|--------|--------|
| UI U3 | sous-blocs segment (badges, scope, paths) | ✅ |
| Export transcript | `droxUiReplayExport` — events `railStation*` / `railSegment*` | ✅ |
| `run_rail_enabled: true` défaut preset `normal` | `orchestration/tuning/mod.rs` | ✅ |
| CLOSURE 1.4 | [09-TEST-PLAN.md](09-TEST-PLAN.md) signé après dogfood | ☐ |

**État juin 2026** : code phases 0–4 ✅ · dogfood ⚠️ · **bloquant** [B-RAIL-01](SMOKE-BACKLOG.md) (rail invisible en usage réel).

**Suite versions** : moteur [1.4.0 CLOSURE](finalisation/CLOSURE-1.4.0.md) → bugs [1.4.1](../../1.4.1/README.md) → UI [1.4.2](../../1.4.2/README.md).

**Critère tag 1.4.0** : events `railStation*` + pre_gate observables sur smoke charte qwen27b — **après Phase 5** — pas le polish UI chat.

---

## Phase 5 — Convergence phase / rail (bloque CLOSURE)

**But** : rail observable en usage réel ; une seule timeline UI ; moteur fiable sans obéissance modèle aux `[gate:]`.

**Plan détaillé** : [11-PHASE-RAIL-CONVERGENCE.md](11-PHASE-RAIL-CONVERGENCE.md) · décisions **C11–C15** dans [10-DECISIONS-PRODUIT.md](10-DECISIONS-PRODUIT.md).

| Étape | Livrable | Fichiers clés | Statut |
|-------|----------|---------------|--------|
| B | Filtrage `PhaseEnter` intermédiaires | `phases.rs`, `agent_stream.rs`, `loop.rs` | ✅ |
| C | Auto-advance heuristique | `run_rail/infer.rs`, `transition.rs`, `loop_hooks.rs` | ✅ |
| D | Gardes loop rail-aware | `loop.rs`, `run_rail/policy.rs` | ✅ partiel (nudges rail ☐) |
| E | Prompts alignés | `01_core_rail.md`, `literal_user_message_discuss.md` | ✅ |
| F | UI (si besoin) | `host-message.js`, `run-rail-stations.js` | ☐ après dogfood |
| G | Dogfood + CLOSURE | [09-TEST-PLAN.md](09-TEST-PLAN.md), [CLOSURE-1.4.0.md](finalisation/CLOSURE-1.4.0.md) | ☐ |

**Bloquant** : [B-RAIL-01](SMOKE-BACKLOG.md) — fix code livré, **à valider dogfood**.

**Critère merge Phase 5** : G1–G3 verts sur run README ; G4–G6 reportés Phase 5b.

**Dogfood juin 2026** (`ses_a131c190`) : rail parent OK ; feature lentille bloquée par segments.

---

## Phase 5b — Segments ACT + pre_gate (bloque CLOSURE)

**But** : segments exécutables par petits modèles ; `pre_gate` observable ; pas de double travail parent/segment.

**Plan détaillé** : [12-SEGMENT-ACT-FIXES.md](12-SEGMENT-ACT-FIXES.md) · décisions **C16–C20** dans [10-DECISIONS-PRODUIT.md](10-DECISIONS-PRODUIT.md).

| Étape | Livrable | Fichiers clés | Statut |
|-------|----------|---------------|--------|
| F1 | Brief segment avec payload mutation | `segment/trigger.rs`, `runner.rs` | ☐ |
| F2 | pre_gate avant exécution (preview infer) | `infer.rs`, `pre_gate.rs`, `loop.rs` | ☐ |
| F3 | Anti double segment | `state.rs`, `trigger.rs`, `loop.rs` | ☐ |
| F4 | Sync todo après segment | `loop_hooks.rs` | ☐ |
| F5 | C11 dans sous-boucle segment | `runner.rs`, `agent_stream.rs` | ☐ |
| G | Dogfood lentille D1–D5 | `chat_qwen27b.txt` rejeu | ☐ |

**Bloquants** : [B-RAIL-02](SMOKE-BACKLOG.md), [B-SEG-01](SMOKE-BACKLOG.md), [B-SEG-02](SMOKE-BACKLOG.md).

**Critère merge Phase 5b** : D1–D4 dogfood + tests F1–F3 + `cargo test -p drox-engine`.

---

## Dépendances versions

```text
1.3.4 Phase S clôturée (tests solo verts)
    └── 1.4 Phase 0–1
            └── 1.4 Phase 2–3 (dogfood)
                    └── 1.4 Phase 4
                            └── 1.4 Phase 5 (convergence)
                                    └── 1.4 Phase 5b (segments + pre_gate) + CLOSURE + tag
                                            └── 1.4.3 index (inject READ boot)
```

---

## Risques

| Risque | Mitigation |
|--------|------------|
| `loop.rs` gonfle | revue stricte checklist 05 |
| Régression discuss | rail raccourci + flag off |
| Modèle ignore `[gate:]` | **C12** auto-advance + pre_gate dur — [11-PHASE-RAIL-CONVERGENCE.md](11-PHASE-RAIL-CONVERGENCE.md) |
| Double vérité state | `RunRailState` seul pour station |
