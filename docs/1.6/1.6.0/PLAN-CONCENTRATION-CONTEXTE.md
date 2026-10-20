# Plan — Concentration modèle & pertinence face aux règles (volume / ordre)

**Statut** : C1–C5 ✅ · Option A / `artifacts_inline` ✅ · inventaire + P1–P3 ✅ · **D1–D4** ✅ · **E1+E2** ✅ · **F1+F2** ✅ (2026-10-12) — voir [APPROCHE-CONTRATS-ETAPE.md](APPROCHE-CONTRATS-ETAPE.md)  
**Parent** : [README 1.6.0](README.md) · [JOURNAL-PROMPTS-ET-HORS-WS.md](JOURNAL-PROMPTS-ET-HORS-WS.md) · [PLAN-CONTEXT-SITUATION.md](PLAN-CONTEXT-SITUATION.md) · [PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md)  
**Carte injection** : `drox-prompts/docs/injection-map.md`  
**Règle** : Prefer soft d’abord ; pas de hard gate inventé hors brief ([pas-d-initiative](../../../.cursor/rules/pas-d-initiative.mdc))

---

## 1. Cap (une phrase)

> Garder les **règles** et les **rappels d’acte** visibles pour le modèle en réduisant ce qui se met **entre** elles et le prochain token — surtout le volume dynamique des tool results — sans changer le paradigme phases / tools / Explore.

---

## 2. Cadre scientifique (rappel utile)

Ce n’est **pas** une spec d’implémentation ; c’est le pourquoi des leviers.

| Constat | Implication produit |
|---------|---------------------|
| **Lost in the Middle** (Liu et al.) — info utile mieux utilisée en **début** et **fin** de contexte, mal au **milieu** | Éviter d’enfouir règles + décisions sous des dumps ; rappels **récents** aux actes critiques |
| **Rôles** system / user / tool — hiérarchie **apprise**, pas garantie | Règles en system + nudges ; tool output = **données** ; filets mécaniques si critique |
| **Fichier ≠ priorité magique** | Tout ce qui est lu devient des tokens au prochain tour ; un fichier « historique » n’abaisse pas les règles, il **ajoute** du volume s’il est collé dans le chat |
| **Tour** = une génération LLM (± tools + résultats) | Chaque gros `file_read` grossit **tous** les tours suivants |

**Levier Drox dominant (diagnostic 2026-10-08)** : volume **dynamique** (outils) ≫ défaut d’ordre des canaux.  
L’ordre A/B/C/E est déjà **cohérent** ; la dose vécue en dogfood ne l’est pas.

---

## 3. État Drox (forces / fragilités)

### 3.1 Forces (à préserver)

| Force | Où |
|-------|-----|
| Canaux séparés A (blob) / B (runtime) / C (schemas) / E (Explore) | `injection-map.md` |
| Rappels Prefer au moment utile (post-merge, rotating read, kickoff Explore…) | `drive.rs` + `drox-prompts` |
| Explore conversation isolée + phase rapport dédiée (thinking off, JSON) | `explore_executor` |
| Filets hors-modèle (`kinds_incomplete`, gates FX-B, stop answering) | artefacts + drive |
| Intention « protocole ×1 + deltas courts » | journal / injection-map |

### 3.2 Fragilités (cibles de ce plan)

| Id | Fragilité | Symptôme dogfood |
|----|-----------|------------------|
| **V1** | Volume dynamique tool results (parent) | Centaines de `file_read`, jauge / tokens in explosent |
| **V2** | Parent re-lit les sources après Explore | Artefacts pourris ou ignorés → spirale |
| **V3** | Blob A trop chargé (toujours-on) | CORE + listings + map + rules + supplements |
| **V4** | Situation card / milieu qui grossit | Concurrence avec nudges courts |
| **V5** | Explore exec : notes CoT / dumps enfants | Synth rapport difficile (P-harden partiel ✅) |
| **V6** | Rappels d’acte encore trop longs ou absents à certains pivots | Règle dite une fois au boot, oubliée à l’action |

Notes de cohérence (ordre / volume) — voir discussion 2026-10-08 : ordre ~8/10, volume dynamique ~4/10 en dogfood doc.

---

## 4. Solutions applicables par point

Pour chaque fragilité : solutions **applicables** (produit / moteur), statut, et priorité relative.  
Légende statut : ⬜ idée · 🟡 partiel / déjà amorcé · ✅ livré ailleurs · ❌ hors scope 1.6

