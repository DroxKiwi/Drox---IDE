# Plan d’implémentation — prompts additifs, variables & contexte run (1.3.2)

> **OBSOLÈTE** — Phases paliers `E-*` et injection par gate **annulées** (juin 2026). Conservé : `T-*` au boot + `01_core`. Référence : [CONDUCTEUR-CODE.md](CONDUCTEUR-CODE.md) · [gates/ARCHIVE.md](gates/ARCHIVE.md).

**Date** : 2026-06-03 (maj registre `EngineTuning` + architecture injection)  
**Statut** : 🔄 en cours — phases **1–2** et **3a** (presets + 5 champs) livrées en code ; **3b+** = `custom` + struct complète moteur.  
**Pilier release** : [CLOSURE-1.3.2](finalisation/CLOSURE-1.3.2.md) §4 (durcissement moteur) · pilier 1 (gate discuss/edit)  
**Liens** :

| Document | Rôle |
|----------|------|
| [PROMPTS-ADDITIFS-1.3.2.md](PROMPTS-ADDITIFS-1.3.2.md) | Design détaillé (vocabulaire, inventaire blocs, machine à paliers) |
| [PROMPTS-REINJECTE-1.3.2.md](PROMPTS-REINJECTE-1.3.2.md) | Audit doublons injection actuelle |
| [10-parametrage-prompts-strictesse.md](../../feature-brainstorm/10-parametrage-prompts-strictesse.md) | Registre variables A*–I* · presets `relaxed` \| `normal` \| `strict` |
| [PLAN-ALIGNEMENT-PROMPTS-ORCHESTRATION.md](PLAN-ALIGNEMENT-PROMPTS-ORCHESTRATION.md) | Chantiers A–E (EN, `role_split`, UI) — **chantier F = ce plan** |
| [CIRCUIT-MOTEUR-GATES-NUDGES.md](CIRCUIT-MOTEUR-GATES-NUDGES.md) | Gates / nudges existants |
| [RULES.md](../../../../RULES.md) §6 | Interdiction listes heuristiques sur message user |

**Code racine** : `drox-engine/drox/crates/drox-engine/src/orchestration/prompts/`

---

## 1. Objectif

Adapter Drox aux **petits modèles** en ne chargeant plus un manuel edit unique (~8k car.) à chaque tour, mais en **additionnant** :

1. un **noyau** court par gate (`intent` · `discuss` · `edit` · `executor`) ;
2. un **supplément palier** edit (`E-plan`, `E-delegate`, …) — *quoi faire maintenant* ;
3. des **suppléments outil** (`T-todo_write`, `T-delegate_executor`, …) — *comment* appeler les outils **pertinents à ce palier** (concaténés après le palier) ;
4. un **snapshot contexte run** (prompt user, todos, delegate, …) régénéré à chaque tour ;
5. des **variables** résolues depuis la **sévérité moteur** (`{read_budget_percent}`, `{max_reads_before_delegate}`, …).

**Hors scope** : classifier le message user par listes de mots-clés (routage = gate RPC / tour intent / marqueurs).

---

## 2. Principes (rappel)

| # | Règle |
|---|--------|
| P1 | Le **moteur** choisit palier + blocs ; le modèle ne « feuillette » pas tout le playbook. |
| P2 | **Protocole** (statique) ≠ **état run** (dynamique) — les deux sont additifs. |
| P3 | Placeholders `{nom}` dans les `.md` → résolus par `PromptVars::render` (pas de logique dans le texte). |
| P4 | Un fichier `.md` (ou module) = **un bloc** listé dans `registry::PromptBlockId`. |
| P5 | Comportement prod inchangé tant que la phase « legacy monolith » n’est pas remplacée explicitement. |
| P6 | **Schéma API** (function calling) = syntaxe JSON canonique ; **bloc `T-*`** = protocole métier, ordre, pièges — pas de doublon mot pour mot avec `Tool::description`. |
| P7 | Les blocs **`T-*`** injectés sont la **union** des outils autorisés pour le **palier courant** (matrice palier × outil), pas la liste complète allowlist à chaque tour. |

---

## 2.1 Trois couches pour les outils (validé 2026-06-03)

| Couche | Source | Rôle | Toujours présent ? |
|--------|--------|------|-------------------|
| **A — Schéma** | `drox-tools` : `Tool::description` + `input_schema` | JSON valide, champs requis, types | Oui — outils visibles dans l’API LLM (`RunSpec` allowlist) |
| **B — Protocole palier `E-*`** | `supplements/edit/e_plan.md` … | Enchaînement : map → plan → delegate | Si palier edit |
| **C — Protocole outil `T-*`** | `blocks/tools/todo_write.md` … | *Quand* l’appeler, *erreurs à éviter*, exemple **métier** (ids `t1`, liste complète, …) | **Uniquement** si l’outil est dans la matrice pour ce palier |

