# Plan Context Frame — outils, plan interne, injection centralisée

**Version** : juin 2026 — branche `1.4.1` → chantier **post-1.4.1.2**  
**Statut** : **Phase 1–2** — spec livrée · squelette `context_frame/` branché  
**Parent** : [README](README.md)

> Objectif : pouvoir dire, pour chaque **frame** du cycle, *quels blocs sont injectés, dans quel ordre, quels outils sont visibles*, et *comment le modèle s’organise* — puis optimiser sans chasser les `Message::system` dans dix fichiers.

---

## I — Vision & principes

### Trois piliers (décisions produit)

| Pilier | Décision | Responsable |
|--------|----------|-------------|
| **1. Outils — dossiers** | En injection : n’exposer qu’un **nom de dossier** (ex. `edit_file`). À l’**appel** de ce dossier : renvoyer les protocoles des **sous-outils réels** spécialisés (remplacement ligne, créer fichier, etc.). | Moteur route + IDE exécute toujours les outils wire |
| **2. Plan interne** | **Le modèle** monte un plan **précis** (5–20 étapes si besoin), **non visible** utilisateur final ; distinct du `todo_write` public / UI. | Modèle écrit via outil dédié ; moteur injecte en frame |
| **3. Context Frame** | **Une recette déclarative** par `(rôle, station, déclencheur)` : ordre des blocs, mode replace/append, outils visibles, historique. | Nouveau module orchestration — **wrap** l’existant d’abord |

### Principes d’exécution

1. **Pas de réécriture moteur** — refactor d’organisation puis évolution comportementale **pilotée**.
2. **Parité comportementale Phase 2** — même texte injecté, même ordre effectif qu’aujourd’hui (tests + dump frame).
3. **Vérifier avant coder** — chaque phase a une gate « effets de bord » (table § VI).
4. **Observabilité** — export frame effective dans logs / transcript debug (extension `context_turn_metrics`).
5. **Dogfood** — rejouer `ses_4b2c1d08` / brief sidebar après chaque phase majeure.

### Non-objectifs (ce plan)

- Remplacer le rail (stations hold/advance restent).
- Remplacer l’intent probe boot.
- Bump semver 1.5 — rester patch 1.4.x jusqu’à validation smokes.
- Fusionner avec 1.5.2 index/graphe (seulement **brancher** un futur bloc `ContextPack` dans une frame).

---

## II — État des lieux (code actuel)

### II.1 — Injection system — qui fait quoi aujourd’hui

| Moment | Fichier(s) | Bloc injecté | Mode |
|--------|------------|--------------|------|
| Boot edit | `orchestration/prompts/system/gates/edit.rs` | G3-core (`01_core_rail_solo.md`) | System initial |
| Chaque tour `iteration_start` | `loop/drive/iteration_start.rs` | `architect_run_context_block_per_turn` | Replace (dédup fingerprint) |
| Chaque tour | idem | `tool_supplements_for_station` → protocoles `T-*` | Replace (dédup) |
| Chaque tour (rail) | `rail/refresh_snapshot` | `## Run rail (engine)` | Replace (dédup) |
| Post-compaction | `tools.rs` | `architect_run_context_block_compaction` | Insert après checkpoint |
| Post `todo_write` | `tools.rs` | snapshot architecte | Insert checkpoint |
| Événementiel | `outcome.rs`, `tools.rs`, `llm_turn.rs` | nudges, gates (`Message::system`) | Append |
| Erreur outil | `helpers/tool_errors.rs` | hint dans `tool_result` | Tool result |

**Problème** : pas de **vue unique** ; debug = grep `Message::system` + 3 fonctions `refresh_*`.

### II.2 — Catalogue textes (déjà centralisé partiellement)

| ID | Fichier | Rôle |
|----|---------|------|
| `G3EditCore` | `blocks/edit/01_core_rail_solo.md` | Noyau rail + phases |
| `T-file_edit` … `T-ask_user_question` | `blocks/tools/*.md` | Protocoles (9 outils) |
| `CtxRunSnapshot` | `context/run_snapshot.rs` | Snapshot architecte dynamique |
| Rail snapshot | `rail/snapshot_block.rs` | Station, focus, todos |
| Nudges | `agent/nudges/*.rs` | Gates, stall, schema_error |

Registre : `orchestration/prompts/registry.rs` (`PromptBlockId`) — **sous-utilisé** pour l’orchestration.

### II.3 — Outils — surface LLM vs exécution

