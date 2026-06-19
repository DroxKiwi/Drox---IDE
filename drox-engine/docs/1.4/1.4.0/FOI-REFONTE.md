# FOI — Refonte deuxième édition 1.4.0

**Statut** : document **unique de référence** — fait foi pour tout le chantier code  
**Date** : juin 2026  
**Hub** : [README](README.md) · **Annexes** : [AUDIT-RELIQUATS](AUDIT-RELIQUATS.md) (analyse), [SMOKE-BACKLOG](SMOKE-BACKLOG.md) (journal)

> Tout développeur ou agent qui touche le moteur **lit ce fichier en premier**.  
> Les autres docs (`SQUELETTE`, `SUPPRESSIONS`, `STRUCTURE-CODE`, `PLAN-ATTAQUE`) sont des **déclinaisons** ; en cas de conflit, **FOI prime**.

**Exécution** → [§ XIV — Tableau ordonné](#xiv--tableau-dexécution-ordonné) · **Contrat runtime** → [§ III](#iii--contrat-runtime-canonique-refonte-profonde)

---

## I — En une phrase

**Une vérité runtime, un conducteur, des fichiers courts.**

Deux chemins IDE seulement : **edit** (Architect + rail) et **discuss** (ArchitectDiscussion). Le **run rail** est le seul guide edit. Tout le reste (Executor, Explore, segments, Professor, Standard CLI, guide 1.3) **sort du code** — pas de flags off + branches fantômes.

Le moteur porte la complexité en interne (filtrage outils, snapshot, stall). Le code vit en **arborescence par responsabilité**, **≤ 500 lignes par fichier**.

---

## II — Décisions figées

| # | Décision |
|---|----------|
| **D1** | Architecte seul — pas `delegate_executor`, pas `task` Explore, pas `RoleId::Executor` en prod IDE |
| **D2** | Segments ACT **option A** — supprimés ; mutations **inline** en station ACT |
| **D3** | **Rail = seul guide** — `[gate: hold\|advance]` + `[depth:]` + stations ; fin nudges/phases 1.3 |
| **D4** | **Table rase reliquats** — code mort, flags off, couches réactives redondantes |
| **D5** | **Valider avant d’étendre** — smoke → tests → ancrage ; outils d’aide après squelette |
| **D6** | **≤ 500 lignes / fichier** — dossiers = domaines ; `mod.rs` = wiring seulement (~80 L max) |
| **D7** | **Une seule vérité runtime** — seuls les chemins **canoniques** IDE restent ; tout le reste **DEL ou REPORT** (pas de flags off + code fantôme) |
| **D8** | **UI alignée sur le contrat** — Phase **2d** supprime l’UI multi-modèle / double fil (P0) ; conducteur station complet en **1.4.3** ([UI-CONDUCTEUR](UI-CONDUCTEUR.md)) |

---

## III — Contrat runtime canonique (refonte profonde)

### Problème à résoudre

Aujourd’hui le dépôt mélange **plusieurs vérités** qui coexistent sans être actives :

- flags à `false` mais branches encore exécutables si mal configurées ;
- 3 prompts edit, rail + gates 1.3 + nudges en parallèle ;
- runtimes **Professor**, **Standard CLI**, **Executor**, **Explore** dans le même `drive.rs`.

**Objectif 1.4.0** : le moteur IDE ne porte plus qu’**un contrat runtime** explicite. Le reste part du code **maintenant** ; la réintroduction éventuelle se fera **plus tard**, sur base propre, pas en reliquat.

### Contrat vs historique

| Type | Où ça vit | Règle |
|------|-----------|-------|
| **Contrat** | Code actif + FOI + smoke T3 | Ce qui tourne en prod IDE preset normal |
| **Historique** | `docs/1.4/1.4.0/archive/`, commits git, issues REPORT | Lecture seule — **jamais** `#include` / branche active |
| **REPORT** | FOI § III.3 + note CLOSURE | Produit retiré ; spec réécrite si retour (ex. Professor 2.0) |

### III.1 — Runtimes **canoniques** (seuls autorisés)

| Chemin | `RoleId` / entrée | Conducteur | Statut |
|--------|-------------------|------------|--------|
| **Edit IDE** | `Architect` + `run_rail_enabled` | Run rail | **CANON** |
| **Discuss IDE** | `ArchitectDiscussion` | Chemin court (pas rail complet) | **CANON** |
| **Permissions** | `default`, `plan`, `acceptEdits`, `analyze`… | Hors guide — sécurité outils | **CANON** (pas un 2ᵉ conducteur) |

Tout le reste dans `drive.rs` pour un autre rôle ou mode = **à supprimer**, pas à « garder minimal ».

### III.2 — Runtimes **hors contrat** (suppression 1.4.0)

| Runtime | Pourquoi ça pollue | Action | Réintroduction |
|---------|-------------------|--------|----------------|
| **Executor** + `delegate_executor` | Multi-modèle, 2ᵉ vérité prompt | **DEL** § VIII | Non — abandon produit |
| **Explore** (`task`, subagent jobs) | 2ᵉ contexte LLM | **DEL** § VIII | Post-squelette autrement |
| **Segments ACT** | Shard Executor déguisé | **DEL** § VIII | Non |
| **Professor** (`permissionMode: professor`) | 2ᵉ guide (`course_plan_write`, gates, phases teach) | **DEL** § VIII.9 | **REPORT** — Professor 2.0 hors moteur IDE |
| **Standard CLI** (`RoleId::Standard`) | 3ᵉ boucle dans `drive`, nudges `NUDGE_PROMPT` | **CUT** § VIII.9 | CLI dédié plus tard si besoin |
| **Guide 1.3** (LoopDetector, cycle_sanity, step_by_step…) | 2ᵉ conducteur parallèle au rail | **CUT** § IX | Non |
| **Prompts multiples** (`01_core*`) | Instructions contradictoires | **DEL** § VIII.6 | Un seul `01_core_rail_solo.md` |

### III.3 — Fichiers Professor / Standard à retirer

| Fichier / symbole | Action |
|-------------------|--------|
| `professor.rs` | **DEL** |
| `agent/mod.rs` — `is_professor_run` | **CUT** (ou stub erreur si appel IDE restant) |
| `drive.rs` — toutes branches `professor`, `ProfessorCourseState`, `course_plan_write` | **CUT** |
| `tool_execution.rs` — args professor | **CUT** |
| `gates.rs` — `done_gate_professor_without_plan`, `GateKind::ProfessorCoursePlan` | **CUT** |
| `run_spec` — `RoleId::Standard`, `RoleId::Executor` (enum + branches) | **CUT** (garder enum minimal si wire casse — variantes **inatteignables**) |
| `nudges/router.rs`, `loop_intervention.rs` — branches Standard / Executor | **CUT** |
| `nudges/standard.rs` — `NUDGE_PROMPT` legacy | **DEL** ou **CUT** usage |
| `helpers/tool_specs.rs` — `course_plan_write` professor | **CUT** |
| `drox-tools/simple/course_plan_write.rs` | **DEL** ou hors registry |
| `drox-cli/prompts/core_standard.rs` — blocs professor | **CUT** / fichier **REPORT** |
| `drox-cli/prompts.rs` — `professor_mode_supplement` | **CUT** |
| `agent_run.rs` — `professor_mode`, routing professor | **CUT** |
| Tests `professor_*` dans `tests/mod.rs` | **ADAPT** / supprimer |

**IDE** : `permissionMode: professor` doit **échouer clairement** ou être ignoré avec message — pas de demi-chemin silencieux.

### III.4 — Qui peut injecter un guide `system` ?

Après refonte, **liste blanche** — tout autre injecteur = bug :

| Source | Contenu autorisé |
|--------|------------------|
| Boot | `01_core_rail_solo.md` + blocs `T-*` (edit) · blocs discuss (discuss) |
| Chaque tour | `## Architect run (engine)` · `## Run rail (engine)` |
| Nudge (≤ 3) | `stall_act` · `schema_error` · `done_only` |
| Thinking | `NATIVE_THINKING_UI_SUPPLEMENT` (aligné rail) |
| **Interdit** | delegate checkpoint, cycle anchor, cycle_sanity, step_by_step, professor, parallel_slots, explore pending |

### III.5 — Vérification « zéro reliquat guide » (gate G-contrat)

À passer en **Phase 5** (idéalement script CI / checklist manuelle) :

```bash
# Échec si match hors archive/ et hors tests de non-régression explicitement listés
rg -l "delegate_executor|segment_spawn|RoleId::Executor|orchestration_delegate" drox-engine/drox/crates/drox-engine/src/agent/
rg -l "is_professor_run|ProfessorCourseState|course_plan_write" drox-engine/drox/crates/drox-engine/src/agent/
rg -l "01_core\.md|01_core_solo|parallel_slots" drox-engine/drox/crates/drox-engine/src/orchestration/prompts/
rg -l "loop_intervention|step_by_step_todo|ARCHITECT_DELEGATE" drox-engine/drox/crates/drox-engine/src/agent/
```

Critère : **0 fichier** dans `agent/` (hors `tests/` archive) sauf liste d’exception documentée en CLOSURE.

### III.6 — Ce qui reste **hors** contrat guide mais **KEEP** (infra)

| Zone | Pourquoi ce n’est pas un « reliquat guide » |
|------|---------------------------------------------|
| `compaction`, `memory`, `session` | Axe contexte — pas de 2ᵉ conducteur |
| `permissions` / hooks | Autorisation outil — orthogonal au rail |
| `drox-llm`, wire JSON-RPC | Transport |
| UI chat (1.4.3) | Affichage — pas la logique guide |

Dette structure (`compaction` 811 L) = **1.4.1**, pas une 2ᵉ vérité runtime.

---

## IV — Légende des actions

| Symbole | Signification |
|---------|---------------|
| **DEL** | Supprimer fichier ou module entier |
| **CUT** | Retirer branches, champs, symboles, contenu dans un fichier conservé |
| **MOD** | Modifier comportement ou structure sans supprimer le fichier |
| **CREATE** | Créer (n’existait pas) |
| **KEEP** | Conserver tel quel (hors scope refonte guide) |
| **SPLIT** | Découper en sous-dossiers/fichiers (règle D6) |
| **ADAPT** | Tests ou wiring à réécrire après CUT/DEL |

---

## V — Règles du chantier (obligatoires)

### 5.1 Guide — rail seul

1. **Un paradigme** — toute branche `drive` qui ne sert pas le rail **part**.
2. **Marqueurs modèle autorisés** (conduite) :

| Marqueur | Rôle |
|----------|------|
| `[gate: hold]` | Stopper → ANSWER |
| `[gate: advance]` | Accepter station candidate (mode A) |
| `[depth: short]` / `[depth: complex]` | Après READ |
| `[phase: answering]` | Texte user-facing |
| `[phase: done]` | Fin de run |

3. **Interdits** comme langage de conduite : `[phase: reading|acting|planning|testing]`, `[mode: discovery|task]`, `[task: meta]`, `[cycle: user_check]`, `cycle_sanity`.
4. **Nudges** post-Phase 3 : **≤ 3 chemins** — `stall_act`, `schema_error`, `done_only`.
5. **Outils** filtrés par station (`rail/policy.rs`) **avant** envoi au LLM.

### 5.2 Structure — fichiers légers

1. **Plafond** : aucun `.rs` sous `agent/` > **500 lignes** en fin de chantier.
2. **Un fichier = une responsabilité** — pas de `utils.rs` fourre-tout.
3. **Dossiers nommés par domaine** : `loop/drive/`, `state/`, `gates/`, `rail/`, `nudges/`, `stream/`.
4. **Ordre** : **DEL multi-modèle d’abord**, puis SPLIT sur ce qui reste — ne pas migrer du code qu’on jette.
5. **`include!("drive.rs")` 1700 lignes** → interdit ; remplacer par `loop/drive/*.rs`.
6. **`tests/mod.rs`** = `mod foo;` seulement ; corps dans `tests/<domaine>.rs`.

### 5.3 Sécurité chantier

1. **Pas de suppression aveugle** — `cargo test -p drox-engine` vert après chaque phase.
2. **Ne pas toucher** : `drox-llm`, `drox-context`, `drox-session`, `drox-permissions`, `permissions.rs`, `compaction` (split reporté 1.4.1), wire JSON-RPC (sauf CUT delegate).
3. **Commit par phase** — bloc validé = merge possible.
4. **Archive** `1.4.0/archive/` — lecture seule, jamais source d’implémentation.

---

## VI — Cible produit (recette figée)

### 6.1 Rôles

| Rôle | Statut |
|------|--------|
| **Architect** (edit) | Seul agent — rail complet |
| **ArchitectDiscussion** | Chemin court, sans rail complet |
| **Executor** | **DEL** — hors contrat |
| **Standard / Professor** | **DEL** — REPORT post-1.4 (§ III.2) |

### 6.2 Stations rail

```text
INTENT → READ → [PROPOSE] → PLAN → ACT → VERIFY → ANSWER
```

- Chemin court : `INTENT → READ → ACT → VERIFY → ANSWER`
- PROPOSE : si `[depth: complex]` + hold user

### 6.3 Outils par station (moteur filtre)

| Station | Outils visibles |
|---------|-----------------|
| INTENT, PROPOSE, ANSWER | Aucun |
| READ | reads, map, web, memory |
| PLAN | reads + `todo_write`, `architect_help` |
| ACT | reads + mutations (`file_edit`, `file_write`, `bash`, …) |
| VERIFY | `bash`, `lsp`, reads — pas de mutation |

### 6.4 Prompt edit (un seul boot)

**CREATE** : `orchestration/prompts/system/blocks/edit/01_core_rail_solo.md`  
**CREATE** : `tools/file_edit.md`, `tools/file_write.md`  
**MOD** : `edit/mod.rs` → toujours `01_core_rail_solo.md` si `run_rail_enabled`  
**DEL boot** : `01_core.md`, `01_core_solo.md`, `01_core_rail.md`, `parallel_slots.md`, `delegate_executor.md`

### 6.5 Snapshot moteur (chaque tour)

1. `## Architect run (engine)` — request, todos, focus — **pas de delegates**
2. `## Run rail (engine)` — station, depth, candidate, **action attendue**

### 6.6 Mécaniques internes (invisible modèle)

| Mécanique | Statut |
|-----------|--------|
| Filtrage `tool_specs` par station | CREATE/renforcer Phase 4 |
| `pre_gate` orienté action | MOD |
| Stall ACT (N tours sans mutation) | MOD/CREATE |
| `max_iterations` | KEEP |
| Permissions / hooks / compaction / session | KEEP |

---

## VII — Arborescence code cible (`agent/`)

```text
agent/
├── mod.rs
├── core/                    # Agent, AgentConfig
├── loop/
│   ├── drive/               # boot · iteration_start · llm_turn · post_assistant
│   ├── tools/               # execution · batch · mirror
│   ├── context/             # inject · transcript
│   ├── closure.rs
│   └── todo_gate.rs
├── state/                   # ex-architect_state (fields · snapshot · todos · workspace · rail_wire)
├── rail/                    # ex-run_rail hors segment/
├── gates/                   # done · tool_pre · record
├── nudges/                  # stall_act · done_only · schema_error
├── stream/                  # consume · loop_detect (réduit ou supprimé)
├── phases.rs                # UI stream legacy < 200 L
├── edit_start.rs
├── final_answer_guard.rs
└── tests/                   # mod mince + drive · gates · rail · state · tools
```

**Violations actuelles à résorber** :

| Lignes | Fichier | Action |
|--------|---------|--------|
| 2889 | `tests/mod.rs` | SPLIT + ADAPT |
| 1717 | `loop/drive.rs` | SPLIT → `loop/drive/*` |
| 1434 | `architect_state.rs` | CUT champs + SPLIT → `state/*` |
| 618 | `agent_stream.rs` | SPLIT → `stream/*` |
| 610 | `gates.rs` | CUT + SPLIT → `gates/*` |

---

## VIII — SUPPRIMER (DEL) — fichiers entiers

### 8.1 Multi-modèle — segments ACT

| Fichier |
|---------|
| `agent/run_rail/segment/mod.rs` |
| `agent/run_rail/segment/runner.rs` |
| `agent/run_rail/segment/trigger.rs` |
| `agent/run_rail/segment/scope.rs` |
| `agent/run_rail/segment/report.rs` |
| `agent/run_rail/segment/persist.rs` |
| `orchestration/prompts/segments/execute.md` |

### 8.2 Multi-modèle — délégation Executor

| Fichier |
|---------|
| `orchestration_delegate.rs` |
| `orchestration/truth_check.rs` |
| `orchestration/executor_deliverable.rs` |
| `orchestration/delegate_report.rs` |
| `orchestration/parallel_batch.rs` |
| `orchestration/prompts/executor.rs` |
| `orchestration/prompts/system/blocks/tools/delegate_executor.md` |
| `agent/executor_gates.rs` |

### 8.3 Multi-modèle — Explore sub-agent

| Fichier |
|---------|
| `subagent.rs` |
| `subagent_jobs.rs` |
| `agent/subagent_report_gate.rs` |
| `agent/loop/subagents.rs` |

### 8.4 Guide 1.3 — modules entiers

| Fichier |
|---------|
| `agent/cycle_sanity.rs` |
| `agent/run_rail/cycle_sanity_gate.rs` |
| `agent/nudges/loop_intervention.rs` |
| `agent/nudges/executor.rs` |
| `agent/nudges/templates/loop/` (tout le dossier — 13 fichiers) |
| `agent/architect_gates.rs` (après vidage — DEL si vide) |

### 8.5 Prompts & artefacts

| Fichier |
|---------|
| `blocks/edit/01_core.md` |
| `blocks/edit/01_core_solo.md` |
| `blocks/edit/01_core_rail.md` (après fusion dans solo) |
| `blocks/edit/parallel_slots.md` |
| 6× `blocks/tools/*_solo.md` (après fusion blocs uniques) |
| `agent/tests/_all.txt` |
| `agent/core/_agent_api.txt`, `_config.txt` |
| `agent/helpers/_misc.txt`, `_workspace.txt` |

### 8.6 drox-tools

| Fichier |
|---------|
| `simple/delegate_executor.rs` |
| `simple/task.rs` |
| `subagent.rs`, `subagent_report.rs` |
| `orchestration_delegate.rs`, `delegate_scope.rs`, `agent_output.rs` |

### 8.7 Exports `lib.rs` (modules publics)

### 8.8 Professor & Standard CLI (hors contrat — D7)

| Fichier |
|---------|
| `professor.rs` |
| `drox-tools/simple/course_plan_write.rs` |
| `drox-cli/prompts/core_standard.rs` (ou déplacer vers `docs/REPORT/`) |
| `nudges/standard.rs` (si plus aucun usage) |

| Module / export |
|-----------------|
| `pub mod orchestration_delegate` |
| `pub mod subagent`, `pub mod subagent_jobs` |
| `EngineOrchestrationDelegate`, `executor_tool_registry` |
| `EngineSubagentExecutor`, `explore_tool_registry` |
| `SubagentJobRegistry`, `RunningSubagentJob` |
| `EXECUTOR_SYSTEM_PROMPT`, `DEFAULT_EXECUTOR_MODEL` |
| `executor_user_message_from_delegate` |
| `architect_parallel_slots_supplement` |
| `is_architect_read_tool_for_delegate_cap` |

---

## IX — COUPER / DÉTRUIRE (CUT) — reliquats dans fichiers conservés

### 9.1 `drive.rs` / futur `loop/drive/*`

| Reliquat | Remplacement |
|----------|--------------|
| `LoopDetector` + `loop_intervention` | Stall ACT |
| `explore_jobs_pending_nudge` | — (DEL avec subagent) |
| `architect_cycle_sanity_*` nudges | VERIFY station |
| `ARCHITECT_RUN_CLOSABLE_NUDGE` | Simplifier clôture rail |
| `segment_spawn_request`, branches segment | — |
| `architect_delegate_cap_nudge` | — |
| `cycle_checkpoint_block` injection | Snapshot rail |
| `executor_deliverable_met` | — |
| `analyzing_phase_nudge_sent` / `ANALYZING_PHASE_NUDGE` | — |
| `MUTATING_TOOL_BEFORE_TODO_WRITE_NUDGE` | — |
| `step_by_step_todo_nudge` | Stall ACT |
| `RoleId::Executor` boot supplements | — |
| ~15 `messages.push(nudge)` | ≤ 3 chemins |
| Toutes refs `executor_delegation_enabled` | Supprimer param |

### 9.2 `architect_state` / futur `state/*`

**CUT champs** (ne pas migrer) :

```text
reads_since_delegate, mutations_since_delegate
delegate_reads_nudge_sent, delegate_mutations_nudge_sent
delegate_counts, verified_task_ids
task_delegate_scopes, task_delegate_status
last_delegate_*, last_failure, last_delegate_verified
orchestration_plan_id (si lié delegate), segment_spawned_paths
cycle_sanity*, run_closable_nudge_sent (si redondant)
work_mode_anchor (CUT — depth rail suffit)
ARCHITECT_CYCLE_ANCHOR_MARKER, cycle_anchor_block, cycle_checkpoint_block
apply_rail_segment_report
```

**KEEP champs** : `workspace_paths`, `todo_statuses`, `task_labels`, `user_request_anchor`, `rail`, reads/mutations compteurs **rail-only** si utiles.

### 9.3 `AgentConfig` + `EngineTuning`

| Champ | Action |
|-------|--------|
| `delegate_task_id` | DEL |
| `executor_deliverable_*` | DEL |
| `rail_segment_scope_paths` | DEL |
| `executor_delegation_enabled` | DEL |
| `max_reads_before_delegate` | DEL |
| `max_mutations_before_delegate_nudge` | DEL |
| `executor_subrun_max_iterations` | DEL |
| `executor_deliverable_excerpt_max_chars` | DEL |
| `executor_deliverable_met_blocked` | DEL |

**KEEP** : `run_rail_enabled: true` preset normal.

### 9.4 `gates.rs` / futur `gates/*`

| Reliquat | Action |
|----------|--------|
| `gate_testing_after_code_mutation` | CUT |
| `gate_todo_recreation_blocked` | CUT |
| `explore_second_task_block` | CUT |
| `explore_running_mutation_block` | CUT |
| `architect_delegate_cap_nudge` | CUT |
| Tests delegate pre-gate | ADAPT |

**KEEP minimal** : `done` exige `answering` ; todos ouverts bloquent `done` — **pas** de gate professor.

### 9.5 `nudges/`

| Reliquat | Action |
|----------|--------|
| `ARCHITECT_DELEGATE_*` dans `architect.rs` | CUT contenu |
| `nudges/router.rs` branches Executor | CUT |
| `NUDGE_PROMPT` legacy dans `standard.rs` | CUT usage |
| `nudges/exploration.rs` | CUT |
| `nudges/mod.rs` ré-exports legacy | CUT |

**KEEP** : `stall_act`, `schema_error`, `done_only`, `NATIVE_THINKING_UI_SUPPLEMENT` (aligné rail).

### 9.6 Prompts & orchestration

| Cible | CUT |
|-------|-----|
| `tools/mod.rs` | `TOOL_DELEGATE_EXECUTOR`, macro `tool_block_dual!`, `is_architect_read_tool_for_delegate_cap`, descriptions delegate |
| `registry.rs` | IDs `G3EditEphemeralExecutors`, `G3EditBeforeDelegating`, `G3EditCycleSanity`, `G4EditParallelSlots`, `G5*`, `TDelegate`, `CtxDelegate` |
| `protocol_markers.rs` | sanity, `[task: meta]`, `[cycle: user_check]` |
| `config.rs` | `executor_model`, `max_parallel_executors` |
| `architect_edit.rs` | `max_parallel_executors`, `parallel_slots_supplement` |
| `system/gates/edit.rs` | branche `parallel_slots` |
| `run_snapshot.rs` | section last delegate, `cycle_checkpoint_block` |
| `run_spec/mod.rs` | `delegate_executor` allowlist architect, `subagents_enabled`, usage `EXECUTOR_TOOL_ALLOWLIST` |
| `phases.rs` | guide via phases intermédiaires dans prompts |
| `architect_todo_gate.rs` | `complete_gate_for_task` noop |
| `agent_stream.rs` | cap subagent tool calls |
| `event.rs` | `SubagentStart/Done`, `RailSegmentStart/Done` (ou KEEP wire UI 1.4.3) |
| `tool_execution.rs` | `executor_deliverable_met`, segment branches |
| `closure.rs` | `finish_rail_segment_on_scope`, deliverable notice |
| `final_answer_guard.rs` | param `running_subagent_jobs` → retirer après Phase 2 |

### 9.7 drox-cli

| Cible | CUT |
|-------|-----|
| `agent_run.rs` | `ArchitectDelegateContext`, subagent wiring, `force_disable_subagents` |
| `prompts.rs` | supplément `task` explore |
| `system_prompt/registry.rs` | `register_subagent_task` |
| `main.rs` | `rail_segment_scope_paths` |

### 9.8 Professor & Standard — branches à couper

| Cible | CUT |
|-------|-----|
| `drive.rs` — `is_professor_run`, `ProfessorCourseState`, `course_plan_write`, nudges professor | CUT |
| `loop/mod.rs` — imports `done_gate_professor_without_plan` | CUT |
| `tool_execution.rs` — paramètres professor | CUT |
| `run_spec` — `RoleId::Standard`, `RoleId::Executor` branches actives | CUT |
| `GateFlags::professor_course_plan`, tuning associé | DEL |
| `nudges/router.rs` — `RoleId::Standard`, `Executor` | CUT |
| `lib.rs` — `pub mod professor` si plus utilisé | CUT |
| IDE `agent_run` — refus explicite `permissionMode: professor` | MOD |

### 9.9 Tests à ADAPT (ne pas DEL en bloc)

| Zone | Action |
|------|--------|
| `agent/tests/mod.rs` | SPLIT + supprimer tests LoopDetector, step_by_step, testing gate, todo recreation, delegate |
| Tests inline `architect_gates`, `architect_state`, `gates`, `segment/*`, `truth_check` | ADAPT ou DEL avec module |
| `run_snapshot.rs` test absence delegate en solo | **KEEP** (régression) |

---

## X — MODIFIER (MOD) — fichiers conservés à adapter

| Fichier / zone | Modification |
|----------------|--------------|
| `loop/drive.rs` → `loop/drive/*` | SPLIT + CUT reliquats ; boucle rail seule |
| `architect_state.rs` → `state/*` | SPLIT + CUT champs delegate |
| `gates.rs` → `gates/*` | SPLIT + gates minimales |
| `agent_stream.rs` → `stream/*` | SPLIT ; phases UI stream KEEP |
| `run_rail/*` (hors segment) | MOD : renommer dossier `rail/` ; commentaires → `FOI-REFONTE.md` |
| `run_rail/policy.rs` | MOD : source vérité filtrage outils |
| `run_rail/pre_gate.rs` | MOD : messages orientés action |
| `run_rail/nudges.rs` | KEEP `ACT_FAILURE_STOP` |
| `run_rail/snapshot_block.rs` | MOD : ligne « Current action » |
| `edit_start.rs` | KEEP |
| `helpers/tool_specs.rs` | CUT refs delegate |
| `orchestration/tuning/mod.rs` | CUT flags delegate + SPLIT si > 500 L |
| `lib.rs` | CUT exports § VIII.7 + `pub mod professor` |
| `discuss/*` + `architect_gate.rs` | KEEP chemin court |
| `json_response.rs` | KEEP si discuss en dépend |
| `user_message_scope.rs` | KEEP compat transcript IDE |
| `agent_run.rs` (CLI) | MOD : refus explicite `professor` IDE |

---

## XI — CRÉER (CREATE)

| Élément | Phase |
|---------|-------|
| `01_core_rail_solo.md` | 1 |
| `file_edit.md`, `file_write.md` (blocs T-*) | 1 |
| Blocs outils **uniques** (fusion dual → simple) | 1 |
| Arborescence `loop/drive/`, `state/`, `gates/`, `stream/` | 3 |
| Filtre `tour_tool_specs` par station avant LLM | 4 |
| Compteur stall ACT + nudge unique | 4 |
| `finalisation/CLOSURE-1.4.0.md` | 6 |
| Tag git `1.4.0-squelette` | 6 |

---

## XII — CONSERVER (KEEP) — ne pas toucher

| Zone | Raison |
|------|--------|
| `agent/core/`, `agent/helpers/` (hors `_*.txt`) | Entrée agent |
| `rail/policy`, `pre_gate`, `transition`, `infer`, `loop_hooks`, `boot` | Moelle conducteur |
| `permissions.rs`, `drox-permissions`, `drox-hooks` | Sécurité |
| `compaction.rs`, `memory.rs`, `long_memory`, `drox-context` | Axe contexte (split 1.4.1) |
| `drox-llm`, `drox-session`, `drox-types` | Infrastructure |
| `drox-cli/jsonrpc/` (hors CUT delegate) | Wire IDE |
| `discuss` prompts + gates | Chemin court |
| `docs/1.4/moteur/` | Carte — MAJ post-Phase 5 |
| `docs/1.4/1.4.0/archive/` | Historique lecture seule |

---

## XIII — Hors scope 1.4.0

| Élément | Report |
|---------|--------|
| Refonte UI chat / blocs rail | 1.4.3 |
| Index, graphe, ContextPack | Post-squelette |
| Nouveaux outils d’aide | Post-squelette validé |
| Split `compaction.rs` (811 L) | 1.4.1 |
| Polish events UI segment/subagent | 1.4.3 |
| **Professor 2.0** (pédagogie) | REPORT — réécriture hors moteur IDE |
| **CLI Standard** one-shot | REPORT — binaire ou crate dédié si besoin |
| **Conducteur UI complet** (strip → timeline stations, B-UI-*) | [1.4.3](../1.4.3/README.md) — après Phase **2d** P0 |

---

## XIV — Tableau d’exécution ordonné

Faire les étapes **dans l’ordre**. Ne pas sauter une gate **G**. Cocher `☐` → `☑` au fur et à mesure.

**Légende colonnes** : voir [§ IV](#iv--légende-des-actions) · **Détail** : § VIII–XI.

### Gate de validation (répéter après chaque bloc)

| Gate | Commande / critère |
|------|-------------------|
| **G-test** | `cargo test -p drox-engine` vert |
| **G-build** | `cargo build -p drox-cli` OK |
| **G-smoke** | Discuss « Bonjour » + edit trivial (`file_read`) |
| **G-lignes** | Aucun `agent/**/*.rs` > 500 L |
| **G-prompt** | Un seul boot edit : `01_core_rail_solo.md` |
| **G-contrat** | Grep § III.5 — 0 reliquat guide hors exceptions CLOSURE |
| **G-ui** | Checklist [UI-CONDUCTEUR § VIII](UI-CONDUCTEUR.md#viii--checklist-cohérence-post-chantier) — modules P0 retirés |

---

### Phase 0 — Doc (fait)

| # | ☐ | Action | Type | Gate |
|---|-----|--------|------|------|
| 0.1 | ☑ | FOI, audit, suppressions, structure figés | — | — |

---

### Phase 1 — Prompt & boot produit

| # | ☐ | Action | Type | Réf |
|---|-----|--------|------|-----|
| 1.1 | ☑ | **CREATE** `01_core_rail_solo.md` (rail, marqueurs § IV.1, sans reliquats 1.3) | CREATE | § V.4 |
| 1.2 | ☑ | **CREATE** `tools/file_edit.md`, `tools/file_write.md` | CREATE | § X |
| 1.3 | ☑ | **MOD** `edit/mod.rs` → toujours `01_core_rail_solo.md` si `run_rail_enabled` | MOD | § V.4 |
| 1.4 | ☑ | **CUT** `tools/mod.rs` : supprimer `tool_block_dual!`, un bloc par outil | CUT | § VIII.6 |
| 1.5 | ☑ | **DEL** 6× `*_solo.md` outils + fusion contenu dans blocs uniques | DEL | § VII.5 |
| 1.6 | ☑ | **CUT** `system/gates/edit.rs` : retirer `parallel_slots` | CUT | § VIII.6 |
| 1.7 | ☑ | **CUT** `architect_edit.rs` : retirer `max_parallel_executors` | CUT | § VIII.6 |
| 1.8 | ☑ | **MOD** `NATIVE_THINKING_UI_SUPPLEMENT` : aligner rail (pas `[phase: acting]`) | MOD | § VIII.5 |
| 1.9 | ☑ | **DEL boot** : `01_core.md`, `01_core_solo.md`, `01_core_rail.md`, `parallel_slots.md` | DEL | § VII.5 |
| 1.10 | ☑ | **CUT** `registry.rs` : IDs G3/G4/G5/TDelegate/CtxDelegate morts | CUT | § VIII.6 |
| 1.11 | ☑ | Vérifier preset **normal** : `run_rail_enabled: true` | MOD | § VIII.3 |
| | | | | **G-test** · **G-build** · **G-prompt** |

---

### Phase 2a — Suppression segments ACT

| # | ☐ | Action | Type | Réf |
|---|-----|--------|------|-----|
| 2a.1 | ☑ | **DEL** `run_rail/segment/` (6 fichiers) | DEL | § VII.1 |
| 2a.2 | ☑ | **DEL** `prompts/segments/execute.md` | DEL | § VII.1 |
| 2a.3 | ☑ | **CUT** `drive.rs` : branches `segment_spawn`, `run_segment_for_tool` | CUT | § VIII.1 |
| 2a.4 | ☑ | **CUT** `tool_execution.rs`, `closure.rs` : segment / deliverable | CUT | § VIII.6 |
| 2a.5 | ☑ | **DEL** `AgentConfig::rail_segment_scope_paths` + CLI `main.rs` | DEL | § VIII.3, VIII.7 |
| 2a.6 | ☑ | **CUT** `run_rail/mod.rs`, `state.rs` : exports et champs segment | CUT | § VIII.2 |
| 2a.7 | ☑ | **ADAPT** tests segment (`trigger`, `runner`, `scope`, `architect_state`) | ADAPT | § VIII.8 |
| | | | | **G-test** · **G-build** |

---

### Phase 2b — Suppression multi-modèle (delegate + explore)

| # | ☐ | Action | Type | Réf |
|---|-----|--------|------|-----|
| 2b.1 | ☑ | **DEL** `orchestration_delegate.rs`, `truth_check.rs` | DEL | § VII.2 |
| 2b.2 | ☑ | **DEL** `executor_deliverable.rs`, `delegate_report.rs`, `parallel_batch.rs` | DEL | § VII.2 |
| 2b.3 | ☑ | **DEL** `prompts/executor.rs`, `delegate_executor.md` | DEL | § VII.2 |
| 2b.4 | ☑ | **DEL** `subagent.rs`, `subagent_jobs.rs`, `loop/subagents.rs`, `subagent_report_gate.rs` | DEL | § VII.3 |
| 2b.5 | ☑ | **DEL** `executor_gates.rs`, `architect_gates.rs` | DEL | § VII.4 |
| 2b.6 | ☑ | **CUT** `lib.rs` : modules et exports delegate/subagent/Executor | CUT | § VII.7 |
| 2b.7 | ☑ | **CUT** `run_spec` : allowlist delegate, `subagents_enabled`, `EXECUTOR_*` usage architect | CUT | § VIII.6 |
| 2b.8 | ☑ | **CUT** `EngineTuning` + `AgentConfig` : tous champs delegate (§ VIII.3) | CUT | § VIII.3 |
| 2b.9 | ☑ | **CUT** `architect_state` : champs delegate/segment (§ VIII.2) — pas de migration | CUT | § VIII.2 |
| 2b.10 | ☑ | **CUT** `drive.rs` : toutes branches `executor_delegation_enabled`, deliverable, explore | CUT | § VIII.1 |
| 2b.11 | ☑ | **CUT** `protocol_markers.rs`, `config.rs` (executor_model, parallel) | CUT | § VIII.6 |
| 2b.12 | ☑ | **CUT** `run_snapshot.rs`, `helpers/tool_specs.rs`, `final_answer_guard` (subagent jobs) | CUT | § VIII.6 |
| 2b.13 | ☑ | **DEL drox-tools** : delegate_executor, task, subagent*, orchestration_delegate, agent_output | DEL | § VII.6 |
| 2b.14 | ☑ | **CUT drox-cli** : `agent_run.rs` wiring delegate/subagent, `prompts.rs` task | CUT | § VIII.7 |
| 2b.15 | ☑ | **ADAPT** tests inline delegate/truth_check/subagent | ADAPT | § IX.9 |
| | | | | **G-test** · **G-build** · **G-smoke** |

---

### Phase 2c — Hors contrat runtime (Professor + Standard CLI)

| # | ☐ | Action | Type | Réf |
|---|-----|--------|------|-----|
| 2c.1 | ☑ | **DEL** `professor.rs` | DEL | § VIII.8, § III.3 |
| 2c.2 | ☑ | **CUT** `drive.rs` : tout le chemin `professor` / `course_plan_write` | CUT | § IX.8 |
| 2c.3 | ☑ | **CUT** `tool_execution.rs`, `loop/mod.rs`, `gates.rs` : professor gates | CUT | § IX.8 |
| 2c.4 | ☑ | **CUT** `run_spec` : branches `RoleId::Standard` actives ; `GateKind::ProfessorCoursePlan` | CUT | § IX.8 |
| 2c.5 | ☑ | **CUT** `nudges/router.rs`, `loop_intervention.rs`, `standard.rs` : Standard / Executor | CUT | § IX.8 |
| 2c.6 | ☑ | **DEL** `drox-tools/course_plan_write.rs` + retrait registry | DEL | § VIII.8 |
| 2c.7 | ☑ | **CUT** `drox-cli` : professor supplement, `core_standard.rs` professor blocks | CUT | § IX.8 |
| 2c.8 | ☑ | **MOD** IDE : `permissionMode: professor` → erreur ou downgrade documenté | MOD | § III.3 |
| 2c.9 | ☑ | **ADAPT** tests `professor_*` | ADAPT | § IX.9 |
| 2c.10 | ☑ | **CREATE** note REPORT [professor-2.0.md](../REPORT/professor-2.0.md) | CREATE | § XIII |
| | | | | **G-test** · **G-build** · **G-contrat** (partiel) |

---

### Phase 2d — Alignement UI fork VS Code (P0)

**Code** : `src/vs/workbench/contrib/drox/` · **Spec** : [UI-CONDUCTEUR.md](UI-CONDUCTEUR.md) § III–IV

Objectif : même vérité que le moteur côté affichage — retirer modules morts et réglages fantômes **avant** dogfood Phase 4–5. Ne pas attendre 1.4.3 pour le nettoyage P0.

| # | ☐ | Action | Type | Réf |
|---|-----|--------|------|-----|
| 2d.1 | ☑ | **DEL** chargement + dossier `media/droxChat/stream/executor/` (`capture.js`, `subagents.js`) | DEL | UI § III P0 |
| 2d.2 | ☑ | **CUT** `run-rail-stations.js` : `renderRailSegment*`, `runRailSegmentCards` | CUT | UI § III |
| 2d.3 | ☑ | **CUT** `droxChatAgentEvents.ts` : handlers `railSegment*`, `subagent*` ; skip `delegate_executor` (garder) | CUT | UI § III |
| 2d.4 | ☑ | **DEL** `common/railSegmentTypes.ts` segment wire (garder station types) | DEL/CUT | UI § III |
| 2d.5 | ☑ | **DEL** `stream/timeline/architect-rail.js` + retrait `droxChatWebview.ts` | DEL | UI § III |
| 2d.6 | ☑ | **CUT** `stream/messages/orchestration.js` : bannière « delegation » | CUT | UI § III |
| 2d.7 | ☑ | **CUT** `display/simple.js`, `overrides.js`, `phases.js` : branches `isExecutorUiContext` | CUT | UI § III P1 partiel |
| 2d.8 | ☑ | **CUT** settings : `role-models` executor, `droxEngineTuningConfiguration` delegate/executor, `droxRunSettings` parallel/subagents | CUT | UI § III |
| 2d.9 | ☑ | **CUT** `droxToolGroups.ts` professor ; **MOD** `permissionMode: professor` → refus ou message IDE | CUT/MOD | UI § III, § 2c.8 |
| 2d.10 | ☑ | **DEL** `droxOrchestrationUi.ts` (ou corps vide + flag retiré) | DEL | UI § III |
| 2d.11 | ☑ | **CUT** `droxExploreTools.ts` / `logTools.js` badges `task` explore | CUT | UI § III |
| 2d.12 | ☑ | **ADAPT** replay/export/tests : `droxUiReplayExport.ts`, `droxCommon.test.ts` (segment, subagent, delegate) | ADAPT | UI § III |
| 2d.13 | ☑ | **MOD** libellés strip `banner` : plus de « delegation » (solo architecte) | MOD | UI § II |
| 2d.14 | ☐ | Smoke UI manuel : edit trivial — **cartes station** visibles, pas de carte subagent/segment | — | UI § VIII |
| | | | | **G-ui** · Reload Window |

**Hors Phase 2d** (report **1.4.3**) : fusion `strip.js` → conducteur station unique § UI-VI, B-UI-01…07, CSS tray/layout.

---

### Phase 3 — Élagage guide 1.3 + découpage structure

| # | ☐ | Action | Type | Réf |
|---|-----|--------|------|-----|
| 3.0 | ☑ | **DEL** artefacts : `tests/_all.txt`, `core/_*.txt`, `helpers/_*.txt` | DEL | § VII.5 |
| 3.1 | ☑ | **DEL** `cycle_sanity.rs`, `run_rail/cycle_sanity_gate.rs` | DEL | § VII.4 |
| 3.2 | ☑ | **DEL** `nudges/loop_intervention.rs`, `templates/loop/`, `nudges/executor.rs`, `exploration.rs` | DEL | § VII.4 |
| 3.3 | ☑ | **CUT** `drive.rs` : LoopDetector, cycle_sanity, run_closable, analyzing, step_by_step, plan-before-mutation | CUT | § VIII.1 |
| 3.4 | ☑ | **CUT** `nudges/architect.rs` : contenu delegate ; **CUT** `router.rs`, `standard.rs` legacy | CUT | § VIII.5 |
| 3.5 | ☑ | **CUT** `gates.rs` : testing, todo recreation, explore task, delegate cap | CUT | § VIII.4 |
| 3.6 | ☑ | **CUT** `architect_todo_gate.rs` noop ; **CUT** cycle_anchor/checkpoint dans state + snapshot | CUT | § VIII.2, VIII.6 |
| 3.7 | ☑ | **CUT** `work_mode_anchor` + refs `[mode:]` dans drive/snapshot | CUT | § VIII.2 |
| 3.8 | ☑ | **CREATE** dossiers `loop/drive/`, `state/`, `gates/`, `nudges/`, `stream/` | CREATE | § VI |
| 3.9 | ☑ | **SPLIT** `drive.rs` → `loop/drive/{mod,boot,iteration_start,llm_turn,post_assistant}.rs` | SPLIT | § VI |
| 3.10 | ☑ | **SPLIT** `architect_state.rs` → `state/{fields,snapshot,todos,workspace,rail_wire}.rs` | SPLIT | § VI |
| 3.11 | ☑ | **SPLIT** `gates.rs` → `gates/{mod,done,tool_pre,record}.rs` | SPLIT | § VI |
| 3.12 | ☑ | **SPLIT** `agent_stream.rs` → `stream/{mod,consume}.rs` (loop_detect réduit ou DEL) | SPLIT | § VI |
| 3.13 | ☑ | **CREATE** `nudges/{stall_act,done_only,schema_error}.rs` — ≤ 3 chemins dans drive | CREATE | § V.1 |
| 3.14 | ☑ | **SPLIT** `tests/mod.rs` → `tests/{drive,gates,rail,state,tools}.rs` ; mod < 80 L | SPLIT | § VI |
| 3.15 | ☑ | **ADAPT** tests legacy 1.3 (LoopDetector, step_by_step, testing gate…) | ADAPT | § VIII.8 |
| 3.16 | ☑ | **MOD** renommer `run_rail/` → `rail/` (optionnel, si fait : MAJ imports) | MOD | § VI |
| | | | | **G-test** · **G-build** · **G-lignes** |

---

### Phase 4 — Mécaniques rail internes

| # | ☐ | Action | Type | Réf |
|---|-----|--------|------|-----|
| 4.1 | ☑ | **MOD** filtrer `tour_tool_specs` par `policy::tool_allowed(station)` avant LLM | MOD | § VI.6 |
| 4.2 | ☑ | **MOD** `snapshot_block` : ligne verify + blocage advance ANSWER | MOD | § VI.5 |
| 4.3 | ☑ | **MOD** `pre_gate` : messages orientés action (pas « advance to verify ») | MOD | § VI.6 |
| 4.4 | ☑ | **CREATE** compteur stall ACT + nudge unique (`act_stall.rs`) | CREATE | § VI.6 |
| 4.5 | ☑ | **CUT** `infer.rs` si redondant avec filtrage amont — **KEEP** (alignement station post-tour) | CUT | § X |
| 4.6 | ☑ | **CREATE** boucle VERIFY : `verify.rs`, `VerifyOutcome`, tests transition + verify | CREATE | B-MOTOR-02 |
| 4.7 | ☑ | Tests unitaires filtrage specs tour | ADAPT | [09-TEST-PLAN](09-TEST-PLAN.md) |
| | | | | **G-test** · **G-smoke** (T2.2 skill_list invisible en ACT) |

---

### Phase 5 — Validation & ancrage

| # | ☐ | Action | Type | Réf |
|---|-----|--------|------|-----|
| 5.1 | ☐ | `cargo test -p drox-engine` + `cargo test -p drox-tools` | — | T0 |
| 5.2 | ☐ | Rebuild `drox.exe` + Reload Window IDE | — | T0 |
| 5.3 | ☐ | Audit lignes `agent/**/*.rs` (T0.4) | — | § VI |
| 5.4 | ☐ | Smoke discuss (T1) + rail minimal (T2) | — | [09-TEST-PLAN](09-TEST-PLAN.md) |
| 5.5 | ☐ | Smoke feature site-kdds / Qwen 27B (T3) — [chat réf](../../1.3/chat_qwen27b.txt) | — | § XIV |
| 5.6 | ☐ | Mettre à jour [SMOKE-BACKLOG](SMOKE-BACKLOG.md) (résolu / reporté 1.4.1) | — | — |
| 5.7 | ☐ | Signer [09-TEST-PLAN](09-TEST-PLAN.md) | — | § XIV |
| 5.8 | ☐ | MAJ [moteur/](../moteur/README.md) + [02-boucle-agent](../moteur/02-boucle-agent/README.md) | — | § XII |
| 5.9 | ☐ | **G-contrat** : grep § III.5 — 0 reliquat guide (liste exceptions dans CLOSURE) | — | § III.5 |
| 5.10 | ☐ | **G-ui** : checklist UI-CONDUCTEUR § VIII | — | Phase 2d |
| | | | | **Toutes gates** |

---

### Phase 6 — Clôture release

| # | ☐ | Action | Type | Réf |
|---|-----|--------|------|-----|
| 6.1 | ☐ | **CREATE** `finalisation/CLOSURE-1.4.0.md` (livrables, retiré, report 1.4.1+) | CREATE | § X |
| 6.2 | ☐ | Tag git `1.4.0-squelette` | — | § X |
| 6.3 | ☐ | Commentaires `rail/mod.rs` → pointer FOI, pas archive | MOD | § IX |

---

### Vue synthétique des phases

```text
0 Doc ✓  →  1 Prompt ✓  →  2a Segments ✓  →  2b Multi-modèle ✓  →  2c Professor/Standard ✓
     →  2d UI fork P0 ~  →  3 Élagage+Split …  →  4 Rail interne ~  →  5 Validation  →  6 CLOSURE
                                        └─ 1.4.3 : conducteur UI complet (UI-2)
```

**Règles d’or** :

1. Ne pas commencer Phase **3** (SPLIT moteur) avant **2a + 2b + 2c** terminées.
2. Phase **2d** (UI) : idéalement **après 2b** (events segment/subagent morts) ; au plus tard **avant smoke Phase 5**.
3. Après Phase 2, le `drive` et le **chat webview** ne portent plus que **Architect** + **ArchitectDiscussion** (+ infra permissions).

**Prochaine étape** : smoke **2d.14** / **Phase 5** (dogfood) + **Phase 6** clôture. **Phases 3–4** ☑ (hors smoke manuel T1–T3).

---

## XV — Critères de done (squelette ancré)

- [ ] **Contrat runtime** § III : seuls edit rail + discuss IDE
- [ ] Un seul prompt edit : `01_core_rail_solo.md`
- [ ] `run_rail_enabled: true` preset normal
- [ ] Zéro chemin actif vers Executor / segment / delegate / explore / **professor / Standard CLI**
- [ ] **G-contrat** § III.5 vert
- [ ] **G-ui** : Phase 2d faite ([UI-CONDUCTEUR](UI-CONDUCTEUR.md) § VIII)
- [ ] ≤ 3 nudges dans le guide
- [ ] Filtrage outils par station avant LLM
- [ ] Stall ACT opérationnel
- [ ] Aucun `agent/**/*.rs` > 500 lignes
- [ ] `tests/mod.rs` < 80 lignes
- [ ] `cargo test -p drox-engine` vert
- [ ] Smoke site-kdds : plan optionnel + ≥1 mutation + verify + done
- [ ] [09-TEST-PLAN](09-TEST-PLAN.md) signé

---

## XVI — Index des annexes

| Document | Rôle |
|----------|------|
| [FOI-REFONTE.md](FOI-REFONTE.md) | **Ce fichier — référence unique** |
| [PLAN-ATTAQUE.md](PLAN-ATTAQUE.md) | Phases, suivi, risques |
| [SQUELETTE.md](SQUELETTE.md) | Recette produit (extrait Partie V) |
| [STRUCTURE-CODE.md](STRUCTURE-CODE.md) | Détail arborescence + anti-patterns |
| [SUPPRESSIONS.md](SUPPRESSIONS.md) | Inventaire tiers 1–6 (miroir Partie VII–VIII) |
| [AUDIT-RELIQUATS.md](AUDIT-RELIQUATS.md) | Analyse pré-refonte, heatmap drive |
| [09-TEST-PLAN.md](09-TEST-PLAN.md) | Validation T0–T4 |
| [SMOKE-BACKLOG.md](SMOKE-BACKLOG.md) | Journal dogfood |
| [archive/](archive/README.md) | Première tentative 1.4.0 — obsolète |

---

*Document de référence — Drox 1.4.0 deuxième édition — juin 2026*
