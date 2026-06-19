# Audit reliquats moteur — avant refonte 1.4.0

**Date** : juin 2026  
**Référence** : [FOI-REFONTE.md](FOI-REFONTE.md) (fait foi)

Analyse pré-refonte — consolidée dans FOI ; ce doc garde la heatmap et le détail d’investigation.

Analyse **approfondie** du code `drox-engine` (et satellites) pour repérer tout ce qui n’est **pas encore ciblé** par le plan de table rase. Aucune modification code — document de décision uniquement.

---

## Synthèse exécutive

| Métrique | Valeur |
|----------|--------|
| Fichiers `.rs` > 500 lignes (`src/`) | **8** (dont 5 sous `agent/`) |
| Occurrences `delegate`/`Executor`/`segment` dans `agent/` | **~72** dans `drive.rs` seul |
| Chemins nudge actifs dans `drive.rs` | **~12** familles distinctes |
| Modules multi-modèle encore compilés | **~15** fichiers dédiés |
| Entrées **NOUVEAU** (hors SUPPRESSIONS.md) | **~30** |
| Couverture plan existant | **~80 %** du legacy identifié |

**État produit actuel** (preset `normal`) :

```text
executor_delegation_enabled = false   → branches delegate mortes mais présentes
run_rail_enabled            = true    → rail actif (conducteur cible)
subagents_enabled           = false   → explore/task inactif par défaut IDE
```

Le moteur est un **palimpseste** : 1.2 délégation + 1.3 gates/nudges + 1.4.0 rail + segments (option A à supprimer). Le code mort **compile et teste** encore — risque de régression silencieuse si on ne cartographie pas tout.

---

## Méthode

1. Inventaire lignes (`agent/`, `orchestration/`, `lib.rs`)
2. Grep sémantique : `delegate`, `Executor`, `segment`, `subagent`, `explore`, `cycle_sanity`, `LoopDetector`, `*_solo`
3. Lecture croisée `drive.rs`, `architect_state.rs`, `nudges/mod.rs`, `tools/mod.rs`, `registry.rs`
4. Comparaison avec [SUPPRESSIONS.md](SUPPRESSIONS.md) tier 1–5
5. Extension drox-tools, drox-cli, exports `lib.rs`

---

## Carte thermique — `drive.rs` (1717 lignes)

Familles de branches **encore actives** (même si flags off) :

| Zone | Lignes ~ | Famille | Dans SUPPRESSIONS ? |
|------|----------|---------|---------------------|
| Boot | 1–130 | Executor supplement, edit_start, LoopDetector init | Partiel |
| Explore drain | 238–240 | `explore_jobs_pending_nudge` | ✅ Tier 2 |
| Work mode | 351–359 | `[mode: discovery/task]` anchor | ⚠️ **NOUVEAU** |
| LoopDetector | 414–694 | `loop_intervention` + templates | ✅ Tier 1 |
| Cycle sanity | 498–525, 837–844 | `architect_cycle_sanity_*` | ✅ Tier 1 |
| Run closable | 536–559 | `ARCHITECT_RUN_CLOSABLE_NUDGE` | Partiel |
| Segment spawn | 1199–1494 | ACT segment delegation | ✅ Tier 2 |
| Delegate cap | 1421–1468 | `architect_delegate_cap_nudge` | ✅ Tier 1 |
| Cycle checkpoint | 1474+ | `cycle_checkpoint_block(delegation)` | ⚠️ **NOUVEAU** |
| Deliverable | 1594–1613 | `executor_deliverable_met` | ✅ Tier 2 |
| Analyzing nudge | 1634–1652 | `ANALYZING_PHASE_NUDGE` | ⚠️ **NOUVEAU** |
| Plan-before-mutation | 1697–1706 | `MUTATING_TOOL_BEFORE_TODO_WRITE` | ✅ Tier 1 |
| Step-by-step | 1734–1742 | `step_by_step_todo_nudge` | ✅ Tier 1 |

**~70** occurrences `nudge`/`Message::system` dans le fichier — cible post-Phase 3 : **≤ 3 chemins** (stall ACT, schema error, done_only).

---