| Couche | Où | Quoi |
|--------|-----|------|
| **Specs API LLM** | `filter_tool_specs_for_station` (`rail/policy.rs`) | Noms wire + JSON schema |
| **Protocoles texte** | `tool_supplements_for_station` (`blocks/tools/mod.rs`) | Markdown procédural par outil |
| **Pre-gate** | `gates/tool_pre.rs`, `rail/pre_gate.rs` | Bloque avant exec |
| **Exécution** | IDE `droxClientTools` + `drox-tools` | Vrais handlers |

Alignement station → outils (aujourd’hui) :

| Station | Specs LLM (wire) | Protocoles `T-*` injectés |
|---------|------------------|---------------------------|
| READ | read-only set | `workspace_map_read`, `file_read`, `grep`, `lsp` |
| PLAN | + `todo_write`, help, ask | idem |
| ACT | + `file_edit`, `file_write` | idem |
| VERIFY | verify set + `todo_write` | `lsp`, `grep`, `file_read` |
| ANSWER | `todo_write` | `todo_write` |

**Écart** : VERIFY a `todo_write` en policy (1.4.1.2) mais pas `bash` dans protocoles — bash reste dans registry global si non filtré (à vérifier à l’implémentation frame).

### II.4 — Plan aujourd’hui

| Niveau | Mécanisme | Visible user |
|--------|-----------|--------------|
| **L0** | Message user | Oui |
| **L1** | `todo_write` → `ArchitectRunState.task_labels` / `todo_statuses` | Oui (snapshot + UI todos) |
| **L2** | — | — |
| **Rail** | Station + focus line | Partiel (snapshot rail) |

Le modèle **n’a pas** d’outil pour un plan interne dense non exporté UI.

### II.5 — Preuves dogfood (pourquoi ce plan)

| Constats `ses_4b2c1d08` | Lien pilier |
|-------------------------|-------------|
| Hallucination `read_file` vs `file_read` | Dossiers + frame READ minimale |
| 9 protocoles × tours | Frame + dossiers → moins de texte au boot |
| Fausse ANSWER puis gate mutation | Frame ANSWER + plan interne |
| `file_edit` JSON vide malgré hint | Sous-outils spécialisés dans dossier `edit_file` |

---

## III — Architecture cible

### III.1 — Dossiers d’outils (Tool Folders)

#### Concept

```text
Frame ACT — tools visible (LLM API):
  - edit_file          ← dossier (seul nom + 1 ligne description)
  - file_read          ← outil simple (optionnel, ou dans dossier read_file)
  - todo_write
  - internal_plan_write

Model appelle: edit_file { "action": "describe" }
  → tool_result (ou frame éphémère tour suivant):
      "## edit_file folder
       Available operations (call by name on next turn):
         - edit_file.replace_lines  …
         - edit_file.create_file    …
         - edit_file.append_block   …
         …"
  → specs JSON des sous-outils ajoutés au tour N+1 UNIQUEMENT
```

#### Dossiers proposés (v1 — à valider)

| Dossier (nom LLM) | Sous-outils wire réels | Station |
|-------------------|------------------------|---------|
| **`edit_file`** | `file_edit` (patch), `file_write` (create/replace), futur `file_append` ? | ACT |
| **`read_file`** | `file_read`, `grep`, `workspace_map_read` | READ |
| **`verify_project`** | `lsp`, `bash` (script npm only), `grep` | VERIFY |
| **`plan`** | `todo_write` (public), **`internal_plan_write`** (interne) | PLAN |
| **`ask_user`** | `ask_user_question`, `architect_help` | PLAN / PROPOSE |

Chaque sous-outil : **une action précise** (ex. « remplacer une plage de lignes », « créer fichier vide + content »).

#### Flux d’expansion (deux options — choix Phase 1b)

| Option | Mécanisme | Avantages | Risques |
|--------|-----------|-----------|---------|
| **A — Two-turn** | `edit_file.describe` → résultat liste sous-outils → tour suivant specs élargies | Simple, compatible API actuelle | +1 tour latence |
| **B — Router mono-tour** | `edit_file` reçoit `op: "replace_lines"` ; moteur mappe vers `file_edit` | 1 tour | Moins de « découverte » modèle ; schema dossier plus gros |

**Recommandation plan** : **A pour pilote** (debug clair) ; **B** si latence insupportable.

#### Injection frame — dossiers

- Frame n’injecte **pas** les 6 protocoles `T-*` en ACT.
- Frame injecte : `## Tools this turn` + liste **noms dossiers** + 1 ligne chacun.
- Protocoles détaillés : **après** `describe` ou dans **sous-frame** éphémère.

#### Fichiers impactés (futur — Phase 3+)

