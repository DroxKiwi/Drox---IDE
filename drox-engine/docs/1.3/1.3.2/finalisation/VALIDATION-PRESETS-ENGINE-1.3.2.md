# Validation presets & paramètres moteur — clôture 1.3.2

**But** : après le refacto « simplifier + fiabiliser », vérifier que les **réglages exposés à l’utilisateur** (presets `EngineTuning` + panneau Réglages généraux) restent **pertinents**, **compréhensibles** et **efficaces** — pas des reliquats du gate chain / workflow imposé.

**Quand** : pendant la phase dogfood fiabilité (complément de [TEST-PLAN-1.3.2.md](TEST-PLAN-1.3.2.md)).

**Références code** :

- Presets : `drox-engine/drox/crates/drox-engine/src/orchestration/tuning/mod.rs`
- IDE : `drox.engine.strictness`, `drox.engine.tuning.*` — `droxEngineTuningConfiguration.ts`, panneau ⚙ webview
- Registre historique : [10-parametrage-prompts-strictesse.md](../../feature-brainstorm/10-parametrage-prompts-strictesse.md)

---

## Contexte post-refacto

| Avant 1.3.2 | Après recentrage |
|-------------|------------------|
| Gate chain TOML, paliers `E-*`, backpack | Routage RPC direct, prompts `01_core` |
| Gates workflow (map, plan, verify…) | Gates **structurelles** + nudges (architecte libre) |
| Seuils calibrés pour empêcher le modèle | Seuils = **guidance** ; l’utilisateur choisit un **tempérament** |

**Risque** : des champs `drox.engine.tuning.*` décrivent encore un comportement qui n’est plus bloqué (ex. « reads before delegate » présenté comme quota dur alors que seul un nudge reste).

---

## Matrice presets (valeurs moteur — à ne pas confondre avec défauts VS Code)

| Champ (impact utilisateur) | relaxed | **normal** (défaut) | strict |
|----------------------------|---------|---------------------|--------|
| `read_budget_percent` | 85 | 70 | 45 |
| `max_reads_before_delegate` | 24 | 16 | 6 |
| `max_mutations_before_delegate_nudge` | 5 | 3 | 1 |
| `discussion_promotable_min_chars` | 6 | 8 | 20 |
| `discussion_auto_stop_on_reply` | true | true | true |
| `discussion_max_iterations` | 20 | 20 | 15 |
| `loop_strikes_before_abort` | 5 | 4 | 2 |
| `max_tools_per_turn_discussion` | 30 | 25 | 20 |
| `promotable_answer_min_chars` | 40 | 60 | 150 |
| `gate_done_requires_answering` | true | true | true |
| `gate_todo_stale_before_done` | true | true | true |

Mode **`custom`** : base = **normal** + surcharges `drox.engine.tuning.*` (ignorées si preset ≠ custom).

---

## Checklist pertinence (doc + produit)

Pour chaque paramètre exposé IDE, cocher après relecture :

| # | Question | OK ? |
|---|----------|------|
| P1 | La **description** dans Paramètres Drox correspond-elle au **comportement réel** post-refacto (nudge vs blocage) ? | ☐ |
| P2 | Le **défaut `normal`** produit un « Salut » **sans boucle** ni outils inutiles ? | ☐ |
| P3 | **`relaxed`** améliore vraiment les messages légers sans ouvrir l’exploration abusive ? | ☐ |
| P4 | **`strict`** reste utilisable (pas de frustration systématique sur petits messages) ? | ☐ |
| P5 | Les champs **custom** listés dans le panneau ⚙ sont ceux qu’un power user doit encore toucher — pas 30 reliquats ? | ☐ |
| P6 | Les réglages **hors EngineTuning** (`drox.maxIterations`, `drox.permissionMode`, modèles Architect/Executor) restent cohérents avec les presets ? | ☐ |
| P7 | Export `chat.txt` + journal moteur permettent de **attribuer** un comportement anormal au bon paramètre ? | ☐ |