## Tier A — Déjà couvert par SUPPRESSIONS (confirmé présent)

Ces éléments **existent encore** ; le plan les cible correctement.

### Multi-modèle (Tier 2)

| Module | Lignes ~ | Rôle |
|--------|----------|------|
| `orchestration_delegate.rs` | 521 | Spawn Executor via `delegate_executor` |
| `subagent.rs` + `subagent_jobs.rs` | 400+ | Explore async |
| `agent/loop/subagents.rs` | 73 | Drain jobs → messages |
| `agent/subagent_report_gate.rs` | 38 | Gate drain rapports |
| `run_rail/segment/*` (6 fichiers) | 800+ | Segments ACT option A |
| `orchestration/executor_deliverable.rs` | 320+ | Livrables `.drox/agent-output/` |
| `orchestration/delegate_report.rs` | 233+ | Finalisation delegate |
| `orchestration/parallel_batch.rs` | 67+ | Batch `parallel_with` |
| `orchestration/prompts/executor.rs` | 24+ | Prompt Executor |
| `prompts/segments/execute.md` | 6+ | Prompt segment |

### Guide 1.3 (Tier 1)

| Module | Rôle |
|--------|------|
| `nudges/architect.rs` | `ARCHITECT_DELEGATE_*`, `RUN_CLOSABLE`, cycle sanity |
| `nudges/loop_intervention.rs` + `templates/loop/*` (13 fichiers) | Anti-boucle empreinte |
| `nudges/helpers.rs` | `step_by_step_todo_nudge`, `explore_jobs_pending` |
| `nudges/router.rs` | Branches Executor / Standard |
| `gates.rs` | testing gate, todo recreation, explore task blocks |
| `architect_gates.rs` | Caps lecture/délégation |
| `executor_gates.rs` | Stub noop Executor |
| `cycle_sanity.rs` | Smoke fin de cycle |
| `run_rail/cycle_sanity_gate.rs` | Pont rail ↔ cycle_sanity |

### Prompts multi-paradigmes (Tier 1 + 4)

| Fichier | Boot quand |
|---------|------------|
| `01_core.md` | `executor_delegation_enabled` |
| `01_core_solo.md` | solo sans rail |
| `01_core_rail.md` | `run_rail_enabled` (actuel prod) |
| `parallel_slots.md` | delegate + parallel > 1 |
| `delegate_executor.md` | tool protocol |

### State / config (Tier 3)

~20 champs `ArchitectRunState` delegate/segment + 4 champs `AgentConfig` + 4 champs `EngineTuning` — listés tier 3.

---

## Tier B — NOUVEAU (absent ou incomplet dans SUPPRESSIONS)

### B1 — Satellites delegate (P1 — DEL avec Phase 2b)

| Fichier | Lignes | Rôle | Action |
|---------|--------|------|--------|
| **`orchestration/truth_check.rs`** | 413 | Vérif disque post-delegate (`post_delegate_truth_check`) | **DEL** |
| **`orchestration/protocol_markers.rs`** | 126 | `[task: meta]`, `[cycle: user_check]`, sanity task_id | **CUT** — garder markers discuss si utiles |
| **`orchestration/config.rs`** | 110 | `executor_model`, `max_parallel_executors` | **CUT** champs delegate |
| **`orchestration/mod.rs`** | — | `pub use truth_check::*` | **CUT** exports |

### B2 — Prompts & registre (P1–P2)

| Fichier | Rôle | Action |
|---------|------|--------|
| **6× `*_solo.md`** outils | Dualité via `tool_block_dual!` dans `tools/mod.rs` | **CUT** — un seul bloc par outil post-rail solo |
| **`tools/mod.rs`** | `TOOL_DELEGATE_EXECUTOR` dans `ALL_ARCHITECT_TOOL_BLOCKS`, `is_architect_read_tool_for_delegate_cap`, descriptions conditionnelles delegate | **CUT** |
| **`registry.rs`** | 20+ IDs `G3Edit*` / `G4` / `G5` / `TDelegate` / `CtxDelegate` — **catalogue spec**, pas de fichiers MD séparés | **CUT** IDs morts ; garder enum minimal rail solo |
| **`01_core_rail.md` L49** | Référence `cycle_sanity` à VERIFY | **CUT** Phase 1 — remplacer par bash/lsp VERIFY |
| **`01_core_rail.md` L55–68** | `[mode: discovery/task]`, `[task: meta]`, `[cycle: user_check]` | **INVESTIGATE** — aligner SQUELETTE (marqueurs autorisés) |
| **`architect_edit.rs`** | Param `max_parallel_executors` + `parallel_slots_supplement` | **CUT** |
| **`architect_messages.rs` L8** | Commentaire réf. `01_core.md` | **CUT** commentaire |

