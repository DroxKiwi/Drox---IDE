# Inventaire suppressions — table rase 1.4.0

**Référence** : [FOI-REFONTE.md](FOI-REFONTE.md) (fait foi) · **Audit** : [AUDIT-RELIQUATS](AUDIT-RELIQUATS.md)

Annexe inventaire détaillé — miroir FOI § VII–VIII.

Liste des reliquats à retirer. **Ne pas toucher** aux crates `drox-llm`, `drox-context`, `drox-session`, `drox-permissions`, `drox-tools` (hors tools delegate/task si inutilisés).

Légende : **DEL** = supprimer · **CUT** = retirer branches dans fichier · **KEEP** = conserver

---

## Tier 1 — Guide 1.3 redondant avec rail

| Cible | Action | Notes |
|-------|--------|-------|
| `agent/nudges/architect.rs` — `ARCHITECT_DELEGATE_*` | DEL contenu | Délégation morte |
| `agent/nudges/helpers.rs` — `step_by_step_todo_nudge` | CUT ou DEL | Remplacer par stall ACT |
| `agent/nudges/loop_intervention.rs` + `templates/loop/*` | DEL ou fusion | Stall ACT suffit v1 |
| `agent/nudges/router.rs` — branches Executor | CUT | |
| `agent/nudges/standard.rs` — `NUDGE_PROMPT` legacy | CUT usage drive | Garder `done_only` si utile |
| `drive.rs` — ~15 `messages.push(nudge)` | CUT | 2–3 chemins max |
| `gates.rs` — `gate_testing_after_code_mutation` | CUT ou flag off permanent | VERIFY = rail |
| `gates.rs` — `gate_todo_recreation_blocked` | CUT | Optionnel v1 |
| `gates.rs` — `gate_professor_course_plan` | **DEL** | FOI D7 — hors contrat |
| `architect_gates.rs` — caps delegate/reads | DEL fichier si vide | |
| `executor_gates.rs` | DEL | Avec Executor |
| `cycle_sanity.rs` + nudges sanity | CUT | VERIFY station suffit |
| `run_rail/cycle_sanity_gate.rs` | CUT | Idem |
| `phases.rs` — guide via `[phase: reading\|acting…]` | CUT prompts | UI stream OK |
| `01_core.md` (délégation) | DEL boot | |
| `01_core_solo.md` (flexible) | DEL boot | Remplacé rail solo |
| `parallel_slots.md` | DEL | |
| `_agent_api.txt`, `_config.txt`, `_misc.txt`, `_workspace.txt` | DEL | Artefacts refactor |

---

## Tier 2 — Multi-modèle produit (D1, D2)

### Segments ACT — option A

| Fichier | Action |
|---------|--------|
| `agent/run_rail/segment/mod.rs` | DEL |
| `agent/run_rail/segment/runner.rs` | DEL |
| `agent/run_rail/segment/trigger.rs` | DEL |
| `agent/run_rail/segment/scope.rs` | DEL |
| `agent/run_rail/segment/report.rs` | DEL |
| `agent/run_rail/segment/persist.rs` | DEL |
| `orchestration/prompts/segments/execute.md` | DEL |
| `drive.rs` — `segment_spawn_request`, rail segment branches | CUT |
| `tool_execution.rs` — segment inline vs spawn | CUT |
| `event.rs` — `RailSegmentStart` etc. | KEEP UI ou CUT phase 5 UI |
| `AgentConfig::rail_segment_scope_paths` | DEL champ |
| Tests segment dans `agent/tests/` | CUT |

### Délégation Executor

| Fichier | Action |
|---------|--------|
| `orchestration_delegate.rs` | DEL |
| `orchestration/executor_deliverable.rs` | DEL |
| `orchestration/delegate_report.rs` | DEL |
| `orchestration/parallel_batch.rs` | DEL si uniquement delegate |
| `orchestration/prompts/executor.rs` | DEL |
| `orchestration/prompts/system/blocks/tools/delegate_executor.md` | DEL |
| `drox-tools/.../delegate_executor.rs` | DEL ou KEEP registry stub |
| `run_spec` — `EXECUTOR_TOOL_ALLOWLIST` usage architect | CUT |
| `architect_state` — delegate fields | CUT |
| `run_snapshot.rs` — last delegate section | CUT |

### Explore sub-agent

| Fichier | Action |
|---------|--------|
| `subagent.rs` | DEL |
| `subagent_jobs.rs` | DEL |
| `agent/subagent_report_gate.rs` | DEL |
| `agent/loop/subagents.rs` | DEL |
| `drox-tools/.../task.rs` | DEL ou hors allowlist |
| `drive.rs` — explore jobs pending nudge | CUT |

---

## Tier 3 — Simplification architect_state & config

| Cible | Action |
|-------|--------|
| `architect_state.rs` — `verified_task_ids`, segment counters, delegate status | CUT champs morts |
| `AgentConfig` — `delegate_task_id`, `executor_deliverable_*` | DEL |
| `EngineTuning` — `executor_delegation_enabled`, `max_reads_before_delegate`, `max_mutations_before_delegate_nudge`, `executor_subrun_max_iterations` | DEL champs |
| `final_answer_guard.rs` | REVIEW — garder si clôture UI |

---

## Tier 4 — Prompts & tuning à conserver / créer