Le modèle a **besoin des deux** B et C sur petits modèles : le schéma seul ne dit pas « appelle `todo_write` avant `delegate_executor` » ; le `.md` palier seul ne rappelle pas le wrapper `{"todos":[…]}`.

**Ordre d’injection `system` (edit, cible)** :

```text
G3-core → E-<palier> → T-<outil1> → T-<outil2> → … → CTX-run-snapshot → (nudge)
```

### Matrice palier × blocs outil (à implémenter — phase 1b)

| Palier | Blocs `T-*` injectés (proposition) |
|--------|-------------------------------------|
| `E-none` | *(aucun outil de travail)* |
| `E-plan` | `workspace_map_read`, `todo_write`, `architect_help` (optionnel court) |
| `E-discovery` | idem plan + rappel volume lignes plan |
| `E-delegate` | `delegate_executor`, `todo_write` (statuts), `file_read` (scope) |
| `E-verify` | `file_read`, `grep`, `lsp`, `todo_write` (`completed`) |
| `E-sanity` | `delegate_executor` (task sanity), `ask_user_question` |
| `E-close` | *(marqueurs `[phase: …]` dans core — pas d’outil)* |

Gate **discuss** : matrice séparée (`file_read`, `grep`, … + `read_budget`) — pas de `todo_write` / `delegate_executor`.

**Arborescence cible** :

```text
system/blocks/tools/
  todo_write.md
  workspace_map_read.md
  delegate_executor.md
  file_read.md
  grep.md
  glob.md
  lsp.md
  architect_help.md
  ask_user_question.md
  …
```

Chaque fichier : court, placeholders `{min_delegate_instructions_len}`, exemples **Architecte** (pas l’exécuteur).

**Refactor legacy** : le contenu procédural aujourd’hui dans `06_visible_plan.md`, `08_before_delegating.md`, `09_cycle_per_task.md`, `17_tools.md` sera **découpé** vers `E-*` + `T-*`, puis retiré du monolithe `01–18`.

---

## 3. Déjà livré (2026-06-03) — phase 0 partielle

> **Attention** : l’edit charge encore le **monolithe** au runtime ; seule la **structure** et la discussion sont branchées sur les variables.

### 3.1 Arborescence `prompts/system/`

| Élément | Statut | Détail |
|---------|--------|--------|
| Dossier `system/blocks/` | ✅ | Un `.md` par section injectable |
| `blocks/gates/intent.md` | ✅ | G1 |
| `blocks/gates/discuss_core.md` + `blocks/discuss/read_budget.md` | ✅ | G2 + `{read_budget_percent}` |
| `blocks/edit/01_core.md` … `18_rules.md` | ✅ | G3 découpé (18 fichiers) |
| `blocks/edit/parallel_slots.md` | ✅ | G4 · `{parallel_slots}` |
| `system/gates/` | ✅ | Assemblage intent · discuss · edit |
| `system/supplements/` | ✅ | Dossier créé (**vide** — paliers E-*) |
| `system/blocks/tools/` | ☐ | **À créer** — un `.md` par outil (phase 1b) |
| `system/context/` | ✅ | Dossier créé (**vide** — snapshot) |

### 3.2 Variables & registre

| Élément | Statut | Fichier |
|---------|--------|---------|
| `StrictnessPreset` · `PromptVars` | ✅ | `vars.rs` |
| Presets relaxed / normal / strict (valeurs initiales) | ✅ | aligné brainstorm § presets |
| `PromptVars::render("{key}")` | ✅ | tests unitaires |
| `PromptBlockId` | ✅ | `registry.rs` |

### 3.3 Branchement runtime (partiel)

| Élément | Statut | Détail |
|---------|--------|--------|
| Discussion assemble | ✅ | `architect_discussion_system_prompt_default()` dans `assemble.rs` |
| Edit assemble | ☐ | Toujours `architect_system_prompt_for_run()` = **monolithe** tous blocs |
| Intent assemble | ✅ | Pas de workspace map (inchangé) |
| Export public `PromptVars`, presets | ✅ | `lib.rs` / `orchestration/mod.rs` |

### 3.4 Corrections prompts récentes (hors arborescence, même chantier)

| Élément | Statut | Référence |
|---------|--------|-----------|
| Intent / discuss / edit : pas de version produit dans les textes | ✅ | commits précédents |
| `RULES.md` §6 : pas de listes heuristiques | ✅ | repo racine |
| Seuil discuss 12 car., gate intent, allowlist discuss | ✅ | dogfooding `chat.txt` |

