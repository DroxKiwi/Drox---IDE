# Session — `ses_733093c6` (Qwen 3.6 27B · multi-runs · échec follow-up)

**Date** : 2026-06-16  
**Session** : `ses_733093c6-b23e-4fda-bd14-5c84595f27bd`  
**Modèle** : **Qwen 3.6 27B** (dogfood local)  
**Workspace** : `site-kdds`  
**Build** : `1.4.0.1781632229` · git `d0beafd` · `target/debug/drox.exe` *(pré-commit F4 `bed7e63`)*  
**Export** : `drox-engine/docs/chat_qwen27b.txt` (PARTIE A tronquée) · archive complète `site-kdds/.drox/exports/transcript-ses_733093c6-2026-06-16T18-35-46-682Z.txt` (~2 Mo)

---

## Verdict session

| Run | Message utilisateur | Durée (ordre de grandeur) | Mutation | `done` | Verdict |
|-----|-------------------|---------------------------|----------|--------|---------|
| **1** | Simplifier le SVG animé | ~3 min | ✅ `file_write` `animated-background.tsx` | ✅ | ✅ succès isolé |
| **2** | Texte hero invisible (1ʳᵉ section) | ~15–20 min | ⚠️ `file_edit` `globals.css` (mauvais diagnostic) | ✅ | ❌ **faux positif** |
| **3** | « Ton patch n'a pas marché » | 30+ min (boucle) | ❌ **0** | ✅ puis boucle | ❌ **échec** |

**Session cumulée** : **84 526** tokens in · **2 319** out · **4 050** events UI · **156** messages moteur persistés.

**Conclusion** : le smoke « Phase E vert » documenté dans [`SMOKE-ses_733093c6.md`](SMOKE-ses_733093c6.md) ne couvre que le **run 1**. La même session, enchaînée sur deux corrections UI, révèle des **régressions moteur + comportement modèle** non capturées par les critères R1–R7 actuels.

---

## Run 1 — succès (référence)

Voir [`SMOKE-ses_733093c6.md`](SMOKE-ses_733093c6.md).

Points notables même sur le run vert :

- `file_write` tenté **avant** `edit_file describe` → erreur folder, puis récupération (le passage READ→ACT a été débloqué « par accident » via cette tentative).
- R5 légèrement au-dessus du seuil (25 760 vs 25 000).

---

## Run 2 — faux positif (z-index)

### Demande

> La première section n'affiche pas le texte … tu peux régler cette erreur ?

### Chronologie (iter 0 → 24)

| Phase | Comportement |
|-------|--------------|
| **INTENT** | `internal_plan_write` OK (5 steps) |
| **iter 1** | `file_read` `page.tsx` **avant** `read_workspace describe` → erreur, rail INTENT→READ |
| **iter 2–10** | Boucle **READ** : `read_workspace describe`, `file_read` ×4 (`page.tsx`, `home-content.tsx`, `globals.css`…), `grep`, thinking massif (~15k tokens de raisonnement CSS stacking) |
| **iter 11** | Confusion de contexte : `edit_file describe` sur **`animated-background.tsx`** (tâche du run 1) → rail READ→**ACT** |
| **iter 12** | `file_edit` `globals.css` — ajout `position: relative; z-index: 2` sur `.scroll-snap-container` |
| **iter 13–23** | Vérifications en ACT (`grep`, `file_read`) sans corriger le vrai bug |
| **iter 24** | `[phase: answering]` + `[phase: done]` — annonce « c'est réparé » |

### Diagnostic réel (identifié au run 3)

Le texte hero est masqué par un **conflit d'animations** :

- CSS `.title-bio` et `.text-deep` : `animation: focus-deep …` démarre à `opacity: 0`
- Framer Motion sur les `<motion.span>` : blur/opacity avec délais (0.3s, 1.4s)
- Les deux se battent sur les mêmes propriétés → texte reste invisible

Le patch z-index du run 2 **ne corrige pas** ce problème.