### B3 — Nudges non nommés (P2)

| Fichier | Rôle | Action |
|---------|------|--------|
| **`nudges/executor.rs`** | `EXECUTOR_NUDGE_PROMPT`, `EXECUTOR_DONE_ONLY_NUDGE` | **DEL** (router Executor listé, pas ce fichier) |
| **`nudges/exploration.rs`** | `ANALYZING_PHASE_NUDGE` — phase `[phase: analyzing]` | **CUT** — pas dans SQUELETTE |
| **`templates/loop/role_executor.md`** | Template anti-boucle Executor | **DEL** |
| **`templates/loop/role_architect.md`** | Duplique `role_architect_solo.md` (délégation) | **DEL** — garder solo |
| **`nudges/mod.rs`** | Ré-exporte 15+ symboles legacy | **CUT** après élagage |

### B4 — Gates & état étendus (P2)

| Fichier | Rôle | Action |
|---------|------|--------|
| **`gates.rs` L384–415** | `explore_second_task_block`, `explore_running_mutation_block` | **DEL** avec subagent |
| **`architect_todo_gate.rs` L27–30** | `complete_gate_for_task` → toujours `None` | **CUT** corps mort |
| **`architect_state.rs`** | `cycle_checkpoint_block`, `cycle_anchor_block`, `ARCHITECT_CYCLE_ANCHOR_MARKER` | **CUT** — snapshot rail remplace |
| **`architect_state.rs`** | `work_mode_anchor` + `try_anchor_work_mode_from_text` | **INVESTIGATE** |
| **`run_snapshot.rs` L135** | Injecte `cycle_checkpoint_block` dans snapshot | **CUT** avec cycle anchor |
| **`tuning/mod.rs`** | `executor_deliverable_excerpt_max_chars`, `executor_deliverable_met_blocked` | **DEL** (tier 3 incomplet) |

### B5 — Artefacts & monolithes (P1 / Phase 3)

| Fichier | Lignes | Action |
|---------|--------|--------|
| **`agent/tests/_all.txt`** | 3065 | **DEL** immédiat (copie `tests/mod.rs`) |
| **`agent/core/_*.txt`, `helpers/_*.txt`** | divers | **DEL** (déjà tier 1) |
| **`agent/tests/mod.rs`** | 3068 | **SPLIT** + adapter tests legacy (pas DEL massif) |
| **`compaction.rs`** | 811 | **REPORT** 1.4.1 (hors squelette sauf blocage) |
| **`orchestration/tuning/mod.rs`** | 648 | **SPLIT** post-nettoyage flags |

### B6 — Exports publics & wire (P2)

| Fichier | Rôle | Action |
|---------|------|--------|
| **`lib.rs` L40–51, 118–119** | `pub mod orchestration_delegate`, `subagent`, exports `EngineOrchestrationDelegate`, `SubagentExecutor` | **CUT** API publique |
| **`lib.rs` L67–85** | `executor_user_message_from_delegate`, `EXECUTOR_SYSTEM_PROMPT`, `is_architect_read_tool_for_delegate_cap`, `DEFAULT_EXECUTOR_MODEL` | **CUT** |
| **`run_spec/mod.rs`** | `EXECUTOR_TOOL_ALLOWLIST`, `subagents_enabled`, `delegate_executor` dans allowlist | **CUT** |
| **`event.rs` L160–221** | `SubagentStart/Done`, `RailSegmentStart/Done`, champs delegate | **CUT** events ou KEEP UI 1.4.3 |
| **`agent_stream.rs` L29–59** | Cap tool calls subagent | **CUT** |