### 3.5 Documentation

| Document | Statut |
|----------|--------|
| [PROMPTS-ADDITIFS-1.3.2.md](PROMPTS-ADDITIFS-1.3.2.md) | ✅ design |
| **Ce plan** | ✅ |
| [JOURNAL-1.3.2.md](JOURNAL-1.3.2.md) | 🔄 entrée à ajouter après validation |

---

## 4. Ce qui manque (backlog ordonné)

### 4.1 Runtime — injection par palier (cœur du chantier)

| ID | Livrable | Statut | Dépend de |
|----|----------|--------|-----------|
| R1 | `EditTier` + `architect_edit_tier(state, phase)` | ☐ | — |
| R2 | Tests unitaires matrice état → palier (10–15 cas) | ☐ | R1 |
| R3 | Fichiers `system/supplements/edit/e_*.md` (E-plan … E-close) | ☐ | R1 |
| R4 | `supplement_for_tier(tier, vars)` | ☐ | R3 |
| R5 | `loop.rs` : avant chaque tour edit, injecter supplément si palier change | ☐ | R4 |
| R6 | `orchestration_run` / setup : **noyau `G3-core` seul** (plus monolithe tour 0) | ☐ | R5 |
| R7 | Dédupliquer nudges architecte vs supplément palier | ☐ | R5 |

### 4.1b Suppléments outil par palier (`T-*`)

| ID | Livrable | Statut | Dépend de |
|----|----------|--------|-----------|
| T0 | Dossier `system/blocks/tools/*.md` (un fichier / outil allowlist architecte) | ☐ | — |
| T1 | `tools_for_tier(EditTier) -> &[&str]` + `PromptBlockId::T*` dans `registry.rs` | ☐ | R1 |
| T2 | `tool_supplements_for_tier(tier, vars) -> String` (concat blocs T) | ☐ | T0, T1 |
| T3 | Injection dans `loop.rs` après `E-*`, avant snapshot | ☐ | T2, R5 |
| T4 | Raccourcir `Tool::description` côté architecte (renvoyer vers palier, éviter pavé) | ☐ | T2 |
| T5 | Tests : palier Plan → contient `todo_write` + pas `delegate_executor` | ☐ | T1 |

### 4.2 Contexte run (snapshot)

| ID | Livrable | Statut | Dépend de |
|----|----------|--------|-----------|
| C1 | Template `system/context/run_snapshot.md` (sections + placeholders) | ☐ | — |
| C2 | `architect_run_context_block(state, tier) -> String` | ☐ | C1 |
| C3 | Injection **chaque tour** edit (après compaction aussi) | ☐ | C2, R5 |
| C4 | Fusionner `cycle_anchor_block` + `run_objective` épars → un seul snapshot | ☐ | C3 |
| C5 | Discuss : snapshot minimal (user + pas de plan) | ☐ | C2 |
| C6 | Export transcript : labels distincts snapshot / supplément / nudge | ☐ | C3 |

### 4.3 Sévérité produit (`drox.engine.strictness`) — voir §9 registre figé

| ID | Livrable | Statut | Dépend de |
|----|----------|--------|-----------|
| S1 | Struct `EngineTuning` (remplace / englobe `PromptVars`) + presets | ☐ | §9 |
| S2 | RPC `engineStrictness` + `engineTuning` overrides si `custom` | ✅ partiel · overrides ☐ | S1 |
| S3 | Passer tuning résolu à `AgentConfig` / assemble / loop | ✅ partiel (5 champs) | S2 |
| S4 | Gates numériques D + A1–A2 + B1 + C* + F* sur `EngineTuning` | 🔄 D1–D5 ✅ · reste ☐ | S1 |
| S5 | Setting IDE `drox.engine.strictness` (+ tuning si `custom`) | ✅ enum 3 · custom ☐ | S2 |
| S6 | Blocs `.md` : tous placeholders → champs tuning | 🔄 | S3 |
| S7 | `resolve_engine_tuning(preset, overrides)` unique | ☐ | S1 |
| S8 | Table d’injection §10.3 — chaque champ → consommateur | ☐ | S7 |
| S9 | Tests : preset + custom override + non-régression gates | ☐ | S7–S8 |

### 4.4 Executor & autres gates

| ID | Livrable | Statut |
|----|----------|--------|
| X1 | Découper `executor.rs` → `system/blocks/executor/` | ☐ |
| X2 | Intent / discuss : suppléments optionnels paramétrables (H1–H2 off en relaxed) | ☐ |

