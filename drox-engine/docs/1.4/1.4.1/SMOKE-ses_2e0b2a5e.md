# Smoke `ses_2e0b2a5e` — Problèmes relevés

**Version** : juin 2026 — branche `1.4.1`  
**Statut** : **analysé, non patché** — notes pour smoke post-1.4.1.2a puis [PLAN-1.4.1.2](PLAN-1.4.1.2.md)  
**Transcript** : [`chat_qwen27b.txt`](../../chat_qwen27b.txt) · export complet `site-kdds\.drox\exports\transcript-ses_2e0b2a5e-…-2026-06-13T21-03-52-689Z.txt`

> Brief identique au gate **R1c** (plan + mutation SVG scroll, site-kdds). Run **Qwen 2.7B** sur binaire **`1.4.0.340742`** — **sans** context diet 1.4.1.2a ni rebuild post-commit intent `2d72089`. À comparer au smoke R1c vert [`ses_31b9a209`](finalisation/CLOSURE-1.4.1.1.md) (Qwen 3.6:27b).  
> **Re-smoke post-1.4.1.2** (brief réparation fichier) : [`ses_4b2c1d08`](SMOKE-ses_4b2c1d08.md) — −70 % tokens, 8 min, partiel vert.

---

## Contexte du run

| Champ | Valeur |
|-------|--------|
| **Session** | `ses_2e0b2a5e-9c4d-4da5-bc46-cb3e35fba421` |
| **Workspace** | `site-kdds` (Next.js, brief animation SVG + sync scroll) |
| **Rôle** | `architect` (Edit) |
| **Build moteur** | `1.4.0.340742` (stamp Rust `#340742`) |
| **Durée observée** | ~49 min (dogfood) |
| **Tokens** | **86 074 in** / **603 out** / **61 435 ctx** |
| **Journal UI** | 7 931 événements · 267 steps structurés |
| **Transcript moteur** | 41 messages · 39 tool results |
| **Fin de run** | Pas de clôture — dernier outil : `file_edit` en erreur ; `busy: false` |

### Brief utilisateur (résumé)

Mutation explicite : moderniser l’animation SVG de transition scroll, synchroniser cartes/textes, thèmes espace / abysses / IDE / IA. **Pas** un brief « plan seulement » — implémentation demandée dès le premier message.

### Parcours rail observé

```text
INTENT → READ → PLAN → ACT ⟷ VERIFY (×6 bascules) — jamais ANSWER, jamais done
```

| Station | Atteinte | Note |
|---------|----------|------|
| INTENT | ✅ | `[gate: advance]` step ~11 |
| READ | ✅ | Exploration fichiers |
| PROPOSE | ⏭️ | Sautée (`depth: short`) |
| PLAN | ✅ | `todo_write` 4 tâches (t1–t4) |
| ACT | ✅ | Bloqué sur `section-transition.tsx` |
| VERIFY | ⚠️ | Entrées multiples sans clôture todos |
| ANSWER | ❌ | Jamais atteinte |

### Plan / todos fin de run

| ID | Libellé | Statut final |
|----|---------|--------------|
| **t1** | Rewrite `section-transition.tsx` | `in_progress` — spirale d’écriture |
| **t2** | Rewrite `home-content.tsx` | `pending` — jamais commencé |
| **t3** | Update `globals.css` | `pending` |
| **t4** | Enhance `animated-background.tsx` | `pending` |

---

## Verdict synthétique

| Critère gate | Résultat |
|--------------|----------|
| Boot Edit (pas de « light message ») | ✅ |
| Exploration READ | ✅ |
| Plan structuré (`todo_write`) | ✅ (après 1 blocage schéma) |
| Mutations livrables (t1–t4) | ❌ — bloqué t1, reste non fait |
| VERIFY puis ANSWER | ❌ |
| App fonctionnelle post-run | ❌ (fichier SVG probablement tronqué / invalide) |
| Tokens in mid-run | ❌ ~86k — pire que baseline `ses_3c6ec330` (~78k) |

**Cause dominante** : spirale **`file_write` / `file_edit`** sur un gros composant TSX — le modèle interprète à tort une « limite moteur » (~4 Ko) alors que les échecs viennent surtout de **JSON tool call tronqué** côté modèle. Le yo-yo **ACT↔VERIFY** et l’**absence de clôture** amplifient la durée et le bruit contexte.

---

## Backlog problèmes (liste complète)

