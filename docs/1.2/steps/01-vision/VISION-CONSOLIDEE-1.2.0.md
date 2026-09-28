# Vision consolidée — Drox 1.2.0

**Date** : 2026-05-26  
**Statut** : document actif — remplace la partie vision de tous les autres docs 1.2.0 (qui restent valides pour leur périmètre technique).  
**Intègre** : retour terrain `chat1`, corrections qualité architecte, clarifications produit.

---

## 0. Ordre via dossiers

L’ordre de lecture est désormais matérialisé via les dossiers numérotés dans `steps/` (sans index fichier global).

### Ce qui a changé depuis mai 2026-05-20

- Retour terrain `chat1` (site-kdds) : l'architecte compensait les échecs exécuteur — problème structurel.
- Suppression de la limite `max_todo_items` (relique Low/Medium).
- Nettoyage warnings Rust (`is_low_profile = false`, imports morts, nudges Low inutilisés).
- Clarification : **l'architecte est un PM, pas un exécutant de secours**.
- **Chef d'orchestre décisionnel** : plan détaillé + briefs d'exécution précis (pas seulement des titres de tâches).

---

## 1. Axiomes produit (non négociables)

Ces trois axiomes remplacent l'axe Low/Medium et guident toutes les décisions d'implémentation.

### Axiome 1 — Séparation stricte des responsabilités

> **L'architecte planifie et délègue. Il ne fait jamais le travail de l'exécuteur.**

| Rôle | Autorisé | Interdit |
|------|----------|----------|
| **Architecte** | `workspace_map_read` (1× par run), `todo_write`, `delegate_executor`, 1 verify read-only ciblé par tâche, synthèse `[phase: answering]` | Chaînes glob/grep/file_read, correction d'échec exécuteur, re-découverte du repo après délégation |
| **Exécuteur** | Tout le travail dans le `scope` | Questions utilisateur sauf `blocked`, glob sur `node_modules`/`.next`, rapport sans template |

Le moteur **bloque** toute dérive architecte (gates) — le prompt seul ne suffit pas.

### Axiome 2 — Économie de contexte par rôle

> **Chaque rôle voit le minimum nécessaire à sa mission.**

L'architecte reçoit :
- La carte workspace (une fois, résumée).
- Le plan todo (états).
- Le **rapport extrait** de l'exécuteur (template uniquement, pas le stream complet).
- Le statut `completed` / `partial` / `failed`.

Il ne reçoit **pas** le monologue de 11 tours de l'exécuteur.

### Axiome 3 — Statut honnête du travail exécuteur

> **`completed` signifie que le livrable est atteint, pas que des outils ont tourné.**

| Statut | Condition |
|--------|-----------|
| `completed` | Rapport contient `## Executor report` + `**Deliverable check:** met` |
| `partial` | Outils OK mais livrable non confirmé / pas de template / hit_max |
| `failed` | Erreur moteur sans aucun outil utile |

Conséquence UI : badges distincts visibles sur la carte exécuteur.

### Axiome 4 — Pré-mâcher le travail (briefs opérationnels)

> **L'architecte décide *comment* le travail sera fait ; l'exécuteur l'exécute sans re-planifier.**

Ce n'est pas un simple « titre + périmètre ». Pour chaque `delegate_executor`, l'architecte fournit un **paquet d'instructions net** :

| Champ | Rôle |
|-------|------|
| `todo_write` · `content` | Plan **détaillé** visible utilisateur — étapes compréhensibles, pas « Analyser le projet » seul |
| `description` | Action concrète en une phrase |
| `deliverable` | Critère de fin vérifiable |
| `instructions` | **Cœur du brief** : fichiers, règles, imports existants, contraintes UI, liens de pages, commandes attendues |
| `scope` | Chemins workspace (verbatim depuis la carte) |

**Exemples de briefs valides** (niveau de précision attendu) :

- « Modifie `app-kdds-main/src/components/Header.tsx` : ajoute un bouton « Contact » label FR, couleur `primary` du thème shadcn, à droite du logo. La page cible est `/contact` — utilise le `Link` Next existant comme sur `Hero.tsx`. »
- « Crée `proxy.ts` à la racine de `app-kdds-main/`. Réutilise la config CORS déjà dans `next.config.ts` ; importe les helpers depuis `lib/http.ts`. Règle : toutes les requêtes `/api/*` passent par ce proxy en dev. »
- « Lis `package.json` et `next.config.ts` sous `app-kdds-main/`, résume stack + scripts npm — pas de mutation. »

**Exemples à éviter** :