### 4.5 Qualité & clôture 1.3.2

| ID | Livrable | Statut |
|----|----------|--------|
| Q1 | Dogfooding : Salut · fix ciblé · audit explicite · milieu de plan | ☐ |
| Q2 | PATCHNOTES-1.3.2 + JOURNAL + CLOSURE cochés | ☐ |
| Q3 | Rebuild `drox.exe` + dogfood IDE packagé | ☐ |
| Q4 | Mettre à jour [10-parametrage](../../feature-brainstorm/10-parametrage-prompts-strictesse.md) chemins G* | ☐ |

---

## 5. Phases d’exécution (ordre à suivre)

> **Règle équipe** : une PR / une série de commits **par phase** ; cocher ici avant de passer à la suivante.

### Phase 0 — Fondations ✅ partiel

- [x] Design [PROMPTS-ADDITIFS-1.3.2.md](PROMPTS-ADDITIFS-1.3.2.md)
- [x] **Ce plan** validé par l’équipe
- [x] Arborescence `system/blocks/` + `vars.rs` + `registry.rs`
- [x] Discussion : `read_budget` + `PromptVars`
- [ ] Entrée JOURNAL « phase 0 prompts additifs »

### Phase 1 — Paliers `E-*` + injection `loop`

**But** : paliers `E-*` ; tests résolveur ; setup edit = **core + E-&lt;palier&gt;** (pas monolithe 01–18).

- [ ] R1–R4, R3 fichiers `e_plan.md`, `e_delegate.md`, `e_verify.md`, `e_sanity.md`, `e_close.md`, `e_none.md`, `e_discovery.md`
- [ ] R2 tests
- [ ] R5–R6 branchement `loop.rs` + setup edit
- [ ] R7 audit nudges
- [ ] Q1 partiel (scénario milieu de plan)

**Critère phase 1a** : export chat montre **G3-core** + **un** `E-*`, pas les 18 sections legacy.

### Phase 1b — Suppléments outil `T-*` (par palier)

**But** : concaténer uniquement les blocs outil pertinents pour le palier (matrice §2.1).

- [ ] T0–T5
- [ ] Migrer le procédural utile depuis `06_visible_plan`, `08`, `09`, `17_tools` vers `T-*` / `E-*`
- [ ] Retirer du monolithe legacy les sections devenues redondantes

**Critère phase 1b** : palier **Plan** → system contient `E-plan` + `T-todo_write` + `T-workspace_map_read`, **sans** `T-delegate_executor`.

### Phase 2 — Snapshot contexte run

**But** : `CTX-run-snapshot` chaque tour ; fusion ancre cycle.

- [ ] C1–C6
- [ ] Q1 complet

**Critère phase 2** : milieu de plan → snapshot contient user request + todos + tâche courante.

### Phase 3a — Presets `relaxed` \| `normal` \| `strict` (MVP) ✅

**But** : IDE → RPC → `PromptVars` → 5 seuils prompts + gates D1–D5.

- [x] S2–S3–S5 (enum 3, wire RPC, `AgentConfig.prompt_vars`)
- [x] S4 partiel (D1, D3, D4, D5 via `architect_orchestration_pre_gate`)
- [x] S6 partiel (`read_budget`, edit 08–11, E-delegate, T-*)

**Critère 3a** : preset `strict` → `{read_budget_percent}` = 25 et `max_reads_before_delegate` = 2 effectifs.

### Phase 3b — Registre complet + `custom`

**But** : une struct `EngineTuning` avec **défauts explicites** + injection cartographiée (§10).

- [ ] §9 validé équipe (ce document)
- [ ] S1 + S7 : struct + `resolve()` + migration depuis `PromptVars`
- [ ] S2 : `engineStrictness: custom` + `engineTuning: { … }` (camelCase, champs optionnels)
- [ ] S5 : settings `drox.engine.tuning.*` visibles **uniquement** si `custom`
- [ ] S4 étendu : A1, A2, A3, A4, A5, D2, B1, B9, C1–C4, C8–C10, E2–E4, F1–F11, K*, L*
- [ ] S8 : audit grep — plus de constantes dupliquées pour champs du registre
- [ ] S9 tests

**Critère 3b** : changer `discussion_promotable_min_chars` en custom à 8 modifie la clôture discuss **sans** recompiler.

### Phase 3c — Presets texte (G*, H*, B*, nudges)

- [ ] X2 + enums `off` \| `short` \| `full` par bloc
- [ ] Q4 sync [10-parametrage](../../feature-brainstorm/10-parametrage-prompts-strictesse.md)

### Phase 4 — Finitions & clôture release

