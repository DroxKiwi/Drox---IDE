# Plan d’attaque — table rase 1.4.0

**Référence** : [FOI-REFONTE.md](FOI-REFONTE.md) (fait foi) · **Recette** : [SQUELETTE](SQUELETTE.md) · **Structure** : [STRUCTURE-CODE](STRUCTURE-CODE.md)

Objectif : repartir **propre et simple** — moelle épinière rail + architecte seul — **fichiers ≤ 500 lignes**, dossiers par responsabilité — puis **tester, ancrer**, avant toute extension.

---

## Règles du chantier

1. **Pas de suppression aveugle** — chaque tier a des critères de done + tests.
2. **Un paradigme de guide** — si une branche `drive` ne sert pas le rail, elle part.
3. **Conserver** axes contexte (06), tools (04), permissions (05), wire (01) — on nettoie le **guide** (08/09).
4. **≤ 500 lignes / fichier** — split + dossiers ([STRUCTURE-CODE](STRUCTURE-CODE.md)) ; pas de nouveau monolithe.
5. **Commit par phase** — bloc validé = merge possible.
6. **Archive** — l’ancienne spec reste dans [archive/](archive/README.md), on ne la supprime pas.

---

## Vue d’ensemble

```text
Phase 0 ─ Doc figée (ce dossier)
Phase 1 ─ Prompt unique + flags produit
Phase 2a–2c ─ Retrait multi-modèle + professor/standard
Phase 2d ─ Alignement UI fork VS Code (P0) — [UI-CONDUCTEUR](UI-CONDUCTEUR.md)
Phase 3 ─ Élagage guide 1.3 dans drive/gates/nudges
Phase 4 ─ Mécaniques internes rail (filtre outils, stall ACT, snapshot action)
Phase 5 ─ Tests + smoke + ancrage
Phase 6 ─ CLOSURE 1.4.0 (tag squelette)
```

---

## Phase 0 — Documentation (fait / en cours)

| Livrable | Statut |
|----------|--------|
| README, SQUELETTE, PLAN-ATTAQUE, STRUCTURE-CODE, SUPPRESSIONS | Ce commit doc |
| Décisions D1–D6 | [README](README.md) |
| Archive première tentative | `archive/` |

**Done** : équipe alignée sur recette avant de toucher `drive.rs`.

---

## Phase 1 — Prompt & produit (1–2 j)

### Actions

- Créer `01_core_rail_solo.md` ([SQUELETTE](SQUELETTE.md)).
- `edit::core()` : toujours rail solo si `run_rail_enabled` (supprimer branche `01_core` délégation et `01_core_solo` flexible).
- Ajouter blocs `T-*` pour `file_edit` / `file_write`.
- Aligner `NATIVE_THINKING_UI_SUPPLEMENT` sur rail (pas de `[phase: acting]`).
- `run_rail_enabled: true` preset **normal** (déjà le cas — vérifier IDE).

### Done

- [ ] Un seul system prompt pour architect edit
- [ ] grep repo : plus de référence boot à `01_core.md` / `parallel_slots` en chemin actif

### Tests

- Compilation `drox-engine` + lecture diff prompt généré (log boot)

---

## Phase 2 — Retrait multi-modèle (2–4 j)

### Actions