| # | ID | Problème | Gravité | Plan cible | Patch maintenant ? |
|---|-----|----------|---------|------------|-------------------|
| 1 | **B-TOOL-01** | Spirale `file_write` — **13** appels sur le même path sans circuit breaker | P0 | 1.4.1.2 (nouveau) | ❌ après 2a |
| 2 | **B-TOOL-02** | Confusion modèle « quota / troncature moteur » vs JSON invalide | P0 | 1.4.1.2 · B-MOTOR-07 | ❌ |
| 3 | **B-RAIL-03** | Yo-yo **ACT↔VERIFY** (6 bascules) — bash en ACT realigné VERIFY avant exécution | P1 | 1.4.1.2 | ❌ |
| 4 | **B-CYCLE-01** | Rail linéaire : advance VERIFY alors que **t1 in_progress**, t2–t4 pending | P1 | [PLAN-1.4.1.2](PLAN-1.4.1.2.md) | ❌ |
| 5 | **B-MOTOR-06** | Run sans **ANSWER** ni `[phase: done]` malgré mutations partielles | P0 | 1.4.1.2 | ❌ |
| 6 | **B-MOTOR-01** | Thinking qui **resynthétise le plan** à chaque micro-avancée (« je relis… ») | P1 | 1.4.1.2a (partiel) + 1.4.1.2 | ⏳ 2a en cours |
| 7 | **B-CTX-02 / F** | **86k tokens in** — snapshots + protocoles + historique tool results | P0 | [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) | ⏳ code livré, smoke à refaire |
| 8 | **B-MOTOR-07** | Erreurs outil peu actionnables — modèle enchaîne sans changer de stratégie | P1 | 1.4.1.2 | ❌ |
| 9 | **B-MOTOR-08** | VERIFY entré **plusieurs fois** sans `verify_outcome` Pass ni retest utile | P1 | 1.4.1.2 | ❌ |
| 10 | **B-MOTOR-05** | `todo_write` bloqué une fois en PLAN (payload `{}` / legacy) | P2 | 1.4.1.2 | ❌ (récupéré au tour suivant) |
| 11 | **B-PROPOSE-01** | Auto `[gate: advance]` PLAN→ACT sans tour user (brief mutation directe — ambigu) | P2 | 1.4.1.2 | ❌ · à revalider sur brief « plan puis oui » |
| 12 | **B-RAIL-02** | Station PLAN sautée trop vite — pas de validation explicite type R1c | P2 | 1.4.1.2 | ❌ |
| 13 | **—** | `file_edit` : schéma invalide (`edits` vide / champs manquants) | P1 | B-MOTOR-07 | ❌ |
| 14 | **—** | Contournement **bash** / PowerShell pour écrire fichiers (6× bash, dont erreurs) | P2 | 1.4.1.2 + bash policy | ❌ |
| 15 | **—** | Livrable **tronqué** — écritures coupées mid-string (SVG path, JSX incomplet) | P0 | B-TOOL-01 + modèle | ❌ |
| 16 | **—** | Scope **1/4** du plan — seul t1 attaqué, run terminé en échec | P0 | B-CYCLE-01 | ❌ |

---

## Détail par problème

### 1 — Spirale `file_write` sur `section-transition.tsx` (B-TOOL-01)

**Symptôme** : 13× `file_write` ciblant `app-kdds-main/src/components/section-transition.tsx`, souvent consécutifs, avec thinking « le contenu est tronqué, je réessaie ».

**Chronologie type** :

1. **1er échec** (step ~1048) : JSON tool call invalide — `file_write: input requires string fields path and content` (champs absents, pas quota moteur).
2. **Écritures « OK »** suivantes mais fichier **syntaxiquement incomplet** (coupure mid-path SVG, mid-attribut `animate`).
3. Enchaînement **file_edit** (3 erreurs) + **bash** heredoc / PowerShell.

**Preuve transcript** : steps ~1048–2499 dans [`chat_qwen27b.txt`](../../chat_qwen27b.txt) — motif « ~4KB » dans le thinking du modèle, **non confirmé** comme limite côté moteur Drox.

**Piste patch (1.4.1.2)** : circuit breaker même path + N échecs ; nudge « split file / file_edit par morceaux / réduire taille » ; option chunk writer moteur.

---

### 2 — Confusion quota vs JSON modèle (B-TOOL-02)

**Symptôme** : le modèle attribue les échecs à une limite `file_write` moteur et boucle la même stratégie (réécriture intégrale).

**Lecture** : troncature visible dans **arguments du tool call** (stream LLM), pas message d’erreur quota du moteur Rust.

**Piste** : messages gate explicites ; doc protocole `file_write` EN ; détection répétition path en ACT.

---

### 3 — Yo-yo ACT↔VERIFY (B-RAIL-03)

**Symptôme** : bascules répétées sans cycle de qualité :

| Steps UI (approx.) | Transition |
|--------------------|------------|
| ~137–138 | ACT → VERIFY (t1 focus) |
| ~144–145 | VERIFY → ACT → VERIFY |
| ~230–231 | ACT → VERIFY |
| ~237–238 | VERIFY → ACT |
| ~244–245 | ACT → VERIFY |
| ~251–252 | VERIFY → ACT |

**Mécanisme suspect** : `infer.rs` aligne VERIFY **avant** exécution quand des outils « verify-class » (ex. bash) sont émis depuis ACT ; le modèle utilise bash pour **contourner** les échecs `file_write`.

**Piste** : distinguer bash « écriture fichier » vs bash « test » ; ne pas advance VERIFY si todo focus encore `in_progress`.

---

### 4 — Rail linéaire / scope incomplet (B-CYCLE-01)

**Symptôme** :