| Zone | Modification |
|------|--------------|
| `orchestration/tool_folders/` | **NEW** — manifest dossiers → sous-outils |
| `rail/policy.rs` | Filtrer **dossiers** pas seulement wire names |
| `loop/drive/tools.rs` | Handler `describe` / expansion specs |
| `blocks/tools/` | Regrouper md par dossier ou générer depuis manifest |
| IDE | Inchangé si mapping moteur → wire names inchangé |

### III.2 — Plan interne (modèle)

#### Exigences produit

- **Monté par le modèle** — pas dérivé heuristique moteur seul.
- **5–20 étapes** (ou plus si brief complexe) — granularité fine.
- **Non visible** utilisateur final (pas dans UI todos, pas dans export user-facing par défaut).
- **Précis** : fichier(s), action, critère done par étape.
- **Distinct** de `todo_write` L1 (contractuel / UI).

#### Outil proposé : `internal_plan_write`

```json
{
  "steps": [
    {
      "id": "s1",
      "action": "Read section-transition.tsx lines 1-80",
      "paths": ["app-kdds-main/src/components/section-transition.tsx"],
      "done_when": "Truncation point identified",
      "status": "completed"
    },
    {
      "id": "s2",
      "action": "Rewrite file with closed SVG tags",
      "paths": ["..."],
      "done_when": "lsp diagnostics clean",
      "status": "in_progress"
    }
  ]
}
```

- Gate shape : même rigueur que `todo_write` (normalize, empty reject).
- Snapshot : bloc `## Internal work plan (engine only)` dans frame PLAN/ACT/VERIFY.
- **Export transcript** : flag `internal: true` ou section PARTIE C seulement (pas replay UI).

#### Relation L1 / L2

| | `todo_write` (L1) | `internal_plan_write` (L2) |
|--|-------------------|----------------------------|
| Audience | User + modèle | Modèle seul |
| Granularité | 3–8 tâches macro | 5–20 micro-étapes |
| UI | Oui | Non |
| Station | PLAN, ACT, VERIFY, ANSWER | PLAN → ACT (principalement) |

Le modèle peut **les deux** : L1 pour l’utilisateur (« Je vais corriger l’animation SVG »), L2 pour lui-même (« s7: fix useMotionTemplate line 44 »).

#### Fichiers impactés (futur — Phase 4)

| Zone | Modification |
|------|--------------|
| `drox-tools` ou gate | **NEW** normalize + validate `internal_plan_write` |
| `agent/state/` | **NEW** `internal_plan` sur `ArchitectRunState` |
| `context/run_snapshot.rs` | Profil snapshot **InternalPlan** (frame) |
| `orchestration/prompts/blocks/plan/` | **NEW** protocole `internal_plan_write.md` |
| IDE replay export | Masquer bloc internal par défaut |

### III.3 — Context Frame

#### Définition

Une **Context Frame** = tuple stable :

```rust
// Spec (documentation Phase 1 — pas encore code)
struct ContextFrame {
    id: &'static str,           // e.g. "architect.act.iteration_start"
    role: RoleId,
    station: Option<RunStation>,
    trigger: FrameTrigger,        // IterationStart | PostTool | PostCompaction | GateNudge
    layers: &'[FrameLayer],
}

struct FrameLayer {
    block_id: PromptBlockId,      // registry existant
    mode: InjectMode,             // ReplaceTail | ReplaceMarked | Append | InsertAfterCheckpoint
    marker: Option<&'static str>,
    skip_if_unchanged: bool,
    source: BlockSource,        // StaticMd | DynamicFn
}
```

#### Frames minimales v0 (parité actuelle)

| Frame ID | Station | Layers (ordre) |
|----------|---------|----------------|
| `architect.boot` | — | G3EditCore |
| `architect.*.iteration_start` | * | CtxRunSnapshot → ToolProtocols → RailSnapshot |
| `architect.*.post_compaction` | * | CtxRunSnapshot(compaction) insert |
| `architect.*.gate_nudge` | * | (append) nudge text — **référence** id nudge, pas texte dispersé |
| `architect.act.tools_visible` | ACT | **v2** dossiers only |

#### Outil de debug

- `log_context_turn_metrics` étendu → `frame_id`, `layers_applied[]`, `bytes_per_layer`.
- Option export UI : « Context frame dump » pour une step (dev only).

#### Fichiers impactés (futur — Phase 2)

| Zone | Modification |
|------|--------------|
| `orchestration/context_frame/` | **NEW** — manifest + `apply_frame()` |
| `loop/drive/iteration_start.rs` | Délègue à `apply_frame(ITERATION_START)` |
| `agent/state/snapshot.rs` | Appelé **depuis** frame layers, pas directement |
| `agent/loop/drive/outcome.rs` | Nudges → `apply_frame(GATE_NUDGE { id })` |
| `docs/` | Matrice frame (générée ou maintenue à la main Phase 1) |

