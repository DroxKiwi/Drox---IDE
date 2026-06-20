# Smoke 1.4.2 — `ses_7b34fd1d` (north-mini, post-culture unique)

**Version** : juin 2026 — chantier **1.4.2**  
**Statut** : **analysé (pré-Phase M)** — correctifs M livrés · **rejeu dogfood requis** ([SMOKE-M-memory-TEMPLATE](SMOKE-M-memory-TEMPLATE.md))  
**Export** : [`chat_north-mini-code`](../chat_north-mini-code) (4 927 lignes · session du 2026-06-19)  
**Plan** : [PLAN-1.4.2.md](PLAN-1.4.2.md) · comparer [SMOKE F1](../1.5/1.5.1/SMOKE-ses_7df5045c.md)

> **Règle de chantier** : ce document **ne déclenche pas** de correctif immédiat. Les items ci-dessous alimentent la **backlog post-plan** (couche 4, compaction, grep scope, closure).

---

## Contexte

| Champ | Valeur |
|-------|--------|
| **Session** | `ses_7b34fd1d-4a3b-4dd0-bcf4-8742c7486d57` |
| **Workspace** | `c:\Users\coren\Desktop\GitHub\site-kdds` |
| **Build** | `1.4.1.1781852583` · git `f82e92f8f3b` · `drox.exe` debug (2026-06-19T07:03Z) |
| **Tours utilisateur** | **3** (salut · analyse repo · moderniser background) |
| **Tokens session (fin)** | **29 044 in** / **5 465 out** / **9 740 ctx** (jauge finale) |
| **Journal UI** | 728 événements · 169 steps structurés |
| **Transcript moteur** | 27 messages · 10 tool results |

### Briefs

| Run | Message (abrégé) |
|-----|------------------|
| 1 | « Salut ! » |
| 2 | « Tu peux analyser le répertoire de code ? » |
| 3 | « … background animé … moche … moderniser en repartant de zéro … » |

### Verdict synthétique

| Run | Routage | Livraison | Verdict |
|-----|---------|-----------|---------|
| **1** | `discuss_reply_only` | USER-FACING REPLY · `busy: false` | ✅ OK (fuite thinking mineure) |
| **2** | `discuss_with_reads` | USER-FACING REPLY · `busy: false` | ✅ **F1 toujours OK** |
| **3** | `edit` · mutation true | Pas de mutation disque · pas de USER-FACING REPLY · fil perdu après compaction | ❌ **ÉCHEC** |

**Culture 1.4.2 observée (positif)** : palette plate (~26 tools iter 0 run 3), **0×** `read_workspace` / `edit_file` / describe, `toolProtocolBytes` ≈ **4 011** stable, rail observateur (stations intent→read→act).

---

## Problème principal — explosion contexte + perte de fil (run 3)

### Chronologie (PARTIE A, steps ~95–114)

| Step | Événement | `tokensUsed` |
|------|-----------|--------------|
| 97 | Fin tool `grep` « AnimatedBackground » | **12 687** |
| 99 | Immédiatement après résultat grep | **315 965** |
| 100–102 | Compaction proactive #1 | **303 532** (`19 message(s) summarized`) |
| 104 | `llm_turn` iter **5** — **4 messages** seulement | **303 682** |
| 106 | Thinking : cite session **`ses_a41916…`**, fix « black flash », `home-content.tsx` | — |
| 110–112 | Compaction proactive #2 | **1 597** (`1 message(s) summarized`) |
| 114 | `llm_turn` iter **6** — modèle **relit** la demande user en français | **1 608** |

### Cause racine probable (P0)

Le `grep` a indexé des exports transcript sous **`.drox/exports/`** :

```text
path: …\site-kdds\.drox\exports\transcript-ses_4792b6b9-….txt
```

Chaque match embarque des **lignes JSON énormes** (contenu README, historiques de sessions passées). Sur une tâche ciblée (2 fichiers background), le contexte passe de **~13k → ~316k tokens** en un seul tool result.

### Effet compaction (P0)

1. **Première passe** : réduction marginale (**312k → 303k**) — le run reste ingérable.
2. **Deuxième passe** : chute brutale (**304k → 1,6k**) — le modèle **perd le fil** :
   - confond avec une **ancienne session** (black flash / `AnimatedBackground` fade-out) ;
   - ré-explore (`workspace_map_read`) comme si le brief n’avait pas été traité ;
   - `bootSystemBytes` remonte à **6 864** (vs **913** avant explosion).

