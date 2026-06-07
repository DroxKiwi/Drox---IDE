# Plan d’intégration — Gates (1.3.2+)

> **OBSOLÈTE** — `GateEngine` et backpack **supprimés** (juin 2026). Stack actuelle : RPC + architecte + tool gates + sub-agents. Référence : [CONDUCTEUR-CODE.md](CONDUCTEUR-CODE.md) · [gates/ARCHIVE.md](gates/ARCHIVE.md).

**Objectif** : remplacer le gate Auto « prompt + marqueur `[gate: …]` » par un **moteur de gates** (fichiers TOML + JSON + journal), ajouter le **sac à dos** architecte, et **retirer les débris** de l’ancienne voie sans casser `role_split` ni les gates bloquantes outils existantes.

**Specs** : [gates/README.md](gates/README.md) · [GATE-SPEC.md](gates/GATE-SPEC.md) · [EDIT-GATES-MAP.md](gates/EDIT-GATES-MAP.md) · [CONTEXT-BUBBLES.md](gates/CONTEXT-BUBBLES.md)

**Dogfood** : export chat sans `## Reminder` ; « Salut » → ENTRY → discuss → pas d’outils ; tâche réelle → edit + backpack utilisable.

---

## 0. Principes d’implémentation

| Règle | Détail |
|-------|--------|
| Pas d’heuristique NLP | Uniquement `sanitize_architect_user_prompt` + décisions gate LLM + état moteur (`EditTier`, journal). |
| Deux familles de gates | **Routage** (nouveau `GateEngine`) vs **exécution** (`architect_gates.rs` — garder, renommer doc si besoin « tool gates »). |
| Source de vérité produit | TOML sous `docs/.../gates/` → **embarqué** en binaire (`include_str!`) jusqu’à override workspace `.drox/gates/` (phase 2). |
| Pas de double vérité | Une fois le gate engine actif, **supprimer** le chemin prompt `auto_gate.md` + `intent.md` comme system du tour intent. |
| Backpack ≠ memory session | `.drox/backpack/entries/` (cartes) vs `.drox/memory/sessions/` (bilans). |

---

## 1. Architecture code cible (crates `drox-engine`)

```text
drox-engine/src/
  gate_engine/
    mod.rs           # GateRegistry, GateEngine, GateOutcome
    def.rs           # GateDef, Branch, ResponseSchema (from TOML)
    evaluate.rs      # tour LLM, parse JSON, transitions
    prompt.rs        # assemble gate prompt from bubbles + gate_menu
    registry.rs      # load embedded TOML
  context_bubble/
    mod.rs           # BubbleRegistry, BubbleResolver, BubbleResult
    handlers.rs      # last_user_message, last_gate, historic, run_snapshot, gate_menu
    budget.rs        # narrative / code caps (EngineTuning)
  run_journal/
    mod.rs           # append jsonl, last_gate(), gate_path()
  backpack/
    mod.rs           # BackpackStore, index
    tools.rs         # store, list, read, search (enregistrement drox-tools)
  orchestration/     # existant — brancher gate_engine + backpack
```

**CLI** (`drox-cli`) : `orchestration_run.rs` appelle `GateEngine::run_chain("entry", …)` au lieu de `probe_architect_gate`.

**Outils** (`drox-tools`) : nouveaux handlers `backpack_*` ; allowlist architecte étendue dans `run_spec`.

---

## 2. Phases (ordre de merge recommandé)

### Phase A — Fondations (sans changer le comportement visible)

| # | Tâche | Livrable |
|---|--------|----------|
| A1 | Crate modules `run_journal`, `context_bubble` (handlers MVP) | Tests unitaires resolve `last_user_message`, `last_gate` |
| A2 | Parser TOML minimal → `GateDef` / `BubbleDef` | Charge `docs/1.3/1.3.2/gates/gates/*.toml` en tests |
| A3 | Embarquer TOML : `drox-engine/assets/gates/` + `assets/bubbles/` (copie sync depuis docs) | `include_str!` + registry |
| A4 | `RunJournal` : créer `.drox/runs/<run_id>/journal.jsonl` au début de `agent.run` | Event `gate_pass` stub |

**Critère** : `cargo test -p drox-engine` vert ; flux actuel inchangé.