- [ ] X1 découpe executor
- [ ] X2 rappels user H* selon preset
- [ ] Q2–Q3 PATCHNOTES / rebuild
- [ ] CLOSURE pilier 1 + §4 cochés

---

## 6. Matrice blocs → fichiers (référence rapide)

| ID | Fichier actuel | Phase injection dynamique |
|----|----------------|---------------------------|
| G1 | `blocks/gates/intent.md` | Tour intent uniquement |
| G2 core | `blocks/gates/discuss_core.md` | Discuss tour 0 |
| G2 budget | `blocks/discuss/read_budget.md` | Discuss tour 0 (+ vars) |
| G3 core | `blocks/edit/01_core.md` | Edit **tous** tours |
| G3 … | `blocks/edit/02`–`18` | Legacy monolith **ou** déplacés vers `E-*` / `architect_help` |
| E-plan | *à créer* `supplements/edit/e_plan.md` | Palier plan |
| E-delegate | *à créer* | Palier delegate |
| E-verify | *à créer* | | |
| E-sanity | *à créer* | | |
| E-close | *à créer* | | |
| CTX | *à créer* `context/run_snapshot.md` | Chaque tour edit |
| G4 | `blocks/edit/parallel_slots.md` | Si `max_parallel_executors > 1` |

---

## 7. Critères d’acceptation globaux (1.3.2)

Reprennent [PROMPTS-ADDITIFS](PROMPTS-ADDITIFS-1.3.2.md) §9 + pilier 1 CLOSURE :

1. [ ] Edit tour 0 : ≤ noyau + 1 supplément + snapshot (pas 18 sections).
2. [ ] Discuss : noyau + read budget paramétrable.
3. [ ] « Salut » → gate discuss, une réponse, stop.
4. [ ] Milieu de plan : snapshot todos + supplément delegate/verify visible.
5. [ ] Aucune nouvelle heuristique mots-clés sur `params.prompt`.
6. [ ] Preset strictness change au moins read budget + reads-before-delegate (prompt ou gate).

---

## 8. Risques & garde-fous

| Risque | Mitigation |
|--------|------------|
| Régression orchestration | Phase 1 garde tests `cargo test` verts ; dogfooding Q1 avant phase 2 |
| Double injection (snapshot + ancre + nudge) | Phase 2 C4 fusion explicite |
| Monolithe encore chargé | R6 obligatoire avant de clore phase 1 |
| Variables désynchronisées gates vs prompts | §10 : une seule `EngineTuning` résolue, jamais deux sources |
| Registre ~90 entrées, implémentation par vagues | 3a → 3b numériques → 3c textes |

---

## 9. Registre figé `EngineTuning` (validé pour implémentation)

> **Source de vérité** pour presets + mode `custom`. Détail historique : [10-parametrage-prompts-strictesse.md](../../feature-brainstorm/10-parametrage-prompts-strictesse.md).  
> **Légende Custom** : **O** = réglable en `custom` uniquement · **—** = setting IDE séparé ou preset texte · **P** = preset `relaxed` \| `normal` \| `strict` seulement.

### 9.1 Méta

| ID | Clé RPC / setting | Type | Défaut `normal` | Custom |
|----|-------------------|------|-----------------|--------|
| S0 | `engineStrictness` / `drox.engine.strictness` | enum | `normal` | — |
| S1 | `engineTuning` / `drox.engine.tuning` | objet partiel | `{}` | **O** si S0=`custom` |

Règle : si S0 ≠ `custom`, le moteur **ignore** S1 (évite états incohérents).

### 9.2 Champs numériques & booléens (`EngineTuning` — custom **O**)

Valeur **Défaut** = colonne preset **`normal`** (relaxed / strict : §9.4).