- « Analyser la stack » (trop vague — l'exécuteur devine les chemins).
- « Améliorer le header » (pas de fichier, pas de critère de done).

**Pourquoi cette précision (même si ça « coûte » du contexte architecte) ?**

| Question | Réponse |
|----------|---------|
| L'architecte ne ferait-il pas tout seul plus vite ? | Parfois oui sur une tâche — mais ce n'est **pas** le modèle cible. |
| Alors pourquoi déléguer ? | **Montée en charge** : aujourd'hui **1** exécuteur sync ; demain **2**, puis **4** sur des modèles **encore plus petits**. Un petit modèle n'invente pas le plan — il suit un brief. |
| Qui paie le contexte ? | Le **gros modèle** (architecte) investit en amont ; les **petits modèles** reçoivent des tâches bornées → moins d'itérations, moins de `glob` aveugle. |

**Conséquence produit** : la qualité du brief architecte est le **prérequis** au parallélisme et à la multiplication des exécuteurs — pas un luxe documentaire.

**Périmètre actuel (P3b)** : 1 exécuteur à la fois, briefs détaillés obligatoires. Parallèle 2× / 4× = phase ultérieure (P4), même contrat de brief.

---

## 2. Architecture d'ensemble (inchangée, éclairée)

```text
Utilisateur
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ ARCHITECTE (gros modèle, run unique)                        │
│  1. workspace_map_read (une fois)                           │
│  2. todo_write  (plan détaillé, tâches opérationnelles)    │
│  3. Pour chaque tN :                                        │
│     a. todo in_progress                                     │
│     b. delegate_executor(tN, brief complet + scope)       │
│        → run EXÉCUTEUR (sync, modèle léger)                 │
│     c. Lire status + rapport extrait                        │
│     d. 1 verify ciblé (file_read/grep sur chemin du scope)  │
│     e. todo completed  OU  re-delegate(1×) scope corrigé   │
│  4. [phase: answering] — synthèse courte                    │
│  5. [phase: done]                                           │
└─────────────────────────────────────────────────────────────┘
         │
         │  scope (chemins issus de la carte, verbatim)
         ▼
┌─────────────────────────────────────────────────────────────┐
│ EXÉCUTEUR (modèle léger, run borné)                         │
│  1. Lire contexte dans scope                                │
│  2. Agir (edits, bash, lectures ciblées)                    │
│  3. Vérifier légèrement                                     │
│  4. [phase: answering] → rapport template → [phase: done]   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Trois axes de qualité (retour chat1)

### Axe A — Planification structurée (économie contexte)

**Problème observé (chat1)** : plan en 4 tâches pour « analyser le projet », 16 tours LLM sans réponse, architecte qui lit des chemins inventés.

**Règles issues du retour terrain** :

1. `workspace_map_read` **avant** toute délégation — gate moteur.
2. Chaque chemin dans `scope` doit exister dans la carte ou sous la racine projet détectée.  
   → Gate avec message : `"scope path 'package.json' not in workspace map — use 'app-kdds-main/package.json'"`
3. Demandes « analyse / explore » → nudge soft si >3 tâches exécuteur ; recommandation : 1 explore + 1 synthèse.
4. Plan court = pas de parallélisme fictif avec des tâches qui attendent les précédentes de toute façon.

### Axe B — UI cohérente

**Problème observé** : aucun badge de statut, rapport brut, outils architecte ratés visibles comme du vrai travail.

**Fil par tour cible** :

```text
[User prompt]
[Bande agent]
  banner    → rôle + modèle (architecte)
  plan      → todos avec icônes ⏳ / ✓ / ⚠ / ✗ liées au statut delegate
  work      → cartes exécuteur seulement (statut honnête + rapport court)
  thinking  → phases architecte internes (bref, collapsé)
  answer    → synthèse finale architecte uniquement
```

Règle : les `file_read` / `grep` de verify architecte n'apparaissent **pas** dans `work` — une ligne discrète « Verify · t2 » sous le todo suffit.

### Axe C — Contrôle agressif exécuteur

**Problème observé** : `status: completed` après 11 tours de monologue + glob node_modules, architecte incapable de corriger sans aller lui-même chercher les fichiers.

**Gates exécuteur** :

| Gate | Comportement |
|------|-------------|
| `glob` sur `**/node_modules/**`, `**/.next/**` | Bloqué par défaut |
| `ask_user_question` sans `Status: blocked` dans le rapport | Interdit (l'exécuteur ne demande pas à l'utilisateur) |
| `file_read` hors scope répété | Nudge puis erreur |
| `hit_max` sans template rapport | Toujours `partial`, pas `completed` |

**Gate architecte (compensation interdite)** :

| Situation | Autorisation |
|-----------|-------------|
| Delegate `partial` / `failed` | `delegate_executor` (retry 1×) ou `ask_user_question` **seulement** |
| Verify | **1 seul** outil read-only sur un chemin du scope de la dernière délégation |
| `todo completed` | Bloqué si aucun verify réussi depuis la dernière délégation de cette tâche |

---

## 4. Contrat de rapport exécuteur (inchangé, rappel)

L'exécuteur **doit** utiliser ce template dans `[phase: answering]` :

```markdown
## Executor report · {task_id}

**Status:** completed | partial | blocked

**Deliverable check:** met | not met — one line

**What I did:**
- bullets

**Evidence:**
- paths, commands, grep hits

**Deep notes:** (optional)
```

Le moteur extrait **uniquement ce bloc** pour l'architecte. Tout le stream amont (monologue, explorations) est ignoré.

---

## 5. Plan de livraison (PR restantes)

### État des phases (mise à jour 2026-05-26)

| Phase | Description | Statut |
|-------|-------------|--------|
| P1 | `RunSpec`, découplage `RunPolicy` | ✅ |
| P2 | Feature flag `legacy`/`v1_2` | ✅ |
| P3 | MVP Architecte + Exécuteur (`delegate_executor`) | ✅ |
| **P3b** | **Qualité architecte** (gates, partial/failed, briefs, fil linéaire) | **✅ code** · smoke §6 à cocher |
| P3-9 | Smoke manuel scénarios 1–3 | 🔧 pré-vol auto OK → [SMOKE](../11-operations/SMOKE-ORCHESTRATION-1.2.0.md) |
| P4 | Chefs, récursion, parallèle séquences | ⬜ |
| P5 | Décommission Low/Medium | ⬜ (branches `is_low_profile` isolées, prêt) |
| PI | IDE settings + badges rôles | ⬜ |

### Livraison P3b (code — 2026-05-26)

**PR1 — Moteur qualité sub-agents** ✅

| Fichier | Changement |
|---------|-----------|
| `orchestration_delegate.rs` | `finalize` : statut basé livrable (`partial`), extraction rapport template |
| `orchestration_delegate.rs` | `reportMarkdown` = slice template uniquement |
| `agent/gates.rs` | Gate scope validé contre carte workspace |
| `agent/gates.rs` | Gate verify obligatoire avant `todo completed` |
| `agent/loop.rs` | État `verified_task_ids`, `last_delegate_scope` |
| `orchestration_delegate.rs` | Gates exécuteur : glob blacklist, pas de `ask_user_question` hors `blocked` |
| Tests | `finalize` → `partial` sur rapport sans template ; scope invalide → bloqué |

**PR2 — Prompts & briefs opérationnels** ✅

| Fichier | Changement |
|---------|-----------|
| `orchestration/prompts.rs` | Architecte = chef d'orchestre : briefs opérationnels (`instructions` détaillées) |
| `orchestration/prompts.rs` | `todo_write` : plan détaillé visible, pas titres vagues |
| `orchestration/prompts.rs` | Chemins `scope` = copie verbatim de `workspace_map_read` |
| `orchestration/prompts.rs` | Exécuteur : exécuter le brief, ne pas re-planifier ; `ask_user_question` sauf `blocked` |
| `delegate_executor` (tool schema) | Description outil : exiger un brief substantiel |
| `08-architect-state/` | Gates P3b documentées |
| `07-roles-tools/` | Statuts `partial`/`failed`, règle scope + qualité brief |

**PR3 — UI cohérente** ✅

| Fichier | Changement |
|---------|-----------|
| `07-log.js` | Badge `partial`/`failed` sur carte exécuteur |
| `07-log.js` | `executor-stream-report` = rapport extrait court (template seulement) |
| `07b-runTimeline.js` | Outils verify architecte → section `plan` (classe `.verify-line`) |
| `02-chrome.js` | Todos : icône dérivée de statut delegate |
| `droxChatMvp.css` | `.executor-status-partial`, `.executor-status-failed`, `.verify-line` |

---

## 6. Critères d'acceptation (scénario « analyser le projet »)

Rejouer `chat1` sur un workspace Next.js (`app-kdds-main/`) :

| # | Critère | Attendu |
|---|---------|---------|
| 1 | Nombre de délégations | ≤ 2 exécuteurs avant synthèse |
| 2 | Scope | `app-kdds-main/package.json`, pas `package.json` racine |
| 3 | t2 si exécuteur dérape | `status: partial` — architecte **ne** marque **pas** `completed` |
| 4 | Compensation architecte | Aucun `file_read` sur chemin absent de la carte |
| 5 | Verify | `file_read` sur `app-kdds-main/package.json` avant `completed` |
| 6 | UI | Strip : plan → 1–2 cartes exécuteur → réponse finale — pas d'export coupé |
| 7 | Budget LLM | < 8 tours architecte total (vs 20 dans chat1) |

---

## 7. Ce qui est hors périmètre P3b

- Chefs intermédiaires / récursion (P4).
- Parallélisme séquences (P4).
- Retrait `run_profile` / `RunContext` Low (P5 — fait : `RunSpec` + `GateKind` seuls ; module `run_profile` supprimé).
- Retrait `modelTier` wire + UI vignettes / setting `nexus.drox.modelTier` (P5 — fait).
- Replay historique sur modèle linéaire.

---

## 8. Périmètres → dossiers `steps/`

| Périmètre | Dossier |
|-----------|---------|
| Vision paradigme | `01-vision/` |
| Construction moteur | `02-construction/` |
| Upstream / fork | `03-upstream/` |
| Pilotage P0–P5 | `04-implementation/` |
| Specs P0 | `05-spec-p0/` |
| Feature flag | `06-flag/` |
| Rôles + outils | `07-roles-tools/` |
| Machine à états | `08-architect-state/` |
| UI | `09-ui/` |
| IDE | `10-ide/` |
| Smoke / ops | `11-operations/` |
| Retour terrain | `../../retour_discussion/chat1` |