---

## Run 3 — boucle catastrophique

### Demande

> Ton patch n'a pas fonctionné … le titre Drox IDE et le sous-titre n'apparaissent toujours pas.

### Contexte de départ

- **~34 587** tokens ctx au iter 0 (historique des runs 1+2)
- `mutation_count` session déjà ≥ 1 (à cause du `file_edit` run 2)
- Compaction active (`ctx boot` ~5 762 bytes vs ~913 au run 1)

### Chronologie (iter 0 → 39+)

| Phase | Comportement |
|-------|--------------|
| **iter 0–11** | Re-exploration READ : `home-content.tsx`, `globals.css`, grep `focus-deep` / `SectionTransition` |
| **iter ~9–10** | **Bonne cause** identifiée (`focus-deep` vs framer-motion) — plan L2 mis à jour (s4 in_progress sur `globals.css`) |
| **iter ~28–29** | Longue réponse markdown avec **instructions manuelles** (retirer `focus-deep` de `.title-bio` et `.text-deep`) puis `[phase: done]` — **sans `file_edit`** |
| **Post-`done`** | Moteur repart en **READ** (« aucun outil sur cette requête ») |
| **iter 30–39+** | Boucle : re-`file_read` `globals.css`, thinking « je n'ai pas `file_edit` », hésitation sur `[phase: answering]`, répétition des mêmes explications |

### Symptômes observés

1. **Paralysie READ** — 10+ tours READ-only alors que le plan marque l'étape « fix » in_progress ; jamais de passage ACT spontané (contrairement au run 1 où un `file_write` prématuré avait forcé ACT).
2. **`done` sans mutation sur le run courant** — gate `done.missing_mutation` **non déclenchée** car `mutation_count` est **session-scoped** (run 2 avait déjà muté).
3. **Hallucination d'outils** — après compaction, le modèle affirme ne pas avoir `file_write` / `file_edit` alors que le rail ACT les expose.
4. **Boucle de phases** — thinking répétitif sur quand émettre `[phase: answering]` / `[phase: done]` sans exécuter le patch.
5. **Coût** — explosion tokens (session 84k+ in) pour **zéro correction** du bug réel.

---

## Causes racines (hypothèses classées)

### Moteur (P0)

| ID | Cause | Preuve |
|----|-------|--------|
| **M1** | Gate `done` comptait les mutations via `MemoryTracker` sans vérifier le **dernier message user** dans l'historique | Run 3 : `done` advisory accepté si mutation d'un run précédent encore dans le transcript |
| **M2** | Pas de nudge **READ stall** quand `mutation_expected` + plan step fix in_progress | Run 2 iter 0–10 et run 3 iter 0–11 bloqués en READ |
| **M3** | Gate `done` ne vérifie pas « mutation **depuis le dernier user** » | Faux positif run 2 + run 3 advisory |
| **M4** | Post-compaction : perte de visibilité outils ACT / protocoles edit | Thinking « read-only session » run 3 |

### Modèle Qwen 3.6 27B (P1)

| ID | Cause | Preuve |
|----|-------|--------|
| **Q1** | Sur-analyse en thinking au lieu d'agir (`[gate: advance]` ou `edit_file`) | Milliers de tokens CSS stacking run 2 |
| **Q2** | Répond en instructions manuelles plutôt qu'en `file_edit` | Run 3 patch markdown + `done` |
| **Q3** | Confusion de contexte inter-runs | `edit_file` sur `animated-background.tsx` au run 2 |
| **Q4** | Non-respect discipline folders (moins grave après F4) | `file_read` avant `read_workspace describe` run 2 iter 1 |

### Protocole dogfood (P2)

| ID | Cause |
|----|-------|
| **D1** | Smoke Phase E = **1 run isolé** dans une session déjà « chaude » — ne valide pas le multi-tours |
| **D2** | Modèle documenté « Qwen 27B » sans version **3.6** explicite |

