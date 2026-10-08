# Plan — Contrats de retour Explore + index navigable (scope discussion)

**Statut** : ambition validée · **E1–E4 + E4b** (2026-10-07) · **P-safe + P-json** (2026-10-08) · notes version à jour · **dogfood E5** dû  
 
**Parent** : [README 1.6.0](README.md) · [JOURNAL-PROMPTS-ET-HORS-WS.md](JOURNAL-PROMPTS-ET-HORS-WS.md) · [PLAN-DOGFOOD-TERMINAL-EXPLORE.md](PLAN-DOGFOOD-TERMINAL-EXPLORE.md)  
**Règle** : Prefer soft / contrats mécaniques côté artefacts — pas de hard gate inventé hors brief ([pas-d-initiative](../../../.cursor/rules/pas-d-initiative.mdc))

---

## 1. Problème

Aujourd’hui le parent spawn un Explore avec `must_return` en **prose libre**. L’enfant rend surtout un **`conclusion.md` unique**. Le moteur **ne vérifie pas** que chaque critère est rempli. Le parent re-lit souvent les sources → spirale de contexte (voir dogfood + [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md)).

**Cible** : modèle type **arguments de fonction** —

1. le parent choisit des **formats de retour** précis (+ sous-précisions) ;  
2. l’enfant est tenu de les produire (artefacts séparés) ;  
3. le moteur **contrôle** la complétude ;  
4. le parent **navigue** des résumés très courts (index) pour savoir où mettre le nez ;  
5. la définition d’outil **pousse** à déléguer pour **économiser le contexte** parent ;  
6. tout l’index / artefacts est **scopé à la discussion** (pas de fuite cross-chat).

---

## 2. Cap produit (une phrase)

> Le parent déclare un contrat de retour typé ; Explore le remplit en artefacts vérifiables ; un index session-local à blurbs courts permet de naviguer sans recharger le gros rapport ni les sources.

---

## 3. Contrats typés — `return_kinds`

Le parent coche **une ou plusieurs** sorties structurées (schéma JSON de `task`), pas seulement du texte libre.

### 3.1 Catalogue V1 (à figer avant code — noms stables)

| Kind | Artefact typique | Rôle |
|------|------------------|------|
| `paths_read` | `paths_read.md` | Liste des chemins lus / inventoriés |
| `file_summaries` | `file_summaries.md` | Résumé court par fichier |
| `key_symbols` | `key_symbols.md` | Fns / types / routes / entrypoints |
| `code_snippets` | `code_snippets.md` | Extraits bornés (caps) |
| `structure_map` | `structure_map.md` | Arbo / modules / dépendances légères |
| `gaps` | `gaps.md` | Ce qui manque encore / incertitudes |

**Règle** : ≤ ~6 kinds en V1 — intelligibles pour un max de modèles (locaux / flash inclus).  
Élargir le catalogue seulement après dogfood.

### 3.2 Layout disque (par run Explore)

```text
.drox/subagents/<sessionId>/<exploreId>/
  manifest.json          # kinds demandés, status, options, chemins
  paths_read.md          # si coché
  file_summaries.md
  …
  conclusion.md          # optionnel / legacy — synthèse globale courte
```

Chaque kind coché → **fichier (ou sous-dossier) dédié**, pas un seul pavé monolithique.

### 3.3 `must_return` free-text

Reste en **complément / legacy** (acceptance prose). Le **cœur du contrat** = `return_kinds` (+ options). Ne pas dupliquer le protocole Plan→Assign→Merge hors `session.subagents.explore`.

---

## 4. Sous-précisions (options par kind)

Pour des retours encore plus ciblés, le parent peut paramétrer chaque kind (schéma JSON, pas NL).

| Kind | Options V1 (exemples) |
|------|------------------------|
| `file_summaries` | `max_files`, `max_chars_per_file`, `focus`: `architecture` \| `api` \| `ui` |
| `code_snippets` | `max_snippets`, `signatures_only` |
| `paths_read` | `include_line_counts`, `glob_filter` |
| `key_symbols` | `symbol_kinds`: `fn` \| `type` \| `route`, `max_items` |
| `structure_map` | `max_depth` |
| `gaps` | (souvent sans option) |

Caps = **borne d’écriture enfant** + aide au contrôle moteur (ex. fichier non vide, pas 50k lignes).

---

## 5. Contrôle moteur

Après fin de run enfant :

1. **Phase 2 (synth)** demande un **JSON** dont les clés = `return_kinds` (+ `recommended_next_parent_steps`). Parse + **1 retry** si invalide ; sinon fallback extract markdown.  
2. Pour chaque `return_kind` : artefact **présent**, **non vide**, et **pas stub** (lint : TBD / tiret seul / outline trop court).  
3. Extract markdown (fallback) : header `## <kind>` — **dernier** match gagne (évite outlines CoT en tête).  
4. Si manque / stub → `kinds_incomplete` + `truncated` / status `kinds_incomplete` — **mécanique**.  
5. Tool_result parent :  
   - `explore_id`  
   - `summary` / blurb court  
   - `artifacts: { kind → path }`  
   - `status` / `truncated` / iterations  
   - **pas** le dump complet enfant dans le chat

Phase 1 (enfant) : **gather only** — ne pas écrire les headers `## <kind>` ; le contrat phase1 le rappelle (`format_kinds_contract`).

Lien soft déjà livré : [post-merge closure](JOURNAL-PROMPTS-ET-HORS-WS.md) — le parent fusionne / agit à partir des artefacts, ne re-vérifie pas les sources.

---

## 6. Identifiants + index navigable (blurbs)

### 6.1 IDs