### V1 — Volume dynamique (tool results parent)

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V1-a | **Spill / stub** des gros tool results hors fenêtre chaude (path + extrait + pointeur) | Mécanique curation | ✅ **C1** (2026-10-09) | Voir §9 brief C1 |
| V1-b | **Plafond de corps** tool_result lecture : seuil spill 8 KiB + preview 512 B | Tool UX / spill | ✅ **C1** (avec V1-a) | Pas de résumé LLM — spill mécanique |
| V1-c | Compteur / Prefer « trop de lectures parent cette fenêtre » (étendre S5 / rotating) | Soft B | 🟡 | Déjà `rotating_file_read` + S5 |
| V1-d | Ne **pas** renvoyer le transcript tool complet dans les nudges | Hygiene B | 🟡 à auditer | |

**Critère de succès V1** : après un run doc typique, tokens in / taille transcript nettement plus bas à mission équivalente ; règles CORE encore « proches » de la génération (pas enfouies sous 100k de md).

---

### V2 — Parent merge-only après Explore

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V2-a | Artefacts Explore **utiles** (JSON / incomplete honnête) | Contrats | ✅ P-safe/P-json/P-harden | Prérequis |
| V2-b | Prefer post-merge : fusionner via blurb / `explore_artifact_read`, **pas** re-`file_read` sources | Soft B | ✅ `post_merge_closure` | Dogfood E5 à revalider |
| V2-c | Prefer si parent relit paths Explore | Soft B | ✅ **C2** · ✅ **D3** · ✅ **E1** · ✅ **E2** · ✅ **F1/F2** (pas de spill merge) | `explore_covered` + spill Explore 64 KiB + hot-snip preserve |
| V2-d | Tool_result `task` : summary/blurb + **`artifacts_inline`** ; plus de `conclusion.md` | C / outcome | ✅ **C2** + Option A | slim ; wire UI via summary/artefact |
| V2-e | UI : afficher kinds incomplets (déjà tags) pour que l’humain voie le trou | UI | ✅ E4b | |

**Critère de succès V2** : après Explore OK, ≤ 1–2 `file_read` parent hors artefacts ; 0 spirale layout/sidebar.

---

### V3 — Blob A (system toujours-on)

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V3-a | **CORE mince** : pointer vers supplements ; retirer redites | Prompts A | 🟡 Vague 4 / curation | Continuer |
| V3-b | Listings skills / archives / map → **index 1 ligne** + tools list/read | A → C | ✅ **C3** | Formatters + CORE |
| V3-c | Rules IDE : injecter **résumé / règles scorées**, détail via tool ou fichier opt-in | A / IDE | ⬜ | Hors lot C3 |
| V3-d | Supplements (Explore, hors-WS, professor, thinking) **uniquement si flag run** | A | ✅ déjà + markers C3 | Confirmé flags |
| V3-e | Mesurer taille blob A (obs) par composant | OBS | ⬜ | Markers `c3.blob_a_index` chars |

**Critère de succès V3** : taille blob A médiane ↓ ; aucun listing multi-ko collé si non utilisé dans le run.

---

### V4 — Situation card & « haut du bas »

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V4-a | Card = **jauge + next step + 1 contrainte** (budget lignes strict) | B | ✅ **C4** | 3 lignes corps |
| V4-b | Ne pas dupliquer le protocole Explore dans la card | Hygiene | ✅ **C4** | Assert + format |
| V4-c | Card ne réinjecte pas files_touched / historique tools | B | ✅ **C4** | paths hors card |

**Critère de succès V4** : card &lt; N lignes stables ; nudges Prefer restent les derniers messages system avant génération.

---

### V5 — Explore enfant (exec + rapport)

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V5-a | Phase rapport : JSON + refuse soft-OK + notes filtrées | E | ✅ P-harden | Dogfood à rejouer |
| V5-b | `executionThink` / `reportThink` défaut off | Settings généraux | ✅ | Checkbox report à côté d’execution |
| V5-c | Budget tools Explore / thoroughness (déjà) — éviter lecture fichier entier | E | 🟡 | Caps `return_options` |
| V5-d | Ne pas recoller **toute** la description parent au synth si notes + activity suffisent | E | ✅ **C5** → **C5b zéro desc** | synth = notes + contrat |
| V5-e | Activity synth plafonnée (déjà ~2.5k) — idem notes | E | ✅ **C5b zéro activity** | |
| V5-f | Description `task` plafonnée (~900) + notes phase 1 télégraphiques | E | ✅ **C5b** | `normalize_explore_task_description` + filtre notes |

**Critère de succès V5** : kinds non-stubs ; parent n’a pas besoin de re-inventorier via `bash dir`.