| ID | Clé `snake_case` (Rust) · camelCase (RPC/TS) | Type | Défaut | Consommateur principal (§10.3) |
|----|-----------------------------------------------|------|--------|-------------------------------|
| **A1** | `promotable_answer_min_chars` | u32 | 120 | `agent_stream` / clôture phases |
| **A2** | `discussion_promotable_min_chars` | u32 | 12 | discuss stop · `loop.rs` |
| **A3** | `discussion_auto_stop_on_reply` | bool | true | `loop.rs` |
| **A4** | `intent_max_iterations` | u32 | 2 | `orchestration_run.rs` (clamp 1–3) |
| **A5** | `discussion_max_iterations` | u32 | 3 | `orchestration_run.rs` (clamp 1–5) |
| **B1** | `loop_strikes_before_abort` | u32 | 2 | `LoopDetector` |
| **B9** | `max_consecutive_ask_user_failures` | u32 | 3 | `loop.rs` / nudges |
| **C1** | `max_tools_per_turn_architect` | u32 | 6 | `RunSpec` architect |
| **C2** | `max_tools_per_turn_discussion` | u32 | 4 | `RunSpec` discuss |
| **C3** | `max_tools_per_turn_intent` | u32 | 0 | `RunSpec` intent |
| **C4** | `max_tools_per_turn_executor` | u32 | 2 | `RunSpec` executor |
| **C8** | `max_parallel_tool_calls` | u32 | 8 | `tool_orchestration` |
| **C9** | `max_todo_items` | u32? | null (∞) | `gates.rs` / `RunSpec` |
| **C10** | `memory_budget_tokens` | u32? | null | `apply_prompt_memory_budget` |
| **D1** | `max_reads_before_delegate` | u32 | 4 | gates · palier · blocs `.md` |
| **D2** | `max_delegations_per_task` | u32 | 2 | `architect_gates.rs` |
| **D3** | `max_delegate_scope_paths` | u32 | 6 | `architect_plan_quality` · blocs |
| **D4** | `delegate_scope_max_files` | u32 | 50 | `count_files_in_delegate_scope` · blocs |
| **D5** | `min_delegate_instructions_len` | u32 | 80 | `architect_gates` · blocs |
| **D6** | `require_delegate_before_todo_complete` | bool | true | `architect_todo_gate` |
| **D7** | `require_workspace_map_before_delegate` | bool | true | `architect_gates` |
| **E2** | `min_deliverable_bytes` | u64 | 64 | `executor_deliverable` |
| **E3** | `executor_deliverable_excerpt_max_chars` | u32 | 600 | `executor_deliverable` |
| **E4** | `executor_subrun_max_iterations` | u32 | dérivé parent | `orchestration_delegate` |
| **F1** | `live_compact_tail_keep_messages` | u32 | 4 | `compaction.rs` |
| **F2** | `live_compact_max_tail_ratio` | f32 | 0.20 | `compaction.rs` |
| **F3** | `live_compact_min_prefix_tokens` | u32 | 3000 | `compaction.rs` |
| **F4** | `live_compact_max_passes` | u32 | 3 | `compaction.rs` |
| **F5** | `checkpoint_max_chars` | u32 | 3000 | `compaction.rs` |
| **F6** | `anchor_user_request_max_chars` | u32 | 900 | `architect_state` / snapshot |
| **F7** | `anchor_plan_max_items` | u32 | 24 | `architect_state` / snapshot |
| **F9** | `summarize_tool_result_truncate` | u32 | 300 | `compaction.rs` |
| **F10** | `reinject_tool_result_truncate` | u32 | 800 | `compaction.rs` |
| **F11** | `context_snip_enabled` | bool | true | `ContextPolicy` |
| **P1** | `read_budget_percent` | u8 | 40 | `discuss/read_budget.md` (= champ tuning, pas alias) |
| **K1–K4** | `executor_glob_heavy_blocked`, … | bool | true | `executor_gates.rs` |
| **L1–L5** | `gate_*` (`GateKind`) | bool | true | `run_spec::gate_enabled` |

**Note** : P2–P5 du vocabulaire prompts = **mêmes champs** que D1, D5, D3, D4 (une seule propriété struct, deux usages : `render` + gate).

### 9.3 Champs hors `EngineTuning` (settings IDE dédiés — custom **—**)

| ID | Setting Drox | Lieu moteur |
|----|--------------|-------------|
| **A6** | `drox.maxIterations` | `AgentConfig.max_iterations` |
| **E1** | `drox.orchestration.maxParallelExecutors` | `OrchestrationConfig` · `{parallel_slots}` |
| **L6** | `drox.permissionMode` | `PermissionPolicy` |
| — | `drox.architect.interactionMode` | gate forcée (pas sévérité) |
| — | `drox.primaryLanguage` | assemble language |
| — | `drox.nativeThinking` | supplément G9 |
| — | `drox.tools.disabled` | allowlist effective |
| — | `drox.subagents.*` | legacy explore |
| — | Modèles + `numCtx` | LLM + `ContextPolicy` (F12 dérivé) |

### 9.4 Presets `relaxed` \| `normal` \| `strict` (numériques — figés)

| Clé | relaxed | normal | strict |
|-----|---------|--------|--------|
| P1 `read_budget_percent` | 85 | 70 | 45 |
| D1 `max_reads_before_delegate` | 24 | 16 | 8 |
| D3 `max_delegate_scope_paths` | 16 | 12 | 6 |
| D4 `delegate_scope_max_files` | 200 | 120 | 60 |
| D5 `min_delegate_instructions_len` | 40 | 50 | 100 |
| A1 | 40 | 60 | 150 |
| A2 | 6 | 8 | 20 |
| B1 | 5 | 4 | 2 |
| D6 | false | false | true |
| E4 `executor_subrun_max_iterations` | 40 | 32 | 20 |