| Id | Rôle |
|----|------|
| `session_id` | Discussion / chat courant (obligatoire) |
| `explore_id` | Un appel `task` Explore (stable, moteur) |
| `parent_run_id` | Run agent parent (si dispo) |
| `plan_step_id` | Optionnel — lien todo |

### 6.2 Index local

Store sous la session (JSONL ou sqlite — détail d’impl) :

```text
explore_id | session_id | title | return_kinds[] | status
blurb ≤ ~200 chars
artifacts { kind → rel_path }
created_at | truncated | iterations_used | …
```

### 6.3 Tools parent (navigation)

| Tool (noms provisoires) | Effet |
|-------------------------|--------|
| `explore_index_list` | Liste **blurbs** de **cette** session seulement |
| `explore_artifact_read` | Lit **un** kind pour un `explore_id` (scope session) |

Le parent navigue : **blurb → kind utile → détail**. Il n’injecte pas le transcript enfant.

---

## 7. Scope strict = discussion en cours

**Décision figée** : index + artefacts + IDs sont **par discussion**.

| Règle | Comportement |
|-------|----------------|
| Nouvelle discussion | Parent **sans accès** aux Explore de la discussion précédente |
| Même workspace | Fichiers projet partagés OK ; **mémoire Explore ≠ mémoire projet** |
| Chemins | `.drox/subagents/<sessionId>/…` (pas de pool global au folder) |
| Moteur | Refus si `explore_id` hors `session_id` du run courant |

Pas de fuite cross-chat, même si l’utilisateur rouvre le même dossier.

---

## 8. Définition d’outil — pousser la délégation

Dans le schéma / description de `task` (et éventuellement un mini-catalogue exposé) :

- le parent **voit** kinds + options possibles (précision des retours) ;  
- message produit explicite : préférer `task` + `return_kinds` pour inventaire / structure / symboles — **économiser le contexte** parent ;  
- ne pas parent-`file_read` l’arbre quand un kind couvre le besoin ;  
- lire ensuite seulement les artefacts nécessaires via index / `explore_artifact_read`.

Alignement industrie (rappel) : Explore pour « comment c’est bâti » ; embed `@Codebase` pour rappel sémantique flou ; grep/symbols pour prouver — voir ambition [codebase](../../1.5/1.5.21/codebase/AMBITION.md). Ce plan **ne remplace pas** l’embed ; il structure les retours Explore.

---

## 9. Lien avec l’existant

| Existant | Rôle demain |
|----------|-------------|
| `must_return` (texte) | Complément / legacy |
| `conclusion.md` unique | Complété / remplacé par `manifest` + fichiers par kind |
| `report_path` + summary | + `explore_id` + map d’artefacts + ligne d’index |
| Soft post-merge / anti-rotation | Parent lit index/kind, pas re-vérif sources |
| `session.subagents.explore` | Canon Plan→Assign→Merge — delta contrat de retour ici, pas second playbook |

---

## 10. Ordre de livraison (quand on code)

| Étape | Contenu | État |
|-------|---------|------|
| **E0** | Fiche ambition (ce document) + liens hub | ✅ doc |
| **E1** | Catalogue kinds V1 + options mini + schéma `task.return_kinds` | ✅ `drox-tools/subagent/return_kinds.rs` + `TaskInput` |
| **E2** | Artefacts par kind + `manifest` + vérif moteur | ✅ `explore_artifact::write_explore_bundle` |
| **E3** | Index session-scoped + blurbs + tools navigation | ✅ `index.jsonl` + `explore_index_list` / `explore_artifact_read` |
| **E4** | Durcir description `task` / supplement (économie de contexte) | ✅ prompts |
| **E4b** | Tags UI carte Explore (`explore` + kinds + thoroughness) | ✅ `exploreCard.js` / wire |
| **E5** | Notes [JOURNAL](JOURNAL-PROMPTS-ET-HORS-WS.md) / RELEASE_NOTES / popup | ✅ docs · ⬜ dogfood manuel |
| **P-safe** | Extract **last-match** + lint stub → `kinds_incomplete` ; phase1 sans headers | ✅ `explore_artifact.rs` + prompts |
| **P-json** | Synth phase2 **JSON** + parse/retry + `write_bundle` depuis map | ✅ `explore_executor` + `format_kinds_json_contract` |
| **P-harden** | JSON fail / stubs méta → **incomplete** (plus de soft-OK markdown) ; notes synth filtrées ; `executionThink` setting | ✅ 2026-10-08 |

Layout live : `.drox/subagents/<sessionId>/<exploreId>/{manifest.json,conclusion.md,<kind>.md}` + `index.jsonl`.

---

## 11. Hors scope (ce plan)

- Embed whole-repo comme seule source de vérité overview.  
- Abort hard sur relecture (Prefer soft déjà livré à part).  
- Partage d’index Explore **entre** discussions.  
- Vectoriser le transcript parent (anti-décision Vague 4).

---

## 12. Critères de succès dogfood

1. Parent coche ≥1 `return_kind` sur un Explore docs / archi.  
2. Artefacts présents ; incomplete si kind manquant.  
3. Parent fusionne via blurb / un kind — **pas** de spirale `file_read` post-merge sur les mêmes sources.  
4. Nouvelle discussion : `explore_index_list` **vide** (ou sans lignes de l’autre session).  
5. Jauge parent nettement plus basse qu’un dump parent multi-fichiers équivalent.

---

## Liens

- [JOURNAL-PROMPTS-ET-HORS-WS.md](JOURNAL-PROMPTS-ET-HORS-WS.md)  
- [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md)  
- [PLAN-DOGFOOD-TERMINAL-EXPLORE.md](PLAN-DOGFOOD-TERMINAL-EXPLORE.md)  
- `drox-prompts` : `session.subagents.explore`, tool `task`  
- Artefacts actuels : `drox-engine/.../subagent/explore_artifact.rs`