**Livrable doc** : mettre à jour les descriptions IDE ou le registre brainstorm §10 pour tout écart P1.

---

## Scénarios de test presets (P8–P12)

Même workspace, même modèle, **rebuild `drox.exe`**, Reload Window entre chaque preset.

| # | Preset | Message / action | Attendu | Observé |
|---|--------|------------------|---------|---------|
| P8 | **normal** | « Salut » (Auto) | Réponse courte, thinking replié, bulle finale propre, ≤1–2 tours | ☐ |
| P9 | **relaxed** | « Salut » | Idem ou plus permissif ; pas de nudges en rafale | ☐ |
| P10 | **strict** | « Salut » | Réponse OK ; pas de boucle >3 tours pour un salut | ☐ |
| P11 | **normal** | Tâche edit simple (ex. commentaire dans un fichier) | Architecte peut agir directement ; pas de nudge délégation sur 1 seul `file_edit` | ☐ |
| P13 | **strict** | Tâche multi-fichiers | Nudge délégation plus tôt (reads≤6, mutations≤1) sans bloquer l’edit direct trivial | ☐ |
| P12 | **custom** | `discussion_promotable_min_chars: 4` + « Salut » | Clôture discussion au moins aussi facile que relaxed | ☐ |

---

## Paramètres à réévaluer en priorité (post-refacto)

Ces champs ont le plus d’impact sur la **fiabilité perçue** ; les vérifier en premier :

| Paramètre | Pourquoi |
|-----------|----------|
| `discussion_promotable_min_chars` | Clôture run discussion / `userFacingReply` — lié au bug « Salut » |
| `discussion_auto_stop_on_reply` | Stop automatique après réponse canonique |
| `discussion_max_iterations` | Plafond boucles sur message léger |
| `loop_strikes_before_abort` | Anti-boucle modèle |
| `max_tools_per_turn_discussion` | Limite outils sur `architect_discussion` |
| `promotable_answer_min_chars` | Seuil réponse « suffisante » avant `[phase: done]` |
| `read_budget_percent` | Texte prompt discussion seulement — pas confondre avec quota outils |
| `max_reads_before_delegate` | Nudge soft post-refacto — branché (`architect_delegate_cap_nudge`) |
| `max_mutations_before_delegate_nudge` | Nudge après edits directs — **strict=1** pour petits modèles |
| `gate_done_requires_answering` | Toujours voulu avec flux thinking/réponse ? |
| `gate_todo_stale_before_done` | Toujours voulu avec architecte libre ? |

**Décision attendue** : pour chaque ligne — *garder tel quel* | *ajuster preset* | *retirer de l’UI custom* | *documenter comme nudge only*.

---

## Procédure rapide (session dogfood)

1. Paramètres → **Engine strictness** = `normal` (ou panneau ⚙ webview).
2. Exécuter T1–T4 du [TEST-PLAN](TEST-PLAN-1.3.2.md).
3. Exporter journal UI → vérifier absence `GATE ·` et bulle finale.
4. Répéter P8–P10 avec `relaxed` / `strict`.
5. Noter dans ce fichier (colonne Observé) ou dans `JOURNAL-1.3.2.md`.
6. Si écart : issue ou entrée registre [10-parametrage](../../feature-brainstorm/10-parametrage-prompts-strictesse.md).

---

## Critère « presets 1.3.2 OK »

- [ ] P1–P7 passés (descriptions alignées ou corrigées)
- [ ] P8–P10 passés sur binaire frais
- [ ] Aucun paramètre IDE **trompeur** (promet un blocage workflow supprimé)
- [ ] Défaut produit confirmé : **`normal`**, pas `relaxed` ni `strict`

---

## Liens

- [TEST-PLAN-1.3.2.md](TEST-PLAN-1.3.2.md)
- [CLOSURE-1.3.2.md](CLOSURE-1.3.2.md)
- [PLAN-PROMPTS-ADDITIFS §9](../PLAN-PROMPTS-ADDITIFS-1.3.2.md)
