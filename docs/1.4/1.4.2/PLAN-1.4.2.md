# Plan 1.4.2 — Rail souple & contexte en 4 couches

**Version** : juin 2026  
**Statut** : **implémentation clôturée** (Phases **T**, **P**, **1–4**, **M**) — **dogfood M.9 + gate Acceptation** en cours · Phase **6** conduct → post-dogfood  
**Dernière mise à jour** : 5 juin 2026 — Phase **M** livrée · checkpoint compaction court · boot mémoire minimal  
**Prérequis** : [1.4.1](../1.4.1/README.md) livrée · [Context Frame](../1.4.1/1.4.1.3/ARCHITECTURE.md) Phase 2 en place  
**Suite** : [1.5.1](../1.5/1.5.1/README.md) (UI, signature) **après** dogfood vert (A.*)

---

## Résumé exécutif

**Décision** : abandonner le rail **prescriptif** (ACL outils par station + tool folders + marqueurs `[gate:]`) au profit d’un rail **observateur** + **4 couches de contexte** complémentaires.

| Avant (chimère) | Après (cible) |
|-----------------|---------------|
| Outils = f(phase) | Outils **stables** tout le run EDIT |
| Progression = gates + describe | Progression = **inférence** + snapshot |
| Diète = masquer capacités | Diète = **compaction** + résumés |
| Rail = BPMN + pre-gate | Rail = **UI + hint** dans snapshot |

**Invariant** : discuss vs edit (intent probe, F1) reste le **seul** coupe dur produit — pas de mutation en `ArchitectDiscussion`.

**Culture unique** : **une seule** conduite moteur après la 1.4.2 — rail observateur + 4 couches. **Pas de reliquat** : pas de flag `Strict`/`Soft`, pas de double chemin, pas de code mort commenté « au cas où ». L’ancien rail prescriptif est **supprimé** et les tests **réécrits** sur le nouveau comportement.

---

## Règles de chantier

Ces règles s’appliquent à **tout** le code et la doc produits pendant la 1.4.2 (alignées [ARCHITECTURE Context Frame](../1.4.1/1.4.1.3/ARCHITECTURE.md)) :