| Fichier | Action |
|---------|--------|
| `01_core_rail_solo.md` | **CRÉER** |
| `01_core_rail.md` | Fusionner dans solo ou DEL |
| `system/blocks/tools/file_edit.md` | **CRÉER** |
| `system/blocks/tools/file_write.md` | **CRÉER** |
| `system/gates/discuss.rs` + discuss blocks | **KEEP** — chemin court |
| `system/gates/edit.rs` | CUT branches delegation |
| `run_rail/*` (hors segment/) | **KEEP** — moelle |
| `policy.rs`, `pre_gate.rs`, `transition.rs`, `infer.rs`, `loop_hooks.rs` | **KEEP** |

---

## Tier 6 — Reliquats audit juin 2026 (NOUVEAU)

Complément [AUDIT-RELIQUATS.md](AUDIT-RELIQUATS.md) — absents du plan initial.

### Orchestration satellites delegate

| Cible | Action |
|-------|--------|
| `orchestration/truth_check.rs` | DEL (avec `orchestration_delegate.rs`) |
| `orchestration/protocol_markers.rs` — sanity, `[task: meta]`, `[cycle: user_check]` | CUT (garder discuss si besoin) |
| `orchestration/config.rs` — `executor_model`, `max_parallel_executors` | CUT |
| `orchestration/mod.rs` — exports truth_check | CUT |

### Prompts dualité & registre

| Cible | Action |
|-------|--------|
| 6× `tools/*_solo.md` + macro `tool_block_dual!` | CUT — un bloc par outil |
| `tools/mod.rs` — `TOOL_DELEGATE_EXECUTOR`, `is_architect_read_tool_for_delegate_cap`, descriptions delegate | CUT |
| `registry.rs` — IDs `G3EditEphemeralExecutors`, `G3EditBeforeDelegating`, `G4EditParallelSlots`, `G5*`, `TDelegate`, `CtxDelegate` | CUT enum mort |
| `01_core_rail.md` — `cycle_sanity`, `[mode:]`, `[task: meta]`, `[cycle: user_check]` | CUT dans `01_core_rail_solo.md` |
| `architect_edit.rs` — `max_parallel_executors`, `parallel_slots_supplement` | CUT |

### Nudges & templates non listés

| Cible | Action |
|-------|--------|
| `nudges/executor.rs` | DEL |
| `nudges/exploration.rs` — `ANALYZING_PHASE_NUDGE` | CUT |
| `templates/loop/role_executor.md` | DEL |
| `templates/loop/role_architect.md` | DEL (garder `role_architect_solo.md`) |
| `drive.rs` — `analyzing_phase_nudge_sent`, `cycle_checkpoint_block` injection | CUT |

### État & tuning étendus

| Cible | Action |
|-------|--------|
| `architect_state.rs` — `cycle_anchor_block`, `cycle_checkpoint_block`, `ARCHITECT_CYCLE_ANCHOR_MARKER` | CUT |
| `run_snapshot.rs` — `cycle_checkpoint_block` dans snapshot | CUT |
| `architect_todo_gate.rs` — `complete_gate_for_task` noop | CUT |
| `EngineTuning` — `executor_deliverable_excerpt_max_chars`, `executor_deliverable_met_blocked` | DEL |
| `architect_state.work_mode_anchor` | INVESTIGATE → CUT probable squelette |

### Artefacts & exports

| Cible | Action |
|-------|--------|
| `agent/tests/_all.txt` | DEL immédiat |
| `lib.rs` — `pub mod orchestration_delegate`, `subagent`, exports Executor/Subagent | CUT |
| `event.rs` — `SubagentStart/Done` (segment events = tier 2) | CUT ou KEEP UI 1.5.1 |
| `agent_stream.rs` — cap subagent tool calls | CUT |

### drox-tools (Phase 2b)

| Cible | Action |
|-------|--------|
| `simple/delegate_executor.rs`, `simple/task.rs` | DEL ou stub |
| `subagent.rs`, `subagent_report.rs`, `orchestration_delegate.rs`, `delegate_scope.rs`, `agent_output.rs` | DEL |

### drox-cli (Phase 2b)

| Cible | Action |
|-------|--------|
| `agent_run.rs` — `ArchitectDelegateContext`, subagent wiring | CUT |
| `prompts.rs` — supplément `task` | DEL |
| `main.rs` — `rail_segment_scope_paths` | DEL |

---

## Tier 5 — Ce qu’on ne supprime PAS

| Zone | Raison |
|------|--------|
| `agent/loop/drive.rs` (squelette) | Cœur — on élague |
| `agent/core/` | Entrée Agent |
| `agent/helpers/` | Tool specs, errors |
| `orchestration/prompts/` (rail + discuss) | Contexte modèle |
| `permissions.rs`, `drox-permissions/` | Sécurité |
| `compaction.rs`, `memory.rs`, `drox-context/` | Axe contexte |
| `drox-cli/jsonrpc/` | Wire IDE |
| `agent/tests/mod.rs` | Adapter, pas tout supprimer |
| `professor.rs` | **DEL** — [REPORT professor-2.0](../REPORT/professor-2.0.md) |
| Doc `docs/1.4/moteur/` | Carte — mettre à jour post-Phase 5 |
| `docs/1.4/1.4.0/archive/` | Historique |

---

## Ordre de suppression recommandé

```text
1. Doc OK (Phase 0)
2. Prompt solo + T-* mutations (Phase 1) — pas de DEL code lourd
3. segment/ DEL (Phase 2a) — tests
4. orchestration_delegate + subagent DEL (Phase 2b) — tests
5. drive/gates/nudges CUT (Phase 3) — tests
6. filtre outils + stall (Phase 4) — smoke
```

---

## Critère « pas de régression silencieuse »

Après chaque tier :

```bash
cargo test -p drox-engine
cargo build -p drox-cli
```

Smoke manuel minimal : salut discuss + edit trivial (un `file_read`).