---

## IV — Phases d’exécution

### Phase 0 — Planification ☑ (ce document)

| Livrable | Statut |
|----------|--------|
| PLAN.md | ☑ |
| README hub | ☑ |
| Lien hub 1.4 | ☐ (après relecture) |

**Gate G-doc** : relecture Corentin — pas de code.

---

### Phase 1 — Spec & matrice (aucun comportement)

| # | Tâche | Livrable |
|---|-------|----------|
| 1.1 | **Matrice frame actuelle** — pour chaque station, lister blocs + ordre + bytes typiques (dump 3 runs) | `1.4.1.3/MATRIX-ACTUAL.md` ☑ |
| 1.2 | **Manifest frames v0** — YAML/JSON : `architect.*.iteration_start` = layers identiques à aujourd’hui | `1.4.1.3/frames-v0.yaml` ☑ |
| 1.3 | **Spec Tool Folders** — choix A vs B, liste dossiers v1, mapping sous-outils | § III.1 validé |
| 1.4 | **Spec internal_plan_write** — JSON schema, règles visibilité export | § III.2 validé |
| 1.5 | **Analyse effets de bord** — tableau § VI complété par zone | Revue sign-off |

**Gate G-spec** : matrice vérifiée par dump transcript **bit-identique** texte injecté (3 scénarios : READ, ACT, gate nudge).

**Tests** : aucun code — scripts manuels export + diff.

---

### Phase 2 — Context Frame (parité comportementale)

| # | Tâche | Fichier |
|---|-------|---------|
| 2.1 | Module `context_frame` + `apply_frame()` | `orchestration/context_frame/mod.rs` ☑ |
| 2.2 | Migrer `iteration_start` → une frame | `iteration_start.rs` ☑ |
| 2.3 | Migrer nudges/gates → `FrameTrigger::Gate` | `outcome.rs`, `tools.rs` ☑ |
| 2.4 | Étendre `context_turn_metrics` | `state/snapshot.rs` ☑ |
| 2.5 | Tests : dump frame == legacy | `context_frame/tests.rs` ☑ |

**Gate G-parity** :

- `cargo test -p drox-engine` vert.
- Test golden : même `messages` system order + content pour N tours simulés.
- Smoke `ses_4b2c1d08` : tokens in ±5 % (pas de régression diet).

**Effets de bord** : voir § VI — risque **ordre** messages system si bug ; mitigation golden tests.

---

### Phase 3 — Tool Folders (pilote `edit_file`)

| # | Tâche |
|---|-------|
| 3.1 | Manifest dossier `edit_file` → sous-outils |
| 3.2 | Frame ACT : 1 ligne `edit_file` au lieu de 3 protocoles `file_edit`/`file_write`/… |
| 3.3 | Handler `edit_file` action `describe` (option A) |
| 3.4 | Expansion specs tour N+1 |
| 3.5 | Alias `read_file` → `file_read` en pre-gate (quick win lié) |
| 3.6 | Tests drive + smoke brief SVG |

**Gate G-folder** :

- Tokens in ACT **↓** vs Phase 2 (cible −30 % protocoles ACT).
- ≤ 2 échecs `file_edit` même schéma sur run référence.
- Pas de régression `filter_tool_specs` VERIFY.

---

### Phase 4 — Plan interne modèle

| # | Tâche |
|---|-------|
| 4.1 | Outil `internal_plan_write` + gate shape |
| 4.2 | État `ArchitectRunState.internal_plan` |
| 4.3 | Frame layer `InternalPlanSnapshot` (PLAN, ACT, VERIFY) |
| 4.4 | Protocole md + dossier `plan` |
| 4.5 | Export transcript masque UI |
| 4.6 | Smoke : plan ≥ 8 steps sur brief sidebar |

**Gate G-plan** :

- Modèle produit L2 sans polluer L1.
- UI todos inchangés sauf si `todo_write` explicite.
- Clôture : corrélation steps L2 completed vs mutations.

---

### Phase 5 — Optimisation (après frames stables)

| Piste | Condition |
|-------|-----------|
| Réduire G3-core par station | Frame permet A/B |
| Dossiers `read_file`, `verify_project` | Pilote edit_file vert |
| Fusion L1/L2 optionnelle | Seulement si modèle confond — pas par défaut |
| Intégration 1.5.2 ContextPack | Bloc `CtxGraphPack` en frame boot READ |

---