| # | Règle | Détail |
|---|--------|--------|
| **R-FILE** | **Pas de fichier > ~500 lignes** si possible | Au-delà : extraire sous-module (`apply/`, `layers/`, `rail/infer/`, etc.). Avant d’agrandir un fichier existant (`outcome.rs`, `tool_pre.rs`), vérifier la taille et scinder. |
| **R-DOC** | **Documenter code + plan** | Chaque module touché : doc rust (`//!` / `///`) sur la surface publique. Chaque phase livrée : cocher la checklist + mettre à jour ce plan, [README](README.md), [MATRIX-ACTUAL](../1.4.1/1.4.1.3/MATRIX-ACTUAL.md), FOI, [09-run-rail](../moteur/09-run-rail/README.md). |
| **R-NOLEGACY** | **Zéro reliquat** | Supprimer le code remplacé (pas de `if legacy`, pas de `RailMode`, pas de `tool_folders_enabled`). Pas de « deprecated » qui traîne : **grep** + **cargo test** = preuve de table rase. Voir [inventaire suppression](#supprimer-du-dépôt). |
| **R-TEST** | **Tester jusqu’au bout** | Chaque phase : `cargo test -p drox-engine` + `cargo test -p drox-cli` verts **sur la culture unique**. Dogfood session 3-tours **obligatoire** avant gate 1.5.1 — pas de merge « à moitié ». |
| **R-CONDUCT** | **Zéro heuristique sur le texte user** | Toute détection de règle de conduite = **probe LLM → JSON typé** uniquement. Le moteur Rust valide le schéma, persiste et réinjecte — **jamais** regex / mots-clés multilingues sur le message brut. Dédoublonnage par `id` + `scope` enum, pas par similarité de chaînes traduites. |
| **R-MEMORY** | **Une vérité par question** | Pas de second canal pour la même info (listing boot vs outil, todo vs plan interne, MEMORY vs conduct). Voir [Phase M](#phase-m--mémoire-unifiée-triage). |

**Suivi** : la [checklist d’avancement](#checklist-davancement) est la source de vérité ; cocher au fur et à mesure des PR / commits.

### Avancement code (5 juin 2026)

| Zone | État | Notes |
|------|------|--------|
| Purge `tool_folders` + ACL rail | ✅ | Module supprimé, `pre_gate.rs` supprimé, `rg` clean dans `drox/crates/` |
| Palette plate + `llm_turn` | ✅ | Specs = `base_tool_specs` sans filtre station |
| Protocole compact unique | ✅ | `tool_supplements_architect_compact` dans `iteration.rs` |
| Plan interne seul (CUT `todo_write`) | ✅ | `internal_plan_write` + `OpenWorkCounts` · gates todo retirées |
| Mémoire unifiée Phase **M** | ✅ | `DROX.md` seul · boot teaser `memory_*` · pas listing skills/sessions · `.drox/exports/` ignoré |
| Checkpoint compaction court (M.5b) | ✅ | Renvoi snapshot `## Run context (engine)` |
| Snapshot sans workspace paths (M.5) | ✅ | Orientation via `workspace_map_read` |
| Prompt observateur (`01_core_rail_solo.md`) | ✅ | Réécrit sans ACL / folders |
| Closure moteur + schema_error plafond 3 | ✅ | `closure.rs` · `SCHEMA_ERROR_CONTINUE_MAX` |
| Phase **6** conduct | ⏳ | Planifiée post-dogfood M.9 |
| Dogfood 3-tours | ⏳ | Rejeu post-M — voir [SMOKE-M-memory](SMOKE-M-memory-TEMPLATE.md) + [SMOKE-1.4.2](SMOKE-1.4.2-ses_7b34fd1d.md) (pré-M) |

`cargo test` (5 juin 2026) : **298** `drox-engine` · **95** `drox-cli` · **35** `drox-session` · **115** `drox-tools` — **tous verts**.

---

## Les 4 couches (référence)

Voir aussi [README § approche](README.md).

| # | Couche | Rôle | Mécanisme Drox cible |
|---|--------|------|----------------------|
| **1** | Cadre fixe | Règles, objectif, hint rail | Boot `01_core_rail_solo.md` (réécrit) + `rail_snapshot` hint |
| **2** | Outils stables | Palette API + protocoles compacts | `ToolSpec` wire complet ; `tool_supplements_all_architect` fixe |
| **3** | Mémoire de travail | Fil du run + conduct session (Phase 6) | `ctx_run_snapshot` + **plan interne seul** (plus de `todo_write`) |
| **4** | Historique chaud/froid | Détail récent + ancien résumé | Transcript + `ContextCompacted` + checkpoint ; conduct session **recopié** post-compaction |

Le **code du repo** reste hors contexte par défaut (`file_read`, `grep`, `workspace_map_read`, index 1.5.2).

---

## Inventaire : garder / muter / retirer

### ✅ Garder tel quel

| Composant | Fichiers / modules |
|-----------|-------------------|
| Context Frame (`replace`, `skip_if_unchanged`) | `orchestration/context_frame/` |
| Run snapshot replace | `agent/state/snapshot.rs` |
| Compaction live + post-checkpoint | `compaction/`, `ContextCompacted` |
| Intent probe + discuss modes | `orchestration/intent_probe/` |
| Permissions (hors rail) | `agent/gates/tool_pre.rs` |
| Rail stations + inférence C12 | `agent/rail/infer.rs`, `transition.rs` |
| UI events rail | `event.rs`, trace engine |
| Observabilité ctx | `log_context_turn_metrics` |

### 🔧 Muter

| Composant | Changement |
|-----------|------------|
| `01_core_rail_solo.md` | Prompt court ; rail = hint ; sans `[gate:]` obligatoire |
| `tool_protocols` layer | Toujours `tool_supplements_all_architect` (compact) |
| `rail_snapshot_block` | Ton informatif, pas prescriptif |
| `architect_run_context_block_*` | Enrichir : fichiers lus/écrits, erreurs récentes, station inférée |
| `internal_plan_write` | Optionnel ; plus de gate INTENT obligatoire |
| **Conduct utilisateur** (Phase 6) | Probe JSON + snapshot session + `.drox/conduct.md` projet ; distinct du plan interne (tâches vs comportement) |
| Nudges `outcome.rs` | Réduire `schema_error` ; closure moteur |
| `01_core_rail_solo.md` | Réécriture unique (prompt observateur) |

### ❌ Supprimer du dépôt (table rase — R-NOLEGACY)

| Composant | Action |
|-----------|--------|
| `filter_tool_specs_for_station` | **Supprimer** + retirer appels (`llm_turn.rs`) |
| `tool_pre_gate_rail` + tests « blocked in read » prescriptifs | **Supprimer** ou réécrire : plus de blocage station |
| Module `orchestration/tool_folders/` (describe, pre_gate, specs virtuels) | **Supprimer** entièrement |
| `tool_folders_enabled` dans `EngineTuning` | **Supprimer** champ + overrides |
| `tool_supplements_for_station` / `station_tool_protocols` | **Supprimer** ; un seul chemin `tool_supplements_architect_compact` |
| `internal_plan_required_block` | **Supprimer** |
| `virtual_folder_allowed`, `minimum_station_for_virtual_folder` | **Supprimer** avec tool folders |
| **`read_workspace`**, **`edit_file`**, **`verify_project`** | **Retirer** allowlist + specs + handlers (dossiers dépliants) |
| **`apply_tool_folder_specs`** / **`collapse_wire_tools`** | **Supprimer** — specs = allowlist plate |
| Alias `edit_file` → `file_edit` exposé au modèle | **Supprimer** — un seul nom public `file_edit` |
| Prompt : discipline `[gate:]` / tool folders / stations ACL | **Supprimer** du boot edit |
| Tests unitaires rail « file_edit blocked at read » | **Réécrire** : file_edit autorisé, station inférée après coup |
| `frames-v0.yaml` § `tool_folders` | **Supprimer** le bloc |

**Inventaire détaillé** : [INVENTAIRE-OUTILS-1.4.2.md](INVENTAIRE-OUTILS-1.4.2.md)

**Vérification table rase** (checklist [P.*](#phase-p--purge--preuve-zéro-reliquat) + [T.*](#phase-t--inventaire-outils-plats)) :

```bash
rg "tool_folders|read_workspace|verify_project|apply_tool_folder_specs|collapse_wire_tools|is_tool_folder_expanded|filter_tool_specs_for_station|tool_pre_gate_rail|edit_file" drox-engine/drox/crates/
# edit_file : uniquement OK dans commentaires/historique si absent du allowlist et specs LLM
```

---

## Phases d’implémentation

> Ordre **séquentiel** : pas de merge intermédiaire sans tests verts (R-TEST). La purge (Phase P) peut chevaucher les phases 1–2 mais doit être **terminée** avant gate acceptation.

### Phase 0 — Cadrage & doc (1 j)

**Objectif** : figer la culture unique avant de toucher le code.

| Tâche | Détail |
|-------|--------|
| **0.1** | Annexe FOI « 4 layers + rail observateur » (remplace sections rail prescriptif) |
| **0.2** | Mettre à jour `frames-v0.yaml` : supprimer § `tool_folders` ; `tool_protocols` → chemin unique |
| **0.3** | Valider [INVENTAIRE-OUTILS-1.4.2.md](INVENTAIRE-OUTILS-1.4.2.md) (palette noyau edit + discuss) |
| **0.4** | `cargo test -p drox-engine` baseline vert |

---

### Phase P — Purge & preuve zéro reliquat

**Objectif** : **supprimer** l’ancienne culture, pas la contourner.

| ID | Tâche | Fichier(s) |
|----|-------|------------|
| **P.1** | Supprimer `orchestration/tool_folders/` + exports `mod.rs` | tout le module |
| **P.2** | Supprimer `filter_tool_specs_for_station`, `tool_allowed` (ACL station) | `rail/policy.rs` — ne garder que helpers inférence si besoin |
| **P.3** | Supprimer `tool_pre_gate_rail` + appel dans `tool_pre.rs` | `rail/pre_gate.rs` |
| **P.4** | Supprimer `tool_folders_enabled`, refs tuning / RPC | `tuning/mod.rs`, `resolve_engine_tuning` |
| **P.5** | `rg` clean sur symboles listés § suppression | — |
| **P.6** | Réécrire tests rail : plus de « blocked at read » ; inférence station | `agent/tests/rail.rs`, `pre_gate.rs` tests |

**Critère** : grep vide (hors `docs/`) + tests verts.

---

### Phase T — Inventaire outils plats (P0)

**Objectif** : outils **faciles à utiliser** pour le modèle — une surface wire, schémas clairs, **zéro dossier dépliant**.

| ID | Tâche | Fichier(s) |
|----|-------|------------|
| **T.1** | Retirer `read_workspace`, `edit_file`, `verify_project` de `ARCHITECT_TOOL_ALLOWLIST` | `run_spec/mod.rs` |
| **T.2** | `llm_turn` : specs = allowlist − permissions ; **supprimer** `apply_tool_folder_specs` | `llm_turn.rs` |
| **T.3** | Retirer état `tool_folder_expanded` / champs associés | `ArchitectRunState` |
| **T.4** | Définir `ARCHITECT_EDIT_CORE_BLOCKS` (noyau ~13) + secondaire schema-only | `blocks/tools/mod.rs` |
| **T.5** | Renforcer `ToolSpec` : `file_edit` `required: [path, edits]` + descriptions une ligne | registry / spec builder |
| **T.6** | Aligner handlers IDE (`drox-tools`) — pas de handler virtuel folder | package tools |
| **T.7** | Tests : API tour 0 contient `file_edit` + `file_read`, **pas** `read_workspace` | `run_spec` / `llm_turn` tests |
| **T.8** | Mettre à jour [INVENTAIRE-OUTILS-1.4.2.md](INVENTAIRE-OUTILS-1.4.2.md) si palette ajustée post-dogfood | doc |

**Critère** : voir § validation inventaire dans [INVENTAIRE-OUTILS-1.4.2.md](INVENTAIRE-OUTILS-1.4.2.md).

---

### Phase 1 — Couche 2 : outils libres (P0)

**Objectif** : palette wire **complète et stable** tout le run EDIT — seul chemin code.

| ID | Tâche | Fichier(s) |
|----|-------|------------|
| **1.1** | `llm_turn` : plus de filtrage specs par station | `agent/loop/drive/llm_turn.rs` |
| **1.2** | `tool_pre` : permissions produit uniquement (discuss, paths, bash…) | `agent/gates/tool_pre.rs` |
| **1.3** | Palette EDIT = allowlist [inventaire](INVENTAIRE-OUTILS-1.4.2.md) alignée `drox-tools` | `run_spec/mod.rs` |
| **1.4** | Tests : `file_read` + `file_edit` exécutables dès station Read inférée | `agent/tests/rail.rs` |
| **1.5** | Doc `///` sur le contrat outils unique | modules touchés |

**Smoke cible** : brief run 3 — **0** erreur « read_workspace not expanded ».

---

### Phase 2 — Couche 2 : protocoles unifiés (P0)

**Objectif** : un seul bloc protocole compact, stable tout le run.

| ID | Tâche | Fichier(s) |
|----|-------|------------|
| **2.1** | `apply_tool_protocols` : **toujours** protocole compact unique | `context_frame/apply/iteration.rs` |
| **2.2** | `tool_supplements_architect_compact` (&lt; ~2k tok) — seule entrée | `prompts/system/blocks/tools/` |
| **2.3** | Un seul nom `file_edit` ; supprimer blocs `T-edit_file`, `read_workspace` | blocks tools |
| **2.4** | Supprimer `tool_supplements_for_station` du registry | `prompts/mod.rs`, `lib.rs` exports |
| **2.5** | Test : `tool_protocol_snapshot_skip=unchanged` sur 2 tours | `snapshot.rs` |

---

### Phase 3 — Couche 1 & 3 : rail observateur + snapshot (P1)

**Objectif** : le rail accompagne ; le snapshot tient le fil.

| ID | Tâche | Fichier(s) |
|----|-------|------------|
| **3.1** | Réécrire `01_core_rail_solo.md` — rail observateur, sans `[gate:]` ni ACL | `prompts/system/blocks/edit/` |
| **3.2** | `rail_snapshot_block` : hint informatif uniquement | `rail/snapshot_block.rs` |
| **3.3** | Enrichir `architect_run_context_block_per_turn` | snapshot / orchestration |
| **3.4** | Progression **uniquement** par `infer.rs` + post-tool ; `transition.rs` sans marqueurs gate | `rail/transition.rs` |
| **3.5** | Supprimer `internal_plan_required_block` (déjà Phase P si pas fait) | `internal_plan.rs` |
| **3.6** | Plan interne : injecter si présent, jamais bloquer | `internal_plan_snapshot.rs` |

**Critère** : export UI montre timeline rail qui avance sans `[gate:]` dans le transcript.

---

### Phase 4 — Couche 4 & closure moteur (P1)

**Objectif** : fin de run fiable même si le modèle n’émet pas `[phase: done]`.

| ID | Tâche | Fichier(s) |
|----|-------|------------|
| **4.1** | Définir critères closure moteur : mutation OK **ou** explicit no-op + N tours sans outil | `agent/loop/drive/outcome.rs` |
| **4.2** | Tour **forced answering** : injecter nudge unique puis tour sans tools ; extraire USER-FACING REPLY | `outcome.rs`, `phase` parsing |
| **4.3** | Plafond `schema_error_continue` (ex. 3) → escalade closure au lieu de boucle | `nudges/schema_error.rs` |
| **4.4** | Post-compaction : snapshot compaction profile enrichi (fichiers, décisions) | `architect_run_context_block_compaction` |
| **4.5** | (Optionnel P2) Tronquer tool results anciens dans transcript avant LLM | `compaction/` ou `llm_turn.rs` |

**Smoke cible** : run mutation simple 1 fichier → `USER-FACING REPLY` + `busy: false` en &lt; 15 iter (north-mini).

---

### Phase 6 — Conduct utilisateur : probe, session, projet (P1)

**Objectif** : repérer et classer les **règles importantes** demandées par l’utilisateur (conventions, process, style) — **sans heuristique** — les garder **pendant toute la discussion** (couche 3) et **sur le long terme** dans le workspace (`.drox/`), de façon **très compacte**. Pousser le modèle à **demander des précisions** quand ni le fichier projet ni les règles session ne couvrent une demande nouvelle.

**Principe** : le plan interne = *quoi faire* (tâches) ; le conduct = *comment se comporter* (règles). **Un seul interprète** (probe LLM), **deux tiroirs** de stockage — pas de couche parallèle de traduction EN ni de regex multilingue ([R-CONDUCT](#règles-de-chantier)).

#### Horizons de persistance

| Horizon | Stockage | Durée | Injection |
|---------|----------|--------|-----------|
| **Session** | `ArchitectRunState.session_conduct_rules` → snapshot `### User conduct (session)` | Toute la discussion | Chaque tour + profil post-compaction |
| **Projet** | `<workspace>/.drox/conduct.md` (budget ~≤ 800 tok, résumés seulement) | Tout le travail sur le repo | Boot run + ligne snapshot `### Project conduct (workspace)` |

**Complément existant** : `DROX.md` (memdir humain, optionnel) ; `.drox/conduct.md` = règles agent condensées (**`MEMORY.md` supprimé** — voir [Phase M](#phase-m--mémoire-unifiée-triage)).

#### Schéma probe `conduct_probe` (JSON strict)

Déclenché à chaque message `user` (ou au minimum 1er message + messages « méta » détectés par le probe lui-même — **pas** par heuristique moteur).

```json
{
  "message_kind": "task | conduct_rule | greeting | meta | …",
  "conduct": {
    "action": "none | add_session | add_project | replace_project",
    "rules": [
      {
        "id": "doc-on-progress",
        "text_user": "À partir de maintenant, mets à jour la doc quand on avance.",
        "summary": "Update docs on meaningful progress.",
        "scope": "session | project",
        "category": "documentation | style | process | code_convention | …"
      }
    ],
    "coverage": "covered | partial | unknown",
    "clarification_needed": false,
    "clarification_prompt": null
  }
}
```

- **`text_user`** : fidèle, langue utilisateur → snapshot / UI.
- **`summary`** : une ligne max → `.drox/conduct.md` uniquement.
- **`id` + `scope` + `category`** : clés stables pour merge moteur (pas de dédup sur `summary`).

#### Gate clarification (`coverage: unknown`)

Si une demande **globale** (nouvelle convention, méthode non documentée) n’est couverte ni par `.drox/conduct.md` ni par les règles session :

1. Probe → `clarification_needed: true` + question ciblée.
2. Gate moteur **avant mutation** : pousser `ask_user_question` (même culture que gates existantes).
3. Réponse user → re-probe → mise à jour session et/ou projet.

| ID | Tâche | Fichier(s) |
|----|-------|------------|
| **6.1** | Module `conduct_probe` : prompt + parse JSON + tests parse (multilingue en entrée) | `orchestration/conduct_probe/` |
| **6.2** | Brancher probe sur message `user` (avant ou avec intent probe — documenter l’ordre) | `start_run.rs`, `agent/loop/` |
| **6.3** | `session_conduct_rules` dans `ArchitectRunState` + merge par `id` | `agent/state/fields.rs` |
| **6.4** | Bloc snapshot `### User conduct (session)` + survie post-compaction | `run_snapshot.rs` |
| **6.5** | Outil virtuel `project_conduct_write` (merge par `id`, budget tokens) | `orchestration/project_conduct_tool.rs` |
| **6.6** | Fichier `.drox/conduct.md` : load boot + compaction probe si dépasse budget | `drox-session/`, boot agent |
| **6.7** | Snapshot `### Project conduct (workspace)` (résumés depuis fichier) | `run_snapshot.rs` |
| **6.8** | Gate `coverage: unknown` → `ask_user_question` avant mutation | `agent/gates/` ou `outcome.rs` |
| **6.9** | Distinction doc : conduct ≠ plan interne ; pas de doublon intent | ce plan, `ARCHITECTURE.md` |
| **6.10** | Tests : message FR « mets à jour la doc… » → `add_session` sans regex ; compaction conserve conduct | `conduct_probe` tests, `run_snapshot` tests |
| **6.11** | (P2 UI) Panneau règles actives session/projet — peut glisser en 1.5.1 | extension-vscode |

**Critère** : probe seul classifie ; grep `conduct` sans `regex`/`heuristic` sur message user ; conduct session visible dans export après compaction simulée.

**Ordre** : Phase 6 **après** [Phase M](#phase-m--mémoire-unifiée-triage) (au minimum **M.1**, **M.2**, **M.10**) et Phase 4 ; **non bloquant** gate 1.5.1 si 5.x pas vert.

---

### Phase M — Mémoire unifiée (triage)

**Objectif** : supprimer les **concurrences** identifiées sur la mémoire / plans / canaux d’injection ; une **source de vérité par question** ; corriger le **trou Architect EDIT** (boot sans mémoire projet).

**Prérequis décision** : voir [table d’arbitrage](#arbitrage-mémoire--décisions-et-à-trancher) — **toutes les lignes M-1…M-10 tranchées** (M-3 et M-8 en mode expérimental / dogfood).

#### Arbitrage mémoire — décisions et à trancher

| # | Sujet | Décision actuelle | Cible proposée | Statut |
|---|--------|-------------------|----------------|--------|
| **M-1** | Mémoire projet fichiers | `sessions/*.jsonl` = historique chat UI/reprise ; `memory/sessions/*.md` = archive compaction (à revoir plus tard) ; **`MEMORY.md` inutile** | **CUT** `MEMORY.md` + `load_memdir` branche MEMORY + injections associées. Conserver `DROX.md` (humain) jusqu’à fusion avec `conduct.md` (Phase 6). | **Tranché — CUT** |
| **M-2** | Plans | `todo_write` obsolète (affichage user) ; ne doit pas rivaliser `internal_plan_write` | **CUT** `todo_write` + gates `DoneUnfinishedTodos`, nudges post-todos, snapshot `### Plan / todos`, rail `post_todos_close`, compteurs `last_todo_*`, bloc protocole `T-todo_write`. Plan unique = **`internal_plan_write`** (+ snapshot plan interne). UI tâches → **1.5.1** si besoin (hors moteur). | **Tranché — CUT** |
| **M-3** | Triple résumé historique | Snapshot = vérité run ; tester **snapshot à chaque `iteration_start`** (replace) comme canal principal | Vérité = **snapshot couche 3** (réinjecté chaque tour). Checkpoint compaction = **renvoi court** vers le snapshot (« ancres dans le snapshot ci-dessous »), pas de 3ᵉ récit détaillé. Archive `.md` = **hors** prompt auto (`memory_read` seulement). **Dogfood** pour valider. | **Tranché — expérimental** |
| **M-4** | Ancres objectif / demande | Aligné M-3 | `user_request_anchor` + `run_objective_anchor` **uniquement** dans snapshot ; checkpoint **ne duplique pas** les ancres. | **Tranché** |
| **M-5** | Carte repo | **Oui** — une seule source structure | **CUT** `### Workspace paths (sample)` du snapshot. Structure repo = **`workspace_map_read`** uniquement (`.drox/workspace-map.json`). Snapshot peut garder **chemins touchés** (mutations/lectures récentes) si utile — pas l’arbre. | **Tranché** |
| **M-6** | Listing sessions archivées | Un seul canal | **Pas** de listing au boot ; canal unique = `memory_list` / `memory_read`. | **Tranché** |
| **M-7** | `session_note` vs archive | Aligné M-6 | `session_note` → entrée compaction uniquement ; pas d’injection parallèle. | **Tranché** |
| **M-8** | Skills vs prompts système | **Skills sur invocation seulement** — mesurer l’effet | **CUT** injection catalogue skills au boot (`format_skills_listing_for_prompt`). Procédures = **`skill_list` / `skill_read`** uniquement. Core rail = culture globale ; conduct (Phase 6) = règles persistantes. Audit doublons `core_standard` / blocs tools. | **Tranché — expérimental** |
| **M-9** | `exports/` vs `sessions/*.jsonl` | Outillage dev | **Canonique** = `.drox/sessions/*.jsonl` (+ engine-trace). `exports/` = **dev/dogfood uniquement** ; `.droxignore` + `grep` excluent `exports/`. | **Tranché — dev** |
| **M-10** | Trou Architect EDIT | Boot sans memdir/listing | **Obligatoire** : boot orchestration injecte bloc **mémoire projet minimal** (au minimum `DROX.md` + `conduct.md` quand Phase 6 livrée + rappel outils `memory_*`) **sans** réassembler tout le prompt Standard. | **Tranché — FIX** |

#### Hiérarchie cible (après tri)

```text
Run en cours     → snapshot couche 3 (demande, objectif, plan interne, conduct session, conduct projet)
Historique chat  → .drox/sessions/<ses_id>.jsonl  (UI + reprise session)
Archive résumée  → .drox/memory/sessions/*.md     (hors prompt auto ; memory_read)
Instructions hum → DROX.md (racine)                 (boot minimal)
Règles agent     → .drox/conduct.md                 (Phase 6)
Structure repo   → workspace_map_read → .drox/workspace-map.json (pas d’arbre dans snapshot)
Chemins récents  → snapshot optionnel (fichiers touchés / lus — pas doublon carte)
Code             → outils file_* / grep (hors .drox/ exports)
```

#### Tâches Phase M

| ID | Tâche | Fichier(s) / scope |
|----|-------|-------------------|
| **M.1** | Supprimer `MEMORY.md` : `memdir.rs`, `load_memdir`, `memdir_system_prefix`, tests, prompts, `assemble.rs`, `agent_run.rs` | `drox-session`, `drox-cli` |
| **M.2** | Retirer `MEMORY` de `MemdirFiles` ; garder **`DROX.md` seul** dans memdir | `memdir.rs` |
| **M.3** | **CUT** `todo_write` : tool handler, allowlist, protocole `T-todo_write`, gates done/todos, `todo_gate.rs`, état `todo_statuses` / `task_labels`, rail `post_todos_close`, nudges, tests | `drox-tools`, `drox-engine`, prompts |
| **M.4** | Réorienter closure / rail : critères sans `last_todo_*` (plan interne + mutations + conduct) | `closure.rs`, `outcome.rs`, `rail/` |
| **M.5** | Snapshot : retirer `### Plan / todos` + **`### Workspace paths (sample)`** ; plan interne seul ; prompt rail : explorer via `workspace_map_read` | `run_snapshot.rs`, `01_core_rail_solo.md` |
| **M.5b** | Checkpoint compaction : corps **court** renvoyant au snapshot (M-3/M-4) ; pas de duplication ancres/objectif | `compaction.rs`, `context.rs` |
| **M.6** | Boot orchestration **M.10** : `architect_edit_boot_context` — `DROX.md` + teaser `memory_list` / conduct | `orchestration_run.rs`, `assemble.rs` ou module dédié |
| **M.7** | Canal unique archives : retirer listing sessions du boot **partout** ; documenter `memory_list`/`memory_read` | `assemble.rs`, `memory_budget.rs` |
| **M.8** | `.droxignore` : exclure `.drox/exports/` ; test `grep` | `drox_ignore`, `grep` tool, smoke S-CTX-01 |
| **M.9** | Dogfood M-3 : snapshot replace chaque tour suffit-il post-compaction ? Rapport smoke dédié | `SMOKE-M-memory-*.md` |
| **M.10** | **CUT** skills au boot ; garder `skill_list` / `skill_read` seulement ; audit doublons core | `assemble.rs`, `agent_run.rs`, `core_standard.rs` |
| **M.11** | UI historique : spec cache applicatif sessions JSONL (1.5.1) | doc extension |
| **M.12** | `rg` + tests verts post-CUT ; réécrire tests `gates.rs`, `drive_*`, rail | R-NOLEGACY |

**Ordre d’exécution recommandé** : **M.1 → M.2 → M.3 → M.4 → M.5 → M.5b** → **M.6 + M.7 + M.8 + M.10** → **M.9** (dogfood snapshot) → **Phase 6** (conduct).

**Risques M.3** : gros blast radius — traiter en une PR dédiée ; vérifier `MemoryTracker.todo_writes`, permissions, tool_orchestration serial batch.

---

### Phase 5 — Profils contexte & dogfood bout en bout (P0 gate)

**Objectif** : valider la **culture unique** en conditions réelles — **bloquant** pour 1.5.1.

| ID | Tâche | Détail |
|----|-------|--------|
| **5.1** | Seuils compaction par `num_ctx` / tuning | `CompactionConfig::from_tuning` |
| **5.2** | Doc [MATRIX-CONTEXT-PROFILES.md](MATRIX-CONTEXT-PROFILES.md) | |
| **5.3** | **Dogfood complet** : session 3-tours ([`chat_north-mini-code`](../chat_north-mini-code)) | salut + analyse + mutation |
| **5.4** | Rapport [SMOKE-1.4.2-*.md](.) avec métriques vs smoke F1 | iter, tool errors, USER-FACING REPLY |
| **5.5** | Mise à jour [moteur/09-run-rail](../moteur/09-run-rail/README.md) — une seule sémantique | |
| **5.6** | `cargo test -p drox-engine` + `drox-cli` + grep reliquats **finaux** | R-NOLEGACY + R-TEST |

---

## Flux cible (tour LLM — culture unique)

```text
iteration_start
  ├─ ctx_run_snapshot        (couche 3, replace)
  │    ├─ user request / objective
  │    ├─ internal plan (seul plan — post Phase M)
  │    ├─ session conduct?  (Phase 6)
  │    └─ project conduct?  (Phase 6, .drox/conduct.md + DROX.md boot)
  ├─ internal_plan_snapshot? (couche 3, si présent)
  ├─ tool_protocols FIXED    (couche 2, replace, compact)
  ├─ rail_snapshot HINT      (couche 1, replace)
  └─ (nudges append rares)

boot orchestration (Phase M.10)
  └─ DROX.md + conduct.md + rappel memory_* (pas de MEMORY.md, pas de listing auto)

user_message (Phase 6)
  └─ conduct_probe → JSON → session rules / project_conduct_write / clarification gate

llm_turn
  ├─ tool_specs = FULL EDIT palette   (couche 2, jamais filtré par station)
  └─ messages = boot + checkpoint? + historique récent (couche 4)

post_tool / compaction
  ├─ infer station → state.rail
  ├─ refresh snapshot (chemins touchés si gardés — pas workspace tree)
  └─ compaction → checkpoint COURT (renvoi snapshot) + ré-inject snapshot (M.5b)

outcome
  ├─ closure criteria → forced answer ou continue
  └─ schema_error count → escalate si max
```

---

## Cartographie fichiers (cible après purge)

```text
drox-engine/src/
  orchestration/
    conduct_probe/             # NEW Phase 6 — JSON multilingue, zéro heuristique user
    project_conduct_tool.rs    # NEW — virtuel project_conduct_write → .drox/conduct.md
    tuning/mod.rs              # sans tool_folders_enabled ✓
    tool_aliases.rs            # NEW — read_file → file_read
    internal_plan_tool.rs      # NEW — virtual internal_plan_write
    context_frame/
      apply/iteration.rs       # protocole compact unique ✓
      manifest.rs
    prompts/system/blocks/edit/
      01_core_rail_solo.md     # à réécrire (observateur)
    prompts/system/blocks/tools/
      mod.rs                   # tool_supplements_architect_compact ✓
    # tool_folders/            # SUPPRIMÉ ✓
  agent/
    rail/
      infer.rs                 # progression principale ✓
      snapshot_block.rs        # hint (texte à adoucir)
      transition.rs
      policy.rs                # inférence uniquement ✓
      # pre_gate.rs            # SUPPRIMÉ ✓
    gates/tool_pre.rs          # permissions produit seulement ✓
    loop/drive/
      llm_turn.rs              # specs complètes ✓
      outcome.rs               # closure moteur ✓
  run_spec/mod.rs              # allowlist plate ✓
```

---

## Tests & validation

| Niveau | Contenu |
|--------|---------|
| **Unit** | Rail : inférence station, file_edit en exploration, pas de pre-gate |
| **Unit** | Protocoles : snapshot stable 2 tours |
| **Unit** | Conduct : probe JSON FR → session rule sans regex |
| **Unit** | Conduct : post-compaction conserve `### User conduct (session)` |
| **Integration** | 3 prompts : salut, analyse repo, edit 1 fichier |
| **Dogfood bout en bout** | Session 3-tours export complet — **obligatoire** (R-TEST) |

### Critères d’acceptation 1.4.2

Voir la [checklist d’avancement](#checklist-davancement) (section **Acceptation**).

---

## Risques & mitigations

| Risque | Mitigation |
|--------|------------|
| Edits prématurés | Snapshot hint + VERIFY optionnel ; permissions inchangées |
| Contexte plus gros | Protocole compact ; compaction plus tôt petit ctx |
| Régression tests 1.4.1 | **Réécrire** les tests sur la culture unique — pas de double baseline |
| Merge à moitié | R-TEST : pas de gate 1.5.1 sans dogfood 3-tours vert |

---

## Hors scope 1.4.2 (→ versions suivantes)

| Sujet | Version |
|-------|---------|
| UI chat B-UI-*, replay polish | 1.5.1 |
| UI panneau règles conduct (6.11) | 1.5.1 |
| Signature Windows | 1.5.1 |
| Concurrence mémoire / `todo_write` / MEMORY.md | [Phase M](#phase-m--mémoire-unifiée-triage) — **dans** 1.4.2 |
| Index / graphe (couche 4 enrichie) | 1.5.2 |
| Cache UI historique sessions (révision) | 1.5.1 (M.11) |
| `llm-sampling.yaml` par profil modèle | 1.5.3 |
| Adaptateurs protocole par famille LLM | 1.5.3+ si nécessaire |

---

## Checklist d’avancement

> Cocher `[x]` au fur et à mesure. Respecter [R-FILE](#règles-de-chantier), [R-DOC](#règles-de-chantier), [R-NOLEGACY](#règles-de-chantier), [R-TEST](#règles-de-chantier).

### Phase 0 — Cadrage & doc

- [ ] **0.1** — Annexe FOI « 4 layers + rail observateur »
- [x] **0.2** — `frames-v0.yaml` : supprimer `tool_folders` ; protocole unique (`tool_supplements_architect_compact`)
- [x] **0.3** — [INVENTAIRE-OUTILS-1.4.2.md](INVENTAIRE-OUTILS-1.4.2.md) validé
- [x] **0.4** — `cargo test -p drox-engine` baseline vert (307 tests, 5 juin 2026)

### Phase T — Inventaire outils plats (P0)

- [x] **T.1** — Allowlist sans `read_workspace` / `edit_file` / `verify_project` (`run_spec/mod.rs`)
- [x] **T.2** — `llm_turn` sans `apply_tool_folder_specs`
- [x] **T.3** — État moteur sans `tool_folder_expanded` (`fields.rs`)
- [x] **T.4** — `ARCHITECT_EDIT_CORE_BLOCKS` + protocole compact (`blocks/tools/mod.rs`)
- [x] **T.5** — Schemas API : `file_edit` `required: [path, edits]` (schemars + test `tool_specs.rs`)
- [x] **T.6** — `drox-tools` aligné (pas de handlers folder — jamais ajoutés côté tools)
- [x] **T.7** — Tests : API plate tour 0 (`helpers/tool_specs.rs`)
- [x] **T.8** — Inventaire doc à jour post-M (`todo_write` retiré, plan interne seul)

### Phase P — Purge & zéro reliquat (R-NOLEGACY)

- [x] **P.1** — Supprimer module `orchestration/tool_folders/` (dépliants + describe)
- [x] **P.2** — Supprimer `filter_tool_specs_for_station`, `tool_allowed` (ACL) — `policy.rs` = inférence seule
- [x] **P.3** — Supprimer `tool_pre_gate_rail` + `pre_gate.rs`
- [x] **P.4** — Supprimer `tool_folders_enabled` de `EngineTuning`
- [x] **P.5** — Supprimer `tool_supplements_for_station` des exports (`lib.rs`, `prompts/mod.rs`)
- [x] **P.6** — `rg` clean symboles folder + dépliants (`drox/crates/`, juin 2026)
- [x] **P.7** — Réécrire tests rail (plus de « blocked at read » ; `is_mutation_tool`, `file_read` sans plan)

### Phase 1 — Couche 2 : outils libres (P0)

- [x] **1.1** — `llm_turn` : specs complètes, pas de filter station
- [x] **1.2** — `tool_pre` : permissions produit seulement (discuss, shape, bash, phase hallucinée)
- [x] **1.3** — Palette EDIT alignée allowlist plate (`run_spec/mod.rs` + `build_tool_specs` injecte `internal_plan_write`)
- [x] **1.4** — Tests : `file_read` sans pre-gate plan ; classification mutation (`agent/tests/rail.rs`, `gates/mod.rs`)
- [ ] **1.5** — Doc `///` contrat outils unique (R-DOC) — partiel
- [ ] **1.6** — Smoke partiel run 3 : 0× « read_workspace not expanded »

### Phase 2 — Couche 2 : protocoles unifiés (P0)

- [x] **2.1** — `apply_tool_protocols` → protocole compact unique (`iteration.rs`)
- [x] **2.2** — `tool_supplements_architect_compact` (= `ARCHITECT_EDIT_CORE_BLOCKS`)
- [x] **2.3** — Un seul `file_edit` ; blocs folder / describe supprimés avec `tool_folders/`
- [x] **2.4** — Retirer exports `tool_supplements_for_station` (`lib.rs`, `orchestration/mod.rs`)
- [x] **2.5** — Test : protocole `skip=unchanged` 2 tours (`snapshot.rs`)
- [x] **2.6** — [MATRIX-ACTUAL](../1.4.1/1.4.1.3/MATRIX-ACTUAL.md) à jour

### Phase 3 — Couches 1 & 3 : rail observateur (P1)

- [x] **3.1** — Réécrire `01_core_rail_solo.md` (observateur, sans gate/ACL)
- [x] **3.2** — `rail_snapshot_block` hint informatif
- [x] **3.3** — Snapshot enrichi : ligne station inférée (`run_snapshot.rs`)
- [x] **3.4** — Progression par `infer.rs` uniquement (ACL retirée ; `transition.rs` inchangé)
- [x] **3.5** — Plan interne optionnel, jamais bloquant (`internal_plan.rs`, `internal_plan_snapshot.rs`)
- [x] **3.6** — Fichiers touchés &lt; 500 L ou scindés (R-FILE) — nouveaux modules extraits
- [ ] **3.7** — Export : timeline rail sans `[gate:]` requis

### Phase 4 — Couche 4 & closure moteur (P1)

- [x] **4.1** — Critères closure moteur (`closure.rs` + `outcome.rs`)
- [x] **4.2** — Forced answering + `USER-FACING REPLY` (promotion sans gate mutation)
- [x] **4.3** — Plafond `schema_error_continue` → escalade (`SCHEMA_ERROR_CONTINUE_MAX=3`)
- [x] **4.4** — Snapshot compaction enrichi (ancre, station rail, fichiers touchés)
- [ ] **4.5** — (Optionnel) Tronquer vieux tool results
- [ ] **4.6** — Smoke mutation 1 fichier &lt; 15 iter

### Phase 5 — Dogfood bout en bout (P0 gate — R-TEST)

- [ ] **5.1** — Seuils compaction par `num_ctx`
- [ ] **5.2** — [MATRIX-CONTEXT-PROFILES.md](MATRIX-CONTEXT-PROFILES.md)
- [ ] **5.3** — Dogfood **3-tours** complet (`chat_north-mini-code`) — **fait** · gate **non vert** (voir rapport)
- [x] **5.4** — Rapport [SMOKE-1.4.2-ses_7b34fd1d.md](SMOKE-1.4.2-ses_7b34fd1d.md) — **P0 contexte ~316k + perte fil compaction** · correctifs **différés**
- [ ] **5.5** — [09-run-rail](../moteur/09-run-rail/README.md) culture unique
- [x] **5.6** — `cargo test` engine + cli + session + tools verts (544 tests, 5 juin 2026)

### Phase 6 — Conduct utilisateur (P1 — R-CONDUCT)

- [ ] **6.1** — Module `conduct_probe` (JSON strict, tests parse multilingue)
- [ ] **6.2** — Brancher probe sur message `user`
- [ ] **6.3** — `session_conduct_rules` dans `ArchitectRunState`
- [ ] **6.4** — Snapshot `### User conduct (session)` + survie compaction
- [ ] **6.5** — Outil virtuel `project_conduct_write`
- [ ] **6.6** — `.drox/conduct.md` load boot + compaction si budget dépassé
- [ ] **6.7** — Snapshot `### Project conduct (workspace)`
- [ ] **6.8** — Gate `coverage: unknown` → `ask_user_question`
- [ ] **6.9** — Doc conduct ≠ plan interne
- [ ] **6.10** — Tests probe + compaction conduct
- [ ] **6.11** — (P2 → 1.5.1) UI règles actives

### Phase M — Mémoire unifiée (triage — R-MEMORY)

- [x] **M.1** — CUT `MEMORY.md` + code memdir associé
- [x] **M.2** — Memdir = `DROX.md` seul
- [x] **M.3** — CUT `todo_write` + mécaniques (gates, rail post-todos, protocole)
- [x] **M.4** — Closure / rail sans compteurs todo
- [x] **M.5** — Snapshot : plan interne seul ; **sans** `Workspace paths`
- [x] **M.5b** — Checkpoint compaction court → renvoi snapshot (expé M-3)
- [x] **M.6** — Boot orchestration : mémoire projet minimale (M.10)
- [x] **M.7** — Canal unique `memory_list` / `memory_read` (pas listing boot)
- [x] **M.8** — `.droxignore` + grep : exclure `exports/`
- [ ] **M.9** — Dogfood snapshot post-compaction → [SMOKE-M-memory-TEMPLATE.md](SMOKE-M-memory-TEMPLATE.md)
- [x] **M.10** — Skills **invocation seule** (CUT listing boot) + audit doublons
- [ ] **M.11** — Spec cache UI historique JSONL (1.5.1)
- [x] **M.12** — `rg` + tests verts post-triage (reliquats = commentaires tests + assertions négatives)

### Documentation (transversal R-DOC)

- [x] **D.1** — [README 1.4.2](README.md) à jour (statut implémentation clôturée)
- [x] **D.2** — Ce plan : checklist cochée, statut « implémentation clôturée »
- [ ] **D.3** — FOI : ancien rail prescriptif **retiré**, pas « deprecated »
- [x] **D.4** — MATRIX-ACTUAL parité injection unique
- [ ] **D.5** — Re-estimation [1.5.1](../1.5/1.5.1/README.md) post-dogfood

### Acceptation (gate 1.4.2 → 1.5.1 — R-TEST)

- [x] **A.1** — **Une seule** culture moteur (grep reliquats `drox/crates/` + **0 dossier dépliant** dans API)
- [ ] **A.2** — Run analyse : OK vs smoke F1 — ✅ (smoke `ses_7b34fd1d`)
- [ ] **A.3** — Run mutation : 0× `read_workspace` / `edit_file` / describe — ✅ pas d’erreur folder
- [ ] **A.4** — Run mutation : `file_edit` OK — ❌ (smoke `ses_7b34fd1d` : aucune mutation)
- [ ] **A.5** — `schema_error_continue_count` ≤ 3 — ❌ (4)
- [ ] **A.6** — Timeline rail UI cohérente — ⚠️
- [x] **A.7** — `cargo test` **100 % vert** (`drox-engine` 298 · `drox-cli` 95 · `drox-session` 35 · `drox-tools` 115)
- [ ] **A.8** — Dogfood 3-tours + `SMOKE-1.4.2-*.md` / `SMOKE-M-memory-*.md` — **rejeu post-M requis**
- [ ] **A.9** — (Phase 6) Conduct — **hors scope clôture implémentation**
- [x] **A.10** — Phase M : zéro `MEMORY.md` / `todo_write` actif dans `drox/crates/` ; boot EDIT mémoire minimale ; canal archives `memory_*`

---

## Séquence release

```text
1.4.1 clôturée
    → 1.4.2 implémentation livrée (T, P, 1–4, M)
        → dogfood M.9 + gate Acceptation (A.*)
            → Phase 6 conduct (probe, .drox/conduct.md)
                → 1.5.1 UI + signature (si A.* verts)
```

---

## Liens

- [README 1.4.2](README.md)
- [Inventaire outils](INVENTAIRE-OUTILS-1.4.2.md)
- [Matrice injection actuelle](../1.4.1/1.4.1.3/MATRIX-ACTUAL.md)
- [Run rail](../moteur/09-run-rail/README.md)
- [Smoke F1](../1.5/1.5.1/SMOKE-ses_7df5045c.md)
- [Hub 1.4](../README.md)