### B7 — drox-tools (P2 — hors scope engine mais couplé)

| Fichier | Action |
|---------|--------|
| `simple/delegate_executor.rs` | **DEL** ou stub erreur « désactivé » |
| `simple/task.rs` | **DEL** ou hors allowlist architect |
| `subagent.rs`, `subagent_report.rs` | **DEL** avec explore |
| `orchestration_delegate.rs`, `delegate_scope.rs`, `agent_output.rs` | **DEL** |
| `registry.rs` | Retirer enregistrement delegate/task |

### B8 — drox-cli / IDE (P2 — parallèle Phase 2)

| Fichier | Rôle | Action |
|---------|------|--------|
| **`drox-cli/.../agent_run.rs`** | `ArchitectDelegateContext`, `force_disable_subagents`, wiring delegate | **CUT** |
| **`drox-cli/prompts.rs`** | Supplément prompt `task` explore | **DEL** |
| **`drox-cli/system_prompt/registry.rs`** | `register_subagent_task` | **CUT** |
| **`drox-cli/main.rs` L570** | `rail_segment_scope_paths` | **DEL** champ |

---

## Tier C — INVESTIGATE (décision produit requise)

| Sujet | Question | Recommandation squelette |
|-------|----------|--------------------------|
| **`[mode: discovery/task]`** | Garder sans delegate ? | **CUT** du prompt rail solo — depth rail suffit |
| **`[task: meta]` / `[cycle: user_check]`** | Encore utiles en solo ? | **CUT** — VERIFY = bash/lsp ; pas sanity cycle 1.3 |
| **`architect_mode.rs` Discovery** | Playbook discovery sans delegate | **CUT** exports ; garder enum minimal si snapshot |
| **`json_response.rs`** | Filtre JSON gate legacy discuss | **KEEP** si discuss `architect_gate` en dépend |
| **`final_answer_guard.rs`** | Couplé `running_subagent_jobs` | **KEEP** — retirer param subagent après Phase 2 |
| **`edit_start.rs`** | Ancre objectif run | **KEEP** — indépendant multi-modèle |
| **`professor.rs` + gates** | Hors IDE | **KEEP** minimal (tier 1) |
| **`user_message_scope.rs`** | Headers legacy IDE | **KEEP** — compat transcript |
| **`registry.rs` G3Edit\*** | Catalogue sans fichiers MD | **CUT** IDs non chargés — éviter fausse carte doc |
| **Events UI segment/subagent** | Masquer ou supprimer wire | **KEEP** wire Phase 2–5 ; polish UI 1.4.3 |

---

## Tier D — Reliquats dans le prompt rail **actif** (`01_core_rail.md`)

Le boot prod utilise ce fichier. Écarts avec [SQUELETTE](SQUELETTE.md) :

| Ligne | Contenu | Écart SQUELETTE | Action Phase 1 |
|-------|---------|-----------------|----------------|
| 49 | `cycle_sanity` à VERIFY | VERIFY = bash/lsp, pas cycle_sanity | **CUT** |
| 55–56 | `[mode: discovery/task]` | Non listé marqueurs conduite | **CUT** ou documenter |
| 66–67 | `[task: meta]`, `[cycle: user_check]` | Non listé | **CUT** |
| 61 | « engine infers stations from tools » | Mode A = candidate linéaire | **Réécrire** |

→ Création `01_core_rail_solo.md` = occasion de **purger** ces reliquats 1.3 **dans le prompt**, pas seulement dans le code.

---

## Tests legacy — cartographie

### Tests inline (hors `tests/mod.rs`) à adapter/supprimer

| Fichier | Tests | Feature |
|---------|-------|---------|
| `architect_gates.rs` | 80–287 | delegate cap, reads |
| `architect_state.rs` | 1292+, 1387+, 1469+ | delegate verify, segment report |
| `gates.rs` | 547–571 | delegate never pre-blocked |
| `executor_gates.rs` | 28–47 | Executor tools |
| `segment/*` | mod tests | spawn segment |
| `subagent.rs` | 401 | pas de tool task |
| `orchestration_delegate.rs` | 515+ | allowlist |
| `truth_check.rs` | 362+ | post delegate |
| `tools/mod.rs` | 155–168 | supplements delegate |