---

### V6 — Rappels d’acte (récence des règles)

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V6-a | Micro-rappel **2–4 lignes** juste avant actes critiques (spawn `task`, acting write, rapport déjà OK) | Soft B | ✅ **C4** | kickoff + post-merge + `micro_act_write` |
| V6-b | Éviter de **re-dérouler** le protocole Plan→Assign→Merge dans chaque nudge | Hygiene prompts | 🟡 intention doc | Lint claims / revue |
| V6-c | Un seul endroit canonique du protocole (`session.subagents.explore`) | A | ✅ | |

**Critère de succès V6** : à l’acte, le modèle voit une consigne courte **en fin** de contexte ; le protocole long reste ×1 en A.

---

## 5. Ce qu’on ne fait pas (hors scope proche)

- Vectoriser le transcript parent comme seule vérité (anti-décision Vague 4).
- Hard gate « interdiction totale de `file_read` parent » sans brief.
- Empiler des « IMPORTANT » dans le system pour compenser le volume.
- Dupliquer ce plan dans une seconde bible prompts.

---

## 6. Ordre de livraison proposé (quand on code)

| Lot | Contenu | Dépend | Priorité |
|-----|---------|--------|----------|
| **C0** | Cette fiche + liens hub / journal | — | ✅ doc |
| **C1** | Durcir spill/stub tool results parent (V1-a/b) | — | ✅ moteur 2026-10-09 |
| **C2** | Merge-only : slim outcome `task` + Prefer V2-c | V2-a ✅ | ✅ moteur 2026-10-09 |
| **C3** | Amincir blob A : listings → pointeurs (V3-b/d) | — | ✅ moteur 2026-10-09 |
| **C4** | Borner situation card (V4-a) + micro-rappels V6-a | — | ✅ moteur 2026-10-09 |
| **C5** | Explore synth : description allégée V5-d (+ dogfood E5) | P-harden ✅ | ✅ moteur 2026-10-09 |
| **C6** | Granularité modèle Explore (temp / model override) | settings think ✅ | P2 |
| **D3** | C2 armé malgré Explore truncated | C2 | ✅ `merge_from_task_outcome` · plus de `clear` si truncated |
| **D1** | Spill sans « re-read » après Preview dropped | C1 | ✅ stubs `tool_result_spill` |
| **Inv** | Inventaire volumes prompts + coupe CORE/`task` | C3/V6 | ✅ mesure · ✅ P1–P3 |
| **E1** | Covered = sources `paths_read` **+** fichiers kind `artifacts.*` | C2 | ✅ `explore_covered` |
| **E2** | Post-Explore OK + ≥1 heavy read sans mutate → Prefer act | C2/C4 | ✅ seuil **1** |
| **E2b** | `file_read` kind → Prefer act immédiat | E1/E2 | ✅ `CoveredHit::Kind` |
| **A** | Erreur `explore_artifact_read` → Prefer recovery (pas `file_read` kind) | F1 | ✅ `runtime.explore_artifact_read_fail` |
| **F1** | Livraison Explore (`task` / `explore_artifact_read`) : spill à **64 KiB** | C1 | ✅ `tool_result_spill/thresholds` |
| **F2** | Hot snip : compact merge préservé (pas spill 512 B) | C1/F1 | ✅ `tool_result_spill/hot_snip` |

Règle : un lot = un brief validé ; **recovery / livraison moteur (D*, F*) avant** Prefer soft empilés.

---

## 7. Liens avec lots déjà livrés

| Lot existant | Rapport à ce plan |
|--------------|-------------------|
| Vague 4 situation / snip / CORE | Fondations V3/V4 — à pousser en dose |
| Soft post-merge / rotating read | V1-c / V2-b |
| Explore return contracts + P-harden | V2-a / V5-a |
| `injection-map` / journal prompts | Source de vérité ordre A/B |

---

## 8. Prochaine étape (process)

1. ~~C1–C5 · D1–D4 · E1+E2 · F1+F2~~ ✅  
2. Dogfood revalider post-F1/F2 (même brief site-kdds) — grep marqueurs §10.  
3. C6 / retrieve list-search-embed / kind `rewrite_plan` seulement si briefé.

---

## 9. Brief C1 — spill / stub parent (livré · **F1/F2** 2026-10-12)