---

## Impact sur la clôture 1.4.1.3

| Élément | Statut révisé |
|---------|---------------|
| Code A–C, F1–F4, IDE stamp/layout | ✅ livré (`bed7e63`) |
| Smoke run 1 seul | ✅ protocole folders OK sur tâche simple |
| **Phase E « session réelle »** | ❌ **non validé** — multi-tours Qwen 3.6 27B |
| Clôture [`CLOSURE-1.4.1.3.md`](finalisation/CLOSURE-1.4.1.3.md) | ⚠️ **partielle** — voir section sign-off révisée |

---

## Options de correction (à discuter)

### A — Gate `done` : mutations depuis le dernier user ✅ implémenté

- `successful_mutation_count_since_user(messages)` — paire `ToolUse` / `ToolResult` non-erreur.
- `done_gate_missing_mutation_when_expected` s'appuie sur ce compteur (pas le tracker session).
- Prompt enrichi : instructions markdown ≠ mutation.

### B — Nudge READ stall (sans forcer ACT) ✅ implémenté

- Seuil **6** tours read-only par défaut, **4** si step plan « fix » in_progress.
- Nudge `rail.read_stall` : suggère `[gate: advance]` ou `edit_file describe` — pas d'auto-advance engine.

### C — Moteur : refuser `done` advisory sur edit runs

- Si `mutation_expected` et dernier user message demande une correction → exiger ≥1 mutation **sur ce run** avant `done`, sauf réponse explicite « déjà conforme » avec preuve (`file_read` + diff absent).
- **Effort** : moyen · **complète A**.

### D — Compaction / contexte multi-runs

- Après compaction, réinjecter snapshot outils ACT + rappel « tu es sur un run edit, `file_edit` disponible ».
- Limiter l'historique thinking dans le contexte (déjà partiel F2).
- **Effort** : moyen–élevé · **impact** : hallucination outils run 3.

### E — Protocole dogfood

- **1 scénario = 1 session fraîche** (ou reset chat entre runs).
- Modèle figé : **Qwen 3.6 27B**.
- Critères R8+ : pas de `done` sans mutation sur le run courant ; pas de boucle > 15 iters sans ACT sur edit brief.
- **Effort** : doc + discipline · **impact** : mesure fiable sans attendre tous les fixes moteur.

### F — Prompt / plan L2

- Quand step s4 = « Fix … » avec `paths` → hint rail « exploration terminée, advance ACT ».
- Interdire clôture avec instructions manuelles si `file_edit` est dans les specs du tour.
- **Effort** : faible · **impact** : incertain seul (Qwen peut ignorer).

### Recommandation initiale (ordre)

1. ~~**A** (mutation par user)~~ ✅ livré
2. ~~**B** (READ stall nudge)~~ ✅ livré
3. **E** (dogfood protocol) — en parallèle pour ne plus se faire piéger
4. **D** — si la boucle post-compaction persiste

---

## Fichiers / commits liés

| Réf | Description |
|-----|-------------|
| `d0beafd` | Build du smoke (pré-F4) |
| `bed7e63` | F4 tool folders × rail + docs closure (post run 1, **avant** découverte multi-run) |
| [`SMOKE-ses_733093c6.md`](SMOKE-ses_733093c6.md) | Run 1 seul |
| [`SMOKE-ses_3948a285.md`](SMOKE-ses_3948a285.md) | Deadlock folders (pré-F4) |

---

## Prochaine validation suggérée

1. Rebuild `bed7e63+`.
2. **Session fraîche** · Qwen **3.6 27B** · scénario unique : « le texte hero ne s'affiche pas, corrige ».
3. Succès = `file_edit` ou `file_write` sur `globals.css` (retrait `focus-deep`) + LSP 0 + `done` + tokens in &lt; 30k.
4. Puis scénario **multi-tours volontaire** (run 1 SVG + run 2 hero) pour valider A/B une fois implémentés.