### Symptômes post-compaction (P1)

| Symptôme | Preuve export |
|----------|----------------|
| Narratif hors-sujet | Step 106 : `ses_a41916-ba-bf7a…`, « black flash », `home-content.tsx` |
| Pas de mutation réelle | 10 tool calls · **0 erreurs** · **aucun** `file_write` / `file_edit` structuré exécuté |
| Faux travail dans le stream | Steps ~150–177 : dump CSS/TSX dans ASSISTANT STREAM avec `opacity: [object Object]` |
| Pas de réponse canonique | **Aucun** step `USER-FACING REPLY` pour run 3 (contrairement runs 1–2) |
| Clôture ambiguë | `phase: answering` · `busy: false` · `schema_error_continue_count: 4` |

---

## Runs 1–2 (régression F1)

Non régressés par rapport au smoke F1 [`ses_7df5045c`](../1.5/1.5.1/SMOKE-ses_7df5045c.md) :

- Run 1 : `discuss_reply_only`, 1 iter, pas d’outils.
- Run 2 : `discuss_with_reads`, exploration légère, réponse structurée livrée.

---

## Métriques run 3 (diagnostic fin PARTIE A)

| Métrique | Valeur |
|----------|--------|
| LLM iterations | **11** |
| Tool calls (UI) | **10** |
| Tool errors | **0** |
| `schema_error_continue_count` | **4** |
| Phase finale | `answering` |
| Pic contexte observé | **~316k** tokens (step 99) |
| `toolProtocolBytes` (stable) | **4 011** |
| `architectSnapshotBytes` (iter 0) | **539** |

---

## Backlog correctifs (à traiter **après** fin plan 1.4.2)

> Ne pas implémenter maintenant — mapping vers phases plan.

| ID | Sévérité | Sujet | Piste plan / composant |
|----|----------|-------|-------------------------|
| **S-CTX-01** | **P0** | `grep` ingère `.drox/exports/` | **M.8 livré** — valider M9-4 au dogfood |
| **S-CTX-02** | **P0** | Compaction proactive inefficace quand 1 tool result = quasi tout le contexte | Seuils `num_ctx` · Phase 5.1 · `CompactionConfig` |
| **S-CTX-03** | **P0** | Après compaction, ancre user/objectif insuffisante | **M.5b livré** — valider M9-1…M9-3 au dogfood |
| **S-EDIT-01** | P1 | Dump code dans content sans `tool_calls` (`[object Object]`, pas de `file_write`) | Closure + nudges · Phase 4.1–4.2 |
| **S-EDIT-02** | P1 | Pas de `USER-FACING REPLY` malgré `phase: answering` | `architect_gate` / promotion texte · Phase 4.2 |
| **S-EDIT-03** | P2 | `schema_error_continue_count: 4` (> plafond cible 3) | Vérifier escalade 4.3 en conditions réelles |
| **S-UI-01** | P2 | Fuite thinking run 1 (`Thus I will…`) | 1.5.1 |

---

## Critères acceptation 1.4.2 — état après ce smoke

| Critère | Résultat |
|---------|----------|
| A.1 Culture unique (pas de folders API) | ✅ |
| A.2 Run analyse vs F1 | ✅ |
| A.3 Run mutation sans `read_workspace` | ✅ (pas d’erreur folder) |
| A.4 `file_edit` / mutation OK | ❌ aucune mutation |
| A.5 `schema_error_continue` ≤ 3 | ❌ (4) |
| A.6 Timeline rail cohérente | ⚠️ partiel (intent→read→act mais fil cognitif cassé) |
| A.8 Dogfood 3-tours + ce rapport | ⚠️ **rapport fait** · gate **non vert** |

---

## Prochaine action (process)

1. **Continuer** [PLAN-1.4.2](PLAN-1.4.2.md) phases restantes (4.1–4.2, 4.4, 5.x doc).
2. **En fin de chantier** : traiter backlog **S-CTX-*** en priorité (bloquant toute tâche EDIT réelle sur repo avec exports `.drox/`).
3. **Re-smoke** même session 3-tours après correctifs compaction/scope.

---

## Liens

- [PLAN-1.4.2](PLAN-1.4.2.md)
- [Export brut](../chat_north-mini-code)
- [Smoke F1 (référence routage)](../1.5/1.5.1/SMOKE-ses_7df5045c.md)