### Décisions

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| Spill lecture-lourde | **8 KiB** | `file_read` / `grep` / `glob` / `explore_index_*` / `notebook_read` |
| Spill autres | **24 KiB** | inchangé (bash, etc.) |
| Spill **livraison Explore** (**F1**) | **64 KiB** | `task` (slim) + `explore_artifact_read` — ne pas annuler le merge |
| Preview stub générique | **512 B** | reconnaître le dump, pas raisonner dessus |
| Hot snip Explore (**F2**) | Compact `EXPLORE MERGE PRESERVED` | summary + chemins kind + extrait inline (~2,4k car.) — **pas** spill 512 B |
| Fenêtre chaude | **4** derniers `tool_result` complets | snip hors fenêtre même sous autocompact |
| Seuil snip chaud | **~200 tokens** estimés | évacuer aussi les dumps « moyens » |
| Avant stub (non-Explore) | **toujours spill** sur `.drox/tool-outputs/` | pas de perte silencieuse |

### Code (séparation n+1)

| Module | Rôle |
|--------|------|
| `agent/tool_result_spill/mod.rs` | API publique du lot |
| `…/thresholds.rs` | Seuils + classification F1 |
| `…/slim_task.rs` | Slim outcome `task` (C2) |
| `…/format.rs` | Émission post-outil → inline / spill |
| `…/hot_snip.rs` | Snip chaud + F2 merge préservé |
| `drox-context` `snip_messages_with` | Snip avec placeholder dérivé du contenu (sans FS) |
| `context_policy::maybe_snip_hot` | Fenêtre 4 + `stub_for_hot_snip` si workspace fourni |
| `agent/run/lifecycle.rs` | Passe hot snip avec `workspace_root` |

### Hors C1 (plus tard)

- Outils `tool_output_list` / `tool_output_search` sur spills (retrievability).
- Embed optionnel à l’écriture spill (find-not-lighten) — **pas** pour alléger le chat.

### Critère dogfood

Run doc typique : moins de dumps md inline ; **merge Explore encore lisible** après snip ; stubs génériques avec path ; Prefer encore visibles en fin de contexte.

---

## 10. Brief C2 — merge-only + marqueurs dogfood

### Décisions

| Élément | Comportement |
|---------|----------------|
| Slim `task` → LLM | Pas de `report` ; summary ≤700 ; blurb ≤200 |
| Wire UI | Peut encore recevoir `report` (carte Explore) |
| Post-merge Prefer | Pointe artefacts / `explore_artifact_read`, pas re-`file_read` sources |
| V2-c Prefer (**E1**) | Après merge : `file_read` d’une **source** `paths_read` **ou** d’un **fichier kind** `artifacts.*` → one-shot soft |
| Stall-act Prefer (**E2**/E2b) | ≥1 heavy read post-Explore **ou** hit kind → Prefer skeleton write |
| Artifact-read fail (**A**) | Erreur `explore_artifact_read` → Prefer : inline / retry once — jamais `file_read` kind |

### Code

| Module | Rôle |
|--------|------|
| `tool_result_spill/slim_task.rs` | V2-d |
| `situation/explore_covered.rs` | Tracking sources + kinds (**E1**) + hit `file_read` |
| `runtime.explore_covered_reread` | Texte Prefer V2-c / E1 |
| `runtime.post_explore_stall_act` | Texte Prefer E2 |
| `drive.rs` | Armement / injection E1+E2 + fenêtre `post_explore_*` |

### Marqueurs tracing (`marker=…`, message `dogfood:`)

Grep logs / transcript export :

| Marker | Signifie |
|--------|----------|
| `c1.spill` | Gros tool_result écrit sous `.drox/tool-outputs/` (champ `explore_delivery` si F1) |
| `c1.spill_failed` | Spill disque échoué → truncate |
| `c1.hot_snip` | Snip chaud (fenêtre 4) + spill-before-stub |
| `f2.hot_snip_explore_preserve` | Hot snip → compact merge Explore (F2) |
| `c1.rotating_file_read` | Prefer rotation multi-path |
| `c2.slim_task` | Outcome `task` slimé pour le LLM |
| `c2.post_merge_closure` | Prefer post-merge injecté |
| `c2.explore_paths_tracked` | N paths chargés (sources + kinds E1) |
| `c2.explore_covered_hit` | Parent `file_read` d’un path couvert |
| `c2.explore_covered_reread_prefer` | Prefer V2-c / E1 injecté |
| `e2.post_explore_stall_act` | Prefer stall-act E2 / E2b injecté |
| `a.explore_artifact_read_fail` | Prefer recovery après erreur `explore_artifact_read` |

Stub texte (historique LLM) : `LARGE OUTPUT SPILLED TO DISK`, `SPILLED FOR CONTEXT`, `EXPLORE MERGE PRESERVED`, `.drox/tool-outputs/`.