Voir [SUPPRESSIONS.md — Tier 2](SUPPRESSIONS.md#tier-2--multi-modèle-produit).

Résumé :

- Retirer `run_rail/segment/` entier (option A).
- Retirer branches `segment_spawn` dans `drive.rs` / `tool_execution.rs`.
- Désactiver puis supprimer : `orchestration_delegate.rs`, `subagent.rs`, `subagent_jobs.rs`, `subagent_report_gate.rs`, `loop/subagents.rs`.
- Retirer `delegate_executor` de `ARCHITECT_TOOL_ALLOWLIST` et registry chemin architect.
- Retirer prompts : `executor.rs`, `segments/execute.md`, `delegate_executor.md`, `parallel_slots.md`.
- Nettoyer `architect_state` : champs delegate / segment / deliverable.
- Nettoyer `AgentConfig` : `executor_deliverable_*`, `rail_segment_scope_paths`, etc.

### Done

- [ ] Aucun `RoleId::Executor` instancié en run IDE
- [ ] `cargo test -p drox-engine` vert (adapter/supprimer tests delegate/segment)

### Risque

Gros diff — faire en sous-PR si besoin : segment d’abord, puis delegate, puis explore.

---

## Phase 3 — Élagage guide 1.3 + structure (3–5 j)

### Actions

Voir [SUPPRESSIONS — Tier 1 & 3](SUPPRESSIONS.md) et [STRUCTURE-CODE](STRUCTURE-CODE.md).

**Élagage logique** :

- **`loop/drive/`** : supprimer branches nudges multiples, step-by-step delegate, cycle sanity, explore jobs, segment spawn.
- **`gates/`** : garder **minimal** (`done`, `tool_pre`, `record`) — voir arborescence cible.
- **`nudges/`** : `stall_act`, `schema_error`, `done_only` — supprimer le reste.
- **`stream/`** : extraire `agent_stream.rs` ; réduire ou supprimer `LoopDetector`.
- **`phases.rs`** : UI legacy stream seulement.
- **`architect_gates.rs`**, **`executor_gates.rs`** : supprimer.

**Découpage structure** (même phase, tests verts à chaque move) :

1. `loop/drive.rs` (1717) → `loop/drive/{mod,boot,iteration_start,llm_turn,post_assistant}.rs`
2. `architect_state.rs` (1434) → `state/{fields,snapshot,todos,workspace,rail_wire}.rs`
3. `gates.rs` (610) → `gates/{mod,done,tool_pre,record}.rs`
4. `agent_stream.rs` (618) → `stream/{mod,consume,loop_detect}.rs`
5. `tests/mod.rs` (2889) → `tests/{drive,gates,rail,state,tools}.rs`

### Done

- [ ] Aucun `.rs` sous `agent/` > **500 lignes**
- [ ] `tests/mod.rs` < 80 lignes (déclarations `mod` seulement)
- [ ] Un seul chemin nudge quand tour vide en rail ACT
- [ ] Tests gates/nudges adaptés

---

## Phase 4 — Mécaniques internes rail (2–3 j)

### Actions

1. **Filtrer `tour_tool_specs`** par `run_rail::policy::tool_allowed(station)` avant `stream_chat`.
2. **Snapshot actionnable** : ligne « Current action » dérivée du focus todo + station.
3. **Stall ACT** : compteur tours sans mutation ; après N → nudge `file_write` template ou `EngineError::ActStall`.
4. **Messages `pre_gate`** orientés action (« en ACT, utilise file_write ») — pas « advance to verify ».
5. Simplifier `infer.rs` si redondant avec filtrage amont.

### Done

- [ ] Smoke : plus de `skill_list` visible en ACT
- [ ] Smoke : après erreur schéma, recovery en ≤3 tours

### Tests

- Tests unitaires `policy` + filtrage specs
- Test stall ACT (mock tour vide)

---

## Phase 5 — Validation & ancrage (2–3 j)

### Scénario smoke principal

Workspace `site-kdds`, preset normal, Qwen 27B (ou modèle de référence) :

1. Demande feature (2ᵉ section scroll-snap) — [chat référence](../../1.3/chat_qwen27b.txt)
2. Rail visible (stations UI)
3. Plan optionnel mais si présent : progression todos
4. ≥1 mutation réelle
5. VERIFY (bash ou lsp)
6. `[phase: answering]` + `[phase: done]` sans boucle >15 min

### Checklist

- [ ] [09-TEST-PLAN](09-TEST-PLAN.md) mis à jour et signé
- [ ] [SMOKE-BACKLOG](SMOKE-BACKLOG.md) : entrées résolues / reportées 1.4.1
- [ ] `cargo test -p drox-engine`
- [ ] Rebuild `drox.exe` + Reload Window IDE

### Ancrage

- Tag git `1.4.0-squelette` ou CLOSURE doc
- Commentaires module `rail/mod.rs` → pointer `SQUELETTE.md` pas `archive/`
- [moteur/](../moteur/README.md) + [02-boucle-agent](../moteur/02-boucle-agent/README.md) mis à jour
- Audit lignes : script ou checklist [09-TEST-PLAN T0.4](09-TEST-PLAN.md)

---

## Phase 6 — CLOSURE (après smoke vert)

Rédiger `finalisation/CLOSURE-1.4.0.md` (nouveau, pas l’archive) :

- Livrables squelette
- Ce qui a été **retiré** (liste Tier 2)
- Report 1.4.1 (bugs UI/session) · 1.4.3 (UI) · outils d’aide (post-squelette)

---

## Ce qu’on ne fait PAS dans cette table rase

| Hors scope | Pourquoi |
|------------|----------|
| Refonte UI chat | 1.4.3 |
| Index / graphe / ContextPack | Après squelette |
| Nouveaux outils d’aide | Après squelette validé |
| Supprimer permissions / compaction / session | Autres axes — stables |
| Professor mode complet | Sauf si bloque build — sinon minimal |

---

## Prochaine action immédiate

**Phase 1** : créer `01_core_rail_solo.md` + brancher `edit::core()`.

Ensuite **Phase 2** segment + delegate (gros diff isolé).

---

## Suivi

| Phase | Début | Done | Notes |
|-------|-------|------|-------|
| 0 Doc | | ☐ | |
| 1 Prompt | | ☐ | |
| 2 Multi-modèle | | ☐ | |
| 3 Guide 1.3 | | ☐ | |
| 4 Rail interne | | ☐ | |
| 5 Validation | | ☐ | |
| 6 CLOSURE | | ☐ | |