Autres champs §9.2 : **identiques à `normal`** sauf décision produit explicite (à documenter dans `presets.rs` lors de S1).

### 9.5 Textes & listes (phase 3c — custom = **P** preset texte, pas curseur)

| Famille | IDs | Mécanisme cible |
|---------|-----|-----------------|
| Nudges | B2–B16 | `TextPreset::Off \| Short \| Full` + router |
| System | G1–G10 (hors données G11–G14) | idem ou fichiers workspace |
| User injectés | H1–H6 | idem ; H3 `off` en relaxed |
| Messages gate | D8–D14 | i18n / preset |
| Allowlists | C5–C7 | 🔀 strictness ou `drox.tools.disabled` — **à trancher** |

### 9.6 Questions ouvertes (avant 3b code)

1. C5–C7 dans `custom` ou uniquement `drox.tools.disabled` ?
2. `EngineTuning` remplace-t-il `PromptVars` (alias type) ou cohabitation temporaire ?
3. Bornes min/max par champ — fichier `tuning_bounds.rs` ou JSON schema IDE ?

---

## 10. Architecture moteur — réception & injection

### 10.1 Principe

Une **liste structurée** (la struct Rust `EngineTuning`) contient **toutes** les valeurs avec leurs **défauts** (`Default::normal()` ou table presets). Aucun module ne lit une constante locale pour un champ du registre §9.2 — il reçoit `&EngineTuning` (ou `&AgentConfig` qui la porte).

```text
IDE settings ──► buildAgentRunParams ──► RPC agent.run
                                              │
                    resolve_engine_tuning(preset, overrides?)  ◄── S7
                                              │
                         EngineTuning { tous champs + défauts }
                                              │
              ┌───────────────┬───────────────┼───────────────┬──────────────┐
              ▼               ▼               ▼               ▼              ▼
         render .md      architect_gates   RunSpec::with    loop.rs     compaction
         edit_tier        plan_quality      limits()         LoopDetector  ContextPolicy
```

### 10.2 Résolution (réception RPC / settings)

Fichier cible : `orchestration/tuning/mod.rs` (ou extension `vars.rs`).

```rust
// Pseudocode — contrat figé
pub fn resolve_engine_tuning(
    strictness: StrictnessPreset,      // relaxed | normal | strict | Custom
    overrides: Option<EngineTuningOverrides>,  // Some uniquement si Custom
) -> EngineTuning {
    let mut t = EngineTuning::from_preset(strictness.base_preset()); // custom → base normal
    if strictness == StrictnessPreset::Custom {
        t.apply_overrides(overrides.unwrap_or_default()); // champs Option<T> : None = garde défaut
    }
    t.clamp_to_bounds(); // bornes documentées §9.6
    t
}
```

| Étape | Responsable | Entrée | Sortie |
|-------|-------------|--------|--------|
| 1 | IDE `droxRunSettings` | `drox.engine.strictness` + `drox.engine.tuning.*` | `engineStrictness`, `engineTuning?` |
| 2 | CLI `agent_run` handler | RPC params | `AgentConfig { tuning: EngineTuning, … }` |
| 3 | Moteur début de run | `AgentConfig` | même référence sur **tous** les sous-runs architect / executor si politique unifiée |

**Tests S9** : pour chaque champ §9.2, un test `override_field_x_changes_consumer_y`.

### 10.3 Carte d’injection (champ → endroit moteur)

> Chaque ligne = **une** propriété `EngineTuning` · **un** (ou plusieurs) points d’appel explicites.