---

### Phase B — Gate engine (remplace probe intent)

| # | Tâche | Livrable |
|---|--------|----------|
| B1 | `GateEngine::evaluate(ctx, gate_id)` — prompt depuis TOML + bulles, **aucun outil** | Tour LLM dédié |
| B2 | Parse JSON `exclusive_open` + `boolean` ; retry `max_attempts` ; `default_branch` / `default_value` | Tests parse + transitions |
| B3 | `run_gate_chain(start_id)` suit `[transition]` jusqu’à `START_RUN.*` | Chaîne ENTRY → discuss.needs_repo_facts → … |
| B4 | Remplacer `probe_architect_gate` + `architect_auto_gate_system_prompt()` | `resolve_architect_gate` → gate chain |
| B5 | RPC override inchangé (`discussion` / `action` / `auto`) | `skip_when.rpc_mode` dans TOML |

**Critère** : Auto « Salut » → journal `entry→discuss→needs_repo_facts=false` ; pas de `workspace_map_read`.

---

### Phase C — Bulles + assembleur (réduire le bruit contexte)

| # | Tâche | Livrable |
|---|--------|----------|
| C1 | `ContextAssembler::for_gate` / `for_run` | Fini le reminder dans les messages gate |
| C2 | `historic` : transcript compact N tours (déjà sanitize) | Bulle narrative plafonnée |
| C3 | `run_snapshot` : réutiliser `architect_run_context_block_per_turn` | Bulle séparée du monolithe system |
| C4 | Budget pools dans `EngineTuning` : `narrative_max_tokens`, `code_max_tokens` (optionnel MVP : chars) | Allocator coupe les bulles |

**Critère** : export chat = `## User` + chemin gates en métadonnée UI (optionnel phase C4).

---

### Phase D — Backpack MVP

| # | Tâche | Livrable |
|---|--------|----------|
| D1 | Spec [BACKPACK-SPEC.md](gates/BACKPACK-SPEC.md) (schéma fiche + index) | Doc |
| D2 | `.drox/backpack/entries/<id>.md` + `index.json` | `BackpackStore` |
| D3 | Outils `backpack_store`, `backpack_list`, `backpack_read`, `backpack_search` (tags, paths_prefix, query) | Allowlist architect (+ discuss ? read-only search) |
| D4 | Bulle `backpack_relevant` (search interne, max K fiches) | Injection run edit |
| D5 | Prompt edit : « before re-read file, backpack_search » | `01_core.md` § backpack |

**Critère** : run edit stocke une fiche après `file_read` ; tour suivant `backpack_read` sans relire le fichier.

---

### Phase E — Nettoyage « pas de débris »

**Suivi détaillé (cases + grep + journal)** : [gates/SUIVI-NETTOYAGE-GATES.md](gates/SUIVI-NETTOYAGE-GATES.md)

| Élément | Action |
|---------|--------|
| `auto_gate.md` + `architect_auto_gate_system_prompt()` | **Supprimer** après B4 — remplacé par TOML `entry.discuss_edit` |
| `intent.md` + `ARCHITECT_INTENT_SYSTEM_PROMPT` | **Supprimer** — même rôle que gate ENTRY |
| `RoleId::ArchitectIntent` | **Fusionner** : tour gate = `ArchitectGate` ou garder le rôle mais system **uniquement** via `GateEngine` (pas de second prompt markdown) |
| `extract_gate_from_text` / `[gate: architect_*]` | **Déprécier** : parse JSON seule vérité ; garder parse marker 1 release en warning log puis retirer |
| `ARCHITECT_INTENT_GATE_NUDGE` | Remplacer par nudge gate JSON invalide |
| Loop `ArchitectIntent` branche dans `loop.rs` | Adapter vers « gate tour sans tools » générique |
| User message `## User request` + `## Reminder` | Déjà `sanitize_*` — grep repo + test export |
| `PROMPTS-REINJECTE` / docs 1.2 gates A2 | Mise à jour ou bannière « remplacé par gate_engine » |
| Duplication `architect_gate_user_message` vs assemble | Une seule voie : sanitize + bulles |

**Checklist grep avant release** :

```bash
rg "auto_gate\.md|ARCHITECT_INTENT_SYSTEM|ArchitectIntent|extract_gate_from_text|## Reminder" drox-engine drox-cli src/vs/workbench/contrib/drox
```