**Embed** : pas encore de marker (lot retrieve ultérieur) — placeholder intention : `c1.embed_spill` quand branché.

### Critère dogfood C2

Après Explore OK : Prefer post-merge visible ; merge **non spillé** sous 64 KiB ; si relecture covered → Prefer E1 ; si stall lectures → Prefer E2 ; transcript LLM sans markdown `report` collé ; **acting** (write/edit) plutôt que ×100 `file_read` sur les mêmes 3 fichiers.

---

## 11. Brief C3 — blob A index (livré)

### Décisions

| Bloc | Avant | Après C3 |
|------|-------|----------|
| Skills | jusqu’à 8 KiB name+desc | **1 ligne** count + `skill_list` / `skill_read` |
| Archives memory | ≤10 lignes date+slug+obj | **1 ligne** count + `memory_list` / `memory_read` |
| Workspace map | ≤28 nœuds | **1 ligne** fresh/stale + count + `workspace_map_read` |
| Supplements session | flag-gated | inchangé + markers `c3.supplement` |
| Rules IDE 12k | — | hors scope (V3-c) |

### Code

| Site | Rôle |
|------|------|
| `skills/catalog.rs` `format_skills_listing_for_prompt` | Index skills |
| `memory_sessions.rs` `format_sessions_listing_for_prompt` | Index archives |
| `workspace_map.rs` `format_workspace_map_for_prompt` | Index map |
| `core.rs` Session memory / Local skills / 3ter | Alignement consignes |
| `jsonrpc/handlers/mod.rs` | Markers dogfood à l’inject |

### Marqueurs

| Marker | Signifie |
|--------|----------|
| `c3.blob_a_index` | Index skills / memory / map collé (`kind`, `chars`) |
| `c3.supplement` | Supplement flag-gated collé (`kind` = explore / thinking / professor) |

### Critère dogfood C3

Blob A sans listing multi-ligne skills/archives/map ; modèle appelle `skill_list` / `memory_list` / `workspace_map_read` quand besoin.

---

## 12. Brief C4 — situation card + micros (livré)

### Card (V4)

| Champ | Contenu |
|-------|---------|
| `gauge` | open (p/i) · done · mode · obj tronqué |
| `next` | next todo tronqué |
| `constraint` | `last_tool_error` **ou** une contrainte produit courte |
| Hors card | `files_touched`, protocole Explore, dumps tools |

### Micros (V6-a)

| Moment | Prompt | Marker |
|--------|--------|--------|
| Step → spawn task | `step_explore_kickoff` (micro) | `c4.micro_task_kickoff` |
| Explore OK | `post_merge_closure` (micro) | `c2.post_merge_closure` |
| Juste après | `runtime.micro_act_write` | `c4.micro_act_write` |
| Refresh card | — | `c4.situation_card` |

### Critère dogfood C4

Card ≤ 3 lignes corps ; Prefer micros courts en fin de contexte ; pas de protocole Explore dans la card.

---

## 13. Brief C5 — Explore synth brief (livré)

### Décisions

| Condition | Description dans le prompt synth |
|-----------|----------------------------------|
| Notes ≥ 200 chars **ou** ≥ 3 lignes activity | Brief **≤ 500** chars (tête) ; heading « short » |
| Sinon (évidence mince) | Jusqu’à **2 000** chars |
| Toujours | Strip blocs « Return contract / kinds / caps » déjà dans `contract_block` |
| Notes | Cap 6k (existant) ; activity cap ~2.5k (existant) |

### Code

| Site | Rôle |
|------|------|
| `subagent/report.rs` `prepare_synth_task_brief` | V5-d |
| `explore_executor::synthesize_parent_report` | Branche brief + marker |
| `explore.report_synthesis` | Prefer evidence over restating brief |

### Marqueur

| Marker | Signifie |
|--------|----------|
| `c5.synth_brief` | Brief préparé (`slimmed`, `brief_chars`, `notes_chars`, `activity_n`) |

### Critère dogfood E5 / C5

Synth JSON kinds non-stubs ; logs `c5.synth_brief slimmed=true` sur Explore avec notes riches ; parent merge via artefacts (C2) sans re-inventaire.

---

## Liens

- [PLAN-CONTEXT-SITUATION.md](PLAN-CONTEXT-SITUATION.md)  
- [PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md)  
- [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md)  
- [JOURNAL-PROMPTS-ET-HORS-WS.md](JOURNAL-PROMPTS-ET-HORS-WS.md)  
- `drox-prompts/docs/injection-map.md`