## V — Vérifications avant mise en place (checklist par PR)

Chaque PR Phase 2+ doit cocher :

| # | Vérification |
|---|--------------|
| V1 | Golden / parity tests passent |
| V2 | `context_turn_metrics` loggue `frame_id` |
| V3 | Rail hold/advance **inchangé** (tests `transition.rs`) |
| V4 | Intent probe boot **inchangé** |
| V5 | Discuss R1a/R1b non régressés |
| V6 | IDE tool execution paths **inchangés** (wire names) |
| V7 | Export transcript UI **pas de fuite** plan interne (Phase 4) |
| V8 | Dogfood brief documenté (tokens, durée, verdict) |

---

## VI — Effets de bord & mitigations

| Zone | Risque | Mitigation |
|------|--------|------------|
| Ordre messages system | Compact / snip casse si mauvais marker | Golden tests ; conserver markers existants |
| `filter_tool_specs_for_station` | Dossiers vs wire names | Couche mapping dossier→specs |
| IDE pending tools | Expansion N+1 change tool list mid-run | Documenter contrat ; tests integration |
| Rail policy | ACT sans `file_write` visible trop longtemps | Timeout describe ; fallback specs |
| todo_write vs internal_plan | Modèle remplit le mauvais | Noms distincts + frame PLAN sépare les deux |
| Compaction | Frame insert checkpoint | Reprendre `InjectMode::InsertAfterCheckpoint` |
| Tokens | Describe = +1 tour | Mesurer ; option B router |
| Export / replay | Fuite plan interne | Flag export ; tests snapshot |
| Bash VERIFY | Dossier `verify_project` restreint scripts | Pre-check Windows inchangé |

---

## VII — Fichiers & modules (vue consolidée)

```text
orchestration/
  context_frame/          NEW Phase 2
    mod.rs
    manifest.rs             frames-v0.yaml embarqué
    apply.rs
  tool_folders/           NEW Phase 3
    manifest.rs
    describe.rs
  prompts/
    registry.rs             étendre PromptBlockId
    system/blocks/
      tools/                  regroupement par dossier Phase 3
      plan/internal_plan.md   NEW Phase 4

agent/
  loop/drive/
    iteration_start.rs        simplifié → apply_frame
    outcome.rs                nudges → frame
    tools.rs                  post-tool frames
  state/
    snapshot.rs               layers déléguées
    internal_plan.rs          NEW Phase 4

rail/
  policy.rs                   filter dossiers Phase 3

docs/1.4/1.4.1/1.4.1.3/
  PLAN.md                     ce fichier
  MATRIX-ACTUAL.md            Phase 1.1
  frames-v0.yaml              Phase 1.2
  ARCHITECTURE.md             découpage Rust / TS
```

**Hors scope** : `drox-tools` handlers (sauf nouveau tool internal_plan), IDE UI 1.5.1.

---

## VIII — Critères de clôture chantier

- [ ] Phase 1 signée (matrice + manifest v0 + effets de bord)
- [ ] Phase 2 : parité golden + smoke tokens ±5 %
- [ ] Phase 3 : pilote `edit_file` + tokens ACT ↓
- [ ] Phase 4 : `internal_plan_write` + smoke plan dense
- [ ] Documentation hub 1.4 à jour
- [ ] SMOKE-BACKLOG entrée Context Frame

---

## IX — Questions ouvertes (à trancher Phase 1)

| # | Question | Options |
|---|----------|---------|
| Q1 | Expansion dossier : tour +1 (A) ou router (B) ? | Recommandation A pilote |
| Q2 | `bash` dans dossier `verify_project` ou interdit ? | Scripts package.json only |
| Q3 | L1 todo obligatoire si L2 > 10 steps ? | Soft nudge frame PLAN |
| Q4 | Renommer wire `file_edit` → `edit_file.replace` ? | Breaking — éviter Phase 3 |
| Q5 | Numéro version doc : rester sous 1.4.x ou **1.5.3** dédié ? | 1.5.3 si parallèle 1.5.2 |

---

## X — Liens

- [Debunk ses_4b2c1d08](../1.4.1/SMOKE-ses_4b2c1d08.md)
- [CLOSURE 1.4.1.2](../1.4.1/finalisation/CLOSURE-1.4.1.2.md)
- [PLAN 1.5.2 index/graphe](../1.5/1.5.2/PLAN-1.5.2.md)
- [Registry prompts](../../1.3/1.3.2/PROMPTS-ADDITIFS-1.3.2.md)
- [tool supplements](../../drox/crates/drox-engine/src/orchestration/prompts/system/blocks/tools/mod.rs)