### Tests `agent/tests/mod.rs` (~3068 L) — comportements 1.3

| Test (nom) | L~ | Legacy testé | Après squelette |
|------------|-----|--------------|-----------------|
| `mutating_tool_before_todo_write_*` | 309 | Nudge plan-before-mutation | Supprimer ou remplacer stall |
| `done_blocked_when_code_edited_without_testing` | 742 | Gate `[phase: testing]` | Supprimer |
| `todo_recreation_after_all_completed_*` | 1590 | Gate todo recreation | Supprimer |
| `repeated_assistant_text_triggers_loop_*` | 1748 | LoopDetector | Supprimer ou stall ACT |
| `loop_detector_*` | 1802+ | LoopDetector | Supprimer |
| `step_by_step_nudge_message_*` | 2171 | step_by_step | Supprimer |
| `run_completes_when_model_batches_mutating_*` | 2191 | step_by_step | Adapter |

**Règle** : ne pas DEL `tests/mod.rs` en bloc — **split** ([STRUCTURE-CODE](STRUCTURE-CODE.md)) + réécrire au fil des phases.

---

## Matrice priorité — ajouts au plan

| P | Entrée | Phase suggérée |
|---|--------|----------------|
| **P0** | `tests/_all.txt` | Immédiat (doc/chantier) |
| **P1** | `truth_check.rs` | 2b avec delegate |
| **P1** | Purge `01_core_rail.md` → `01_core_rail_solo.md` | 1 |
| **P1** | `registry.rs` IDs morts | 1–2 |
| **P2** | `*_solo.md` dualité outils | 1 |
| **P2** | `nudges/executor.rs`, `role_executor.md`, `role_architect.md` | 3 |
| **P2** | `protocol_markers.rs` (sanity/delegate) | 2b |
| **P2** | `cycle_checkpoint` / `cycle_anchor` dans state + snapshot | 3 |
| **P2** | `lib.rs` exports delegate/subagent | 2b |
| **P2** | drox-tools delegate/task | 2b |
| **P2** | drox-cli `agent_run.rs` wiring | 2b |
| **P3** | `ANALYZING_PHASE_NUDGE` | 3 |
| **P3** | `work_mode_anchor` | 3 (décision INVESTIGATE) |
| **P3** | `compaction.rs` monolithe | 1.4.1 |

---

## Ce qui est sain (ne pas toucher)

| Zone | Raison |
|------|--------|
| `agent/core/`, `helpers/` (hors `_*.txt`) | Entrée agent stable |
| `run_rail/*` hors `segment/`, `cycle_sanity_gate` | Moelle rail |
| `permissions.rs`, hooks | Sécurité |
| `compaction`, `memory`, `long_memory` | Axe contexte (split reporté) |
| `discuss/*` prompts + `architect_gate.rs` | Chemin court |
| `edit_start.rs` | Ancrage objectif |
| `run_rail/policy.rs`, `pre_gate.rs`, `transition.rs` | Mécaniques rail |
| `run_rail/nudges.rs` (`ACT_FAILURE_STOP`) | Rail C6, pas 1.3 |

---

## Conclusion

Le plan [SUPPRESSIONS](SUPPRESSIONS.md) couvre **le cœur** (segment, delegate, explore, gates/nudges majeurs). L’audit révèle **~30 reliquats satellites** non listés :

1. **Couche orchestration** : `truth_check`, `protocol_markers`, tuning deliverable
2. **Couche prompt** : dualité `*_solo`, registre G3/G5 fantôme, reliquats dans `01_core_rail.md` actif
3. **Couche nudges** : `executor.rs`, `exploration.rs`, templates architect vs solo
4. **Couche état** : cycle anchor/checkpoint, work_mode
5. **Couche wire** : exports `lib.rs`, events, CLI

**Prochaine doc** : [SUPPRESSIONS.md](SUPPRESSIONS.md) tier 6 (ci-dessous) intègre ces entrées.

**Prochaine action code** : toujours **Phase 1** — `01_core_rail_solo.md` en purifiant les reliquats prompt identifiés en tier D.
