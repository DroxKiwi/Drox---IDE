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

| Tâche | Détail |
|-------|--------|
| UI U3 | sous-blocs segment |
| Export transcript | aligné stations |
| `run_rail_enabled: true` défaut preset `normal` | tuning |
| CLOSURE 1.4 | [09-TEST-PLAN.md](09-TEST-PLAN.md) signé |

---

## Dépendances versions

```text
1.3.4 Phase S clôturée (tests solo verts)
    └── 1.4 Phase 0–1
            └── 1.4 Phase 2–3 (dogfood)
                    └── 1.4 Phase 4 + tag
                            └── 1.4.1 index (inject READ boot)
```

---

## Risques

| Risque | Mitigation |
|--------|------------|
| `loop.rs` gonfle | revue stricte checklist 05 |
| Régression discuss | rail raccourci + flag off |
| Modèle ignore `[gate:]` | nudge + pre_gate dur |
| Double vérité state | `RunRailState` seul pour station |
