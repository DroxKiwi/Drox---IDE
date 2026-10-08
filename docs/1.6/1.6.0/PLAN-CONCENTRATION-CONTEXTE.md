# Plan — Concentration modèle & pertinence face aux règles (volume / ordre)

**Statut** : ambition documentée (2026-10-08) · **pas encore codé** comme lot dédié  
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
| V1-a | **Spill / stub** des gros tool results hors fenêtre chaude (path + extrait + pointeur) | Mécanique curation | 🟡 Vague 4 / spill existant — **durcir seuils & couverture** | Levier n°1 volume |
| V1-b | **Plafond de corps** tool_result par défaut (grep/file_read) : résumé + invitation artefact / re-read borné | Tool UX | ⬜ | Compatible Prefer soft |
| V1-c | Compteur / Prefer « trop de lectures parent cette fenêtre » (étendre S5 / rotating) | Soft B | 🟡 | Déjà `rotating_file_read` + S5 |
| V1-d | Ne **pas** renvoyer le transcript tool complet dans les nudges | Hygiene B | 🟡 à auditer | |

**Critère de succès V1** : après un run doc typique, tokens in / taille transcript nettement plus bas à mission équivalente ; règles CORE encore « proches » de la génération (pas enfouies sous 100k de md).

---

### V2 — Parent merge-only après Explore

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V2-a | Artefacts Explore **utiles** (JSON / incomplete honnête) | Contrats | ✅ P-safe/P-json/P-harden | Prérequis |
| V2-b | Prefer post-merge : fusionner via blurb / `explore_artifact_read`, **pas** re-`file_read` sources | Soft B | ✅ `post_merge_closure` | Dogfood E5 à revalider |
| V2-c | Prefer renforcé si `kinds_incomplete` vide **et** parent relit les mêmes paths que l’Explore | Soft B | ⬜ | Éviter hard abort |
| V2-d | Tool_result `task` : summary/blurb **courts** ; jamais coller `conclusion.md` entier dans le chat | C / outcome | 🟡 | Auditer taille `report` dans outcome |
| V2-e | UI : afficher kinds incomplets (déjà tags) pour que l’humain voie le trou | UI | ✅ E4b | |

**Critère de succès V2** : après Explore OK, ≤ 1–2 `file_read` parent hors artefacts ; 0 spirale layout/sidebar.

---

### V3 — Blob A (system toujours-on)

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V3-a | **CORE mince** : pointer vers supplements ; retirer redites | Prompts A | 🟡 Vague 4 / curation | Continuer |
| V3-b | Listings skills / archives / map → **index 1 ligne** + tools list/read | A → C | ⬜ | Gros gain milieu de blob |
| V3-c | Rules IDE : injecter **résumé / règles scorées**, détail via tool ou fichier opt-in | A / IDE | ⬜ | |
| V3-d | Supplements (Explore, hors-WS, professor, thinking) **uniquement si flag run** | A | 🟡 partiel | Aller au bout |
| V3-e | Mesurer taille blob A (obs) par composant | OBS | ⬜ | Pour prioriser |

**Critère de succès V3** : taille blob A médiane ↓ ; aucun listing multi-ko collé si non utilisé dans le run.

---

### V4 — Situation card & « haut du bas »

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V4-a | Card = **jauge + next step + 1 contrainte** (budget lignes strict) | B | 🟡 existe — **borner** | |
| V4-b | Ne pas dupliquer le protocole Explore dans la card | Hygiene | ⬜ audit | |
| V4-c | Snip / hot window déjà Vague 4 — s’assurer que la card ne **réinjecte** pas l’historique tools | B | 🟡 | |

**Critère de succès V4** : card &lt; N lignes stables ; nudges Prefer restent les derniers messages system avant génération.

---

### V5 — Explore enfant (exec + rapport)

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V5-a | Phase rapport : JSON + refuse soft-OK + notes filtrées | E | ✅ P-harden | Dogfood à rejouer |
| V5-b | `executionThink` défaut off | Settings | ✅ | Granularité modèle/temp = suite |
| V5-c | Budget tools Explore / thoroughness (déjà) — éviter lecture fichier entier | E | 🟡 | Caps `return_options` |
| V5-d | Ne pas recoller **toute** la description parent au synth si notes + activity suffisent | E | ⬜ | Réduit concurrence « JSON only » |
| V5-e | Activity synth plafonnée (déjà ~2.5k) — idem notes | E | ✅ / 🟡 | |

**Critère de succès V5** : kinds non-stubs ; parent n’a pas besoin de re-inventorier via `bash dir`.

---

### V6 — Rappels d’acte (récence des règles)

| # | Solution applicable | Type | Statut | Notes |
|---|---------------------|------|--------|-------|
| V6-a | Micro-rappel **2–4 lignes** juste avant actes critiques (spawn `task`, acting write, rapport déjà OK) | Soft B | ⬜ | Pas de pavé |
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
| **C1** | Durcir spill/stub tool results parent (V1-a/b) | — | P0 |
| **C2** | Merge-only : auditer taille outcome `task` + Prefer V2-c si besoin | V2-a ✅ | P0 |
| **C3** | Amincir blob A : listings → pointeurs (V3-b/d) | mesure V3-e optionnelle | P1 |
| **C4** | Borner situation card (V4-a) + micro-rappels V6-a | — | P1 |
| **C5** | Explore synth : description allégée V5-d + dogfood E5 | P-harden ✅ | P1 |
| **C6** | Granularité modèle Explore (temp / model override) | settings think ✅ | P2 |

Règle : un lot = un brief validé ; Prefer soft avant hard.

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

1. Relire cette fiche ; cocher les solutions **retenues** pour C1.  
2. Brief C1 (seuils spill, quels tools, format stub).  
3. Dogfood E5 en parallèle dès que le binaire P-harden est en main (ne bloque pas C1).

---

## Liens

- [PLAN-CONTEXT-SITUATION.md](PLAN-CONTEXT-SITUATION.md)  
- [PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md)  
- [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md)  
- [JOURNAL-PROMPTS-ET-HORS-WS.md](JOURNAL-PROMPTS-ET-HORS-WS.md)  
- `drox-prompts/docs/injection-map.md`