---

### Phase F — IDE & observabilité

| # | Tâche |
|---|--------|
| F1 | Event RPC `gate_pass` / `gate_path` pour UI (fil debug, comme orchestration role) |
| F2 | Export transcript : section « Gate path » + pas de faux « Architect reminder » si sanitize OK |
| F3 | Jauge ctx : afficher estimate **narrative** vs **code** (si budget allocator en place) |

---

## 3. Arbre gates MVP (fichiers à embarquer)

| Fichier | Rôle |
|---------|------|
| `entry.discuss_edit.gate.toml` | ENTRY exclusive |
| `discuss.needs_repo_facts.gate.toml` | boolean → discuss avec/sans reads |
| `edit.has_concrete_goal.gate.toml` | boolean → `e_none` vs suite edit |
| *(plus tard)* `edit.requires_visible_plan`, `edit.requires_workspace_map`, … | |

Transitions `START_RUN.*` mappées vers :

- `StartRun::Discuss { allow_reads: bool }`
- `StartRun::Edit { initial_tier: EditTier }`

---

## 4. Backpack — schéma minimal (phase D)

**Chemin** : `<workspace>/.drox/backpack/entries/<id>.md` (frontmatter JSON + corps markdown).

**Outils** : réservés **Architect** (pas executor) pour éviter pollution.

**Index** : `by_path`, `by_tag`, `by_plan_id` — mis à jour par le moteur à chaque `store`.

**Relation gates** : après `START_RUN.edit`, allowlist inclut `backpack_*` ; pas sur tours `ArchitectGate`.

---

## 5. Tests & validation

| Niveau | Quoi |
|--------|------|
| Unit | Parse TOML, JSON gate, transitions, bubble truncate, backpack index |
| Intégration | `drive_role_split` mock LLM renvoie `{"open":"architect_discuss"}` |
| Dogfood | [chat.txt](chat.txt) scénarios : Salut, question code, tâche fix |
| Non-régression | `cargo test -p drox-engine -p drox-cli` ; `droxCommon.test.ts` si RPC touché |

---

## 6. Risques & mitigations

| Risque | Mitigation |
|--------|------------|
| TOML drift docs vs binaire | Script CI `sync-gate-assets.ps1` copie `docs/.../gates` → `assets/` |
| Double gate + EditTier::None | `edit.has_concrete_goal=false` **aligné** sur `EditTier::None` (même condition état) |
| Latence (N tours gate) | MVP 2–3 gates max ; pas de fusion multi-booléen avant mesure |
| Petit modèle JSON cassé | `max_attempts` + default + log `gate_path` |

---

## 7. Ordre de travail conseillé (sprints)

```text
Sprint 1 : A + B  (gate engine ENTRY + chaîne discuss)
Sprint 2 : C + E partiel (bulles, suppression auto_gate/intent)
Sprint 3 : D     (backpack outils + bulle)
Sprint 4 : E fin + F (grep débris, IDE events)
```

**Premier commit utile** : A1–A3 + B1–B2 (infra + un gate ENTRY fonctionnel en test).

---

## 8. Liens journal / doc à mettre à jour en fin de chantier

- [CIRCUIT-MOTEUR-GATES-NUDGES.md](CIRCUIT-MOTEUR-GATES-NUDGES.md) — §2 flux global
- [JOURNAL-1.3.2.md](JOURNAL-1.3.2.md) — entrée implémentation
- [PATCHNOTES-1.3.2.md](PATCHNOTES-1.3.2.md) — breaking : marqueurs `[gate:]` optionnels
- [gates/README.md](gates/README.md) — statut « implémenté »

---

## 9. Questions tranchées avant Sprint 1 (défauts proposés)

| Question | Défaut |
|----------|--------|
| TOML embarqué seul ou override `.drox/gates/` ? | Embarqué seul en Sprint 1 |
| `ArchitectIntent` conservé ? | Oui comme `wire_id` du tour gate, system **only** GateEngine |
| Backpack en discuss ? | `search`/`read` oui ; `store` non (edit/architect mutation path) |
| Marqueur `[gate:]` | Déprécié log warning, retiré Sprint 2 |