- Rail marque **ACT done** et entre VERIFY alors que **t1** reste `in_progress` et **t2–t4** `pending`.
- Aucun reopen PLAN/ACT pour finir le scope 4 fichiers.
- Pas de second cycle après découverte d’erreurs d’implémentation.

**Impact** : run perçu « terminé » côté rail alors que le brief n’est pas couvert.

---

### 5 — Pas de clôture ANSWER / done (B-MOTOR-06)

**Symptôme** : aucune station **ANSWER** ; pas de `[phase: done]` ; pas de **USER-FACING REPLY** finale.

**Fin** : `file_edit` — `old_string not found` sur un fichier déjà muté / tronqué plusieurs fois.

---

### 6 — Surcharge contexte (B-CTX-02 / famille F)

**Symptôme** :

| Métrique | `ses_2e0b2a5e` | Référence |
|----------|----------------|-----------|
| Tokens in | **86 074** | `ses_3c6ec330` ~78k · R1c `ses_31b9a209` ~116k |
| Ctx peak | **61 435** | Fenêtre saturée mid-run |

**Contributeurs probables** (build **340742**, pré-2a) :

- Snapshots architecte + rail **réinjectés** chaque tour (profil complet).
- **9 protocoles outil** au boot.
- Historique **`file_read`** lourd (`home-content.tsx` ~9,5 Ko relu).
- Thinking répétitif re-planifiant t1–t4.

**Action plan** : terminer [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) → re-smoke **G-diet-smoke** sur même brief.

---

### 7 — Thinking en boucle (B-MOTOR-01)

**Symptôme** : blocs thinking successifs re-listant le même plan (t1–t4), re-analysant `home-content.tsx` / `section-transition.tsx` avant chaque tentative d’écriture.

**Lien** : aggravé par snapshots identiques réinjectés (partiellement adressé en 2a).

---

### 8 — Erreurs outil / schéma (B-MOTOR-07)

| Outil | Erreur | Fréquence |
|-------|--------|-----------|
| `file_write` | `path` / `content` manquants | 1× |
| `file_edit` | `edits must not be empty` | 1× |
| `file_edit` | `path` + `edits` array requis | 2× |
| `file_edit` | `old_string not found` | 1× (fin) |
| `bash` | heredoc / shell (Windows) | ≥1× |
| `todo_write` | payload sans `todos` | 1× (PLAN) |

Le modèle **ne pivote pas** vers une stratégie fiable (fichier plus court, `file_edit` incrémental, découpage composant).

---

### 9 — VERIFY faible / répété (B-MOTOR-08)

**Symptôme** : entrées VERIFY multiples sans preuve de validation runtime (`npm run dev`, `tsc`, tests). Focus rail reste t1 en cours.

**Lien** : même famille que `ses_3c6ec330` (LSP-only / advance prématuré).

---

### 10 — Auto-advance PLAN→ACT (B-PROPOSE-01 / B-RAIL-02)

**Symptôme** : step ~78 — `[depth: short]` + `[gate: advance]` immédiatement après plan/todos, **sans** message user « Oui applique » (contrairement au R1c vert `ses_31b9a209`).

**Nuance** : le brief initial demande l’implémentation ; le modèle peut considérer le plan comme formality. **À distinguer** du pattern « Souhaites-tu que je procède ? » sans réponse user.

---

## Outils — comptage run

| Outil | Appels (approx.) | Cible principale |
|-------|------------------|------------------|
| `file_write` | **13** | `section-transition.tsx` |
| `file_edit` | 4 (1 OK, 3 erreurs) | même fichier |
| `bash` | **6** | contournement écriture / inspect |
| `file_read` / `grep` / `glob` | nombreux | phase READ + relectures |
| `todo_write` | 2+ | plan t1–t4 |
| `lsp` | non clôturant | — |

---

## Points positifs (ne pas régresser)

- Boot **Edit** sans fausse route Discuss / « light message ».
- Chaîne rail **INTENT → READ → PLAN → ACT** cohérente avec le brief mutation.
- Plan **todo_write** 4 tâches aligné sur le scope utilisateur (après correction payload).
- Le modèle **comprend** le brief créatif (couches SVG, sync scroll, thème abyssal).

---

## Ordre de traitement (aligné feuille de route)

```text
1. Clôturer PLAN-1.4.1.2a (context diet) + commit
2. Re-smoke R1c même brief → mesurer tokens / context_turn_metrics
3. PLAN-1.4.1.2 : B-TOOL-01/02, B-RAIL-03, B-CYCLE-01, B-MOTOR-06…08
4. Ne pas mélanger patch anti-spirale avant smoke 2a
```

---

## Liens

- [SMOKE-ses_4b2c1d08](SMOKE-ses_4b2c1d08.md) — re-smoke post-1.4.1.2 (comparaison)
- [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) — context diet
- [PLAN-1.4.1.2](PLAN-1.4.1.2.md) — rail / clôture / VERIFY
- [CLOSURE-1.4.1.1](finalisation/CLOSURE-1.4.1.1.md) — smoke R1c vert (`ses_31b9a209`)
- [README 1.4.1](README.md)