| Champ | Injection |
|-------|-----------|
| `read_budget_percent` | `render_md` discuss · `architect_discussion_system_prompt(&tuning)` |
| `max_reads_before_delegate` | `render` edit/T-* / E-delegate · `architect_edit_tier` · `architect_orchestration_pre_gate` · compteur `reads_since_delegate` |
| `min_delegate_instructions_len` | blocs 08–09 · `T-delegate_executor` · pre-gate delegate |
| `max_delegate_scope_paths` | bloc 11 · `architect_delegation_scope_gate` |
| `delegate_scope_max_files` | blocs 09–10 · `count_files_in_delegate_scope` · message scope too large |
| `max_delegations_per_task` | pre-gate redelegate cap |
| `require_workspace_map_before_delegate` | pre-gate delegate (skip si false) |
| `require_delegate_before_todo_complete` | `architect_todo_gate` |
| `promotable_answer_min_chars` | `promotable_answer_min_chars(role)` dans `agent_stream` |
| `discussion_promotable_min_chars` | idem + branche discuss dans `loop` |
| `discussion_auto_stop_on_reply` | fin de tour discuss |
| `intent_max_iterations` | `orchestration_run` intent_params clamp |
| `discussion_max_iterations` | `orchestration_run` discussion_params clamp |
| `loop_strikes_before_abort` | `LoopDetector::observe` seuil Warn/Abort |
| `max_consecutive_ask_user_failures` | `loop.rs` ask_user |
| `max_tools_per_turn_*` | `RunSpec::for_orchestration_role` **factory** paramétrée par tuning |
| `max_parallel_tool_calls` | `AgentConfig.max_parallel_tool_calls` |
| `max_todo_items` | `tool_pre_gate_block` |
| `memory_budget_tokens` | `assemble` / `build_agent_setup` |
| `min_deliverable_bytes` / `executor_deliverable_excerpt_max_chars` | truth-check · rapport executor |
| `executor_subrun_max_iterations` | `OrchestrationDelegate` |
| `live_compact_*` / `checkpoint_max_chars` | `CompactionConfig::from_tuning` |
| `anchor_*` | `ArchitectRunState` / `run_snapshot.rs` troncature |
| `context_snip_enabled` | `ContextPolicy::from_tuning` |
| `summarize_*` / `reinject_*` truncate | compaction pipeline |
| `executor_glob_heavy_blocked` … | `executor_gates` |
| `gate_*` | `RunSpec::gate_enabled` |

**Passage dans la boucle** : `AgentLoop` porte déjà `self.config` → ajouter `tuning: EngineTuning` (ou renommer `prompt_vars`) et passer `&tuning` à :

- `tool_pre_gate_block(…, &tuning)`
- `architect_edit_tier(…, &tuning)`
- `supplement_for_tier` / `tool_supplements_for_tier`
- `architect_run_context_block(…)` (F6–F7)
- `maybe_snip` / `try_live_compact` (F*)

**Sous-runs executor** : décision produit — même snapshot tuning parent (recommandé v1) ou preset executor dérivé.

### 10.4 Implémentation par vagues (après figer §9)

| Vague | Champs | Fichiers touchés |
|-------|--------|------------------|
| **3a** ✅ | P1, D1, D3–D5 | `vars.rs`, gates, assemble, IDE enum |
| **3b.1** | A1–A3, B1, D2 | `gates.rs`, `agent_stream`, `loop` |
| **3b.2** | A4–A5, C1–C4, C8–C10 | `run_spec`, `orchestration_run` |
| **3b.3** | F1–F11 | `compaction`, `context`, `architect_state` |
| **3b.4** | E2–E4, K*, L* | executor path |
| **3b.5** | S0=`custom` + overrides RPC/IDE | TS `droxEngineTuning.ts`, `protocol.rs` |
| **3c** | B2–H*, G* | nudges router + text presets |

### 10.5 Migration `PromptVars` → `EngineTuning`

| Option | Avantage |
|--------|----------|
| **A** — Renommer `PromptVars` en `EngineTuning`, garder `render()` | Une struct, clarté |
| **B** — `EngineTuning` contient `prompt: PromptSlice` + `gates: GateSlice` | Séparation compile-time |

**Recommandation** : **option A** pour v1 — une struct, sous-ensemble utilisé par `render` via `fn placeholders(&self) -> [(&str,String); N]`.

Étapes :

1. Déplacer `vars.rs` → `tuning/mod.rs` avec tous les champs §9.2 + `from_preset` / `apply_overrides`.
2. Remplacer `AgentConfig.prompt_vars` par `engine_tuning`.
3. Grep `PromptVars::` → `EngineTuning::` ; supprimer constantes `ARCHITECT_MAX_READS_*` devenues mortes.
4. Export public `drox_engine::EngineTuning` (remplace `PromptVars` avec alias déprécié une release si besoin).

### 10.6 Critère d’acceptation architecture

- [ ] Un seul appel `resolve_engine_tuning` par `agent.run`.
- [ ] Zéro constante du registre §9.2 lue hors `tuning/` (grep CI optionnel).
- [ ] Table §10.3 : chaque champ **O** a au moins un test d’injection.
- [ ] Mode `custom` : override d’un champ change le comportement **sans** toucher aux autres.

---

*Prochaine action : valider §9 en équipe, puis **3b.1** (`EngineTuning` struct + `resolve` + A1–A3 + B1) avant settings IDE `custom`.*
