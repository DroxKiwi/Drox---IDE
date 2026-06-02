# Design — Parallélisme exécuteurs 1.3.0

**Date** : 2026-05-27  
**Statut** : **validé** (2026-05-27) — implémentation : [PLAN-IMPLEMENTATION-1.3.0.md](../02-implementation/PLAN-IMPLEMENTATION-1.3.0.md).

---

## 1. Le problème fondamental : l'architecte se décharge dès la première délégation

En 1.2.0, le run architecte est **suspendu** pendant qu'un exécuteur tourne (appel synchrone). Avec le parallélisme naïf tel qu'on l'avait imaginé dans la vision initiale :

```
Architecte émet delegate(t1), delegate(t2), delegate(t3) → puis attend
```

Le problème est que **l'architecte est déchargé de mémoire active dès qu'il soumet son premier `delegate_executor`**. Il ne peut pas « émettre trois appels puis attendre » comme on le ferait dans un thread humain. Son contexte d'exécution LLM est terminé à ce moment-là.

### Conséquence design

> **L'architecte doit préparer tous ses appels parallèles AVANT de les soumettre, dans le même tour de réflexion.**

Ce n'est pas le moteur qui détermine quoi grouper — c'est l'architecte qui déclare explicitement un **groupe d'appels simultanés** dans un seul appel outil.

---

## 2. Modèle retenu : `delegate_executor` groupe (batch)

### Option A — N appels séparés avec flag `async: true` (rejetée)

```
delegate_executor(t1, async: true)   ← l'architecte part
delegate_executor(t2, async: true)   ← jamais exécuté
```

**Rejeté** : l'architecte est déchargé après le premier outil — les suivants ne sont jamais émis.

### Option B — Un seul appel `delegate_batch` avec liste de tâches (retenue)

```
delegate_batch([
  { task_id: "t1", instructions: "...", scope: [...] },
  { task_id: "t2", instructions: "...", scope: [...] },
  { task_id: "t3", instructions: "...", scope: [...] },
])
```

L'architecte prépare **tous les briefs** dans son tour de réflexion, puis soumet le batch en une seule opération. Le moteur lance N exécuteurs en parallèle et rend la main à l'architecte quand tous sont terminés (ou en timeout).

**Avantage** : un seul point de synchronisation, l'architecte reste maître de la décision de groupement.

### Option C — `delegate_executor` accepte un tableau (variante de B, moins de rupture)

Plutôt qu'un nouvel outil, étendre `delegate_executor` pour accepter un champ `parallel_with` :

```
delegate_executor(
  task_id: "t1",
  instructions: "...",
  scope: [...],
  parallel_with: [
    { task_id: "t2", instructions: "...", scope: [...] },
    { task_id: "t3", instructions: "...", scope: [...] },
  ]
)
```

**Avantage** : rétrocompatible (sans `parallel_with` = séquentiel comme avant). Le outil principal reste `delegate_executor`.

---

## 3. Décision préliminaire : Option C recommandée

- Rétrocompatiblité totale avec les runs 1.2.0.
- L'architecte choisit **explicitement** le mode : séquentiel (pas de `parallel_with`) ou parallèle (avec `parallel_with`).
- Le moteur expose la capacité (nb de slots) dans le contexte architecte → l'architecte adapte son groupement.

---

## 4. Le budget parallèle : un paramètre utilisateur

### Pourquoi laisser l'utilisateur décider ?

Le nombre optimal de slots dépend :
- Du **modèle exécuteur** choisi (un petit modèle 7B local peut en saturer 3 sans problème ; un gros modèle cloud coûte cher en parallèle).
- Des **ressources machine** (RAM GPU, cores CPU).
- De la **nature de la tâche** (tâches I/O-bound = plus de parallèle OK ; tâches intensives = moins).

Le moteur ne peut pas décider seul — c'est un réglage intentionnel de l'utilisateur.

### UI : languette paramètres exécuteur

Dans le panneau de configuration Drox (section exécuteur), ajouter :

```
Modèle exécuteur : [qwen2.5-coder:7b ▼]
Parallelisme max : [1 ▼]  ← (1 = séquentiel, 2, 3, 4, ...)
```

Valeur par défaut : **1** (séquentiel, comportement 1.2.0 inchangé).

### Comment le moteur expose ce budget à l'architecte

Au moment de démarrer le run architecte, le contexte injecté contient :

```
## Capacité de délégation
- Mode : v1_3
- Slots exécuteurs disponibles : 3
- Mode séquentiel disponible : oui (omit parallel_with)
- Mode parallèle disponible : oui (parallel_with, max 3 tâches simultanées)
```

L'architecte voit sa « force de frappe » et adapte son plan en conséquence. S'il n'a qu'1 slot, il ne soumet jamais de `parallel_with`.

---

## 5. Responsabilité de l'architecte : planifier sans concurrence

### Le problème de concurrence sur les fichiers

Si t1 modifie `src/components/Header.tsx` et t2 modifie aussi `src/components/Header.tsx` en parallèle → conflit de fichier garanti.

### Règle fondamentale

> **Deux tâches dans un même `parallel_with` ne doivent jamais avoir de chemins `scope` qui se recoupent.**

C'est **la responsabilité de l'architecte**, pas du moteur. L'architecte conçoit des tâches avec des **scopes disjoints** avant de les grouper.

Le moteur peut ajouter une **gate de sécurité** : si deux scopes dans un batch partagent un chemin, refus avec message explicite.

### Exemples valides de groupes parallèles

```
Groupe A (scope disjoint ✓) :
  t1 : scope=[src/components/]
  t2 : scope=[src/styles/]
  t3 : scope=[src/lib/]

Groupe B (scope disjoint ✓) :
  t4 : scope=[app-a/src/]
  t5 : scope=[app-b/src/]
```

### Exemples invalides (à rejeter par la gate)

```
Groupe invalide (scope overlap ✗) :
  t1 : scope=[src/]
  t2 : scope=[src/components/]   ← sous-ensemble de t1
```

---

## 6. Cycle de vie d'un batch parallèle

```
Architecte (tour n)
  ├─ Réflexion : identifie tâches indépendantes + scopes disjoints
  ├─ Prépare briefs complets pour chaque tâche
  └─ Émet delegate_executor(t1, parallel_with=[t2, t3])
         │
         ▼ Moteur (synchronisation)
  ├─ Valide scopes disjoints (gate)
  ├─ Lance t1, t2, t3 → tokio::join_all
  │    ├─ Exécuteur t1 → rapport t1
  │    ├─ Exécuteur t2 → rapport t2
  │    └─ Exécuteur t3 → rapport t3
  └─ Collecte Vec<DelegateReport> → retour architecte

Architecte (tour n+1)
  ├─ Reçoit [rapport_t1, rapport_t2, rapport_t3]
  ├─ Verify ciblé sur chacun (1 read-only par tâche)
  ├─ todo completed / retry si partial
  └─ [phase: answering] → synthèse
```

**Point clé** : l'architecte reprend la main **seulement quand tous les slots sont terminés**. Pas de streaming intermédiaire vers l'architecte — il ne voit que les rapports finaux extraits.

---

## 7. Timeout et gestion des échecs parallèles

| Cas | Comportement moteur |
|---|---|
| Tous terminés dans le temps imparti | `Vec<DelegateReport>` complet → architecte |
| 1 slot timeout | Rapport `failed` pour ce slot, les autres continuent → architecte reçoit tout |
| 1 slot `partial` | Architecte peut retry **seulement ce slot** (pas tout le batch) |
| Gate scope overlap | Batch refusé avant lancement, architecte reçoit une erreur explicite |

---

## 8. Décisions tranchées (2026-05-27)

| # | Question | Décision |
|---|----------|----------|
| Q1 | Nom de l'outil | **`delegate_executor` + `parallel_with`** (Option C) |
| Q2 | Format rapport batch | **Liste JSON** `results[]` — l'architecte consolide en `[phase: answering]` |
| Q3 | Retry partiel | **Oui** — re-`delegate_executor` sur une seule `task_id` (sans batch) |
| Q4 | Visibilité UI | **Live** — une carte par slot dès `ExecutorTaskStart` |
| Q5 | Ordre UI | **Ordre de soumission** (t1, puis t2, t3 dans le batch) |

Setting utilisateur : **`nexus.drox.orchestration.maxParallelExecutors`** (défaut `1`, plafond moteur `4`). Distinct de `nexus.drox.subagents.maxConcurrent` (outil `task` legacy).

---

## 9. Prochaines étapes

1. ~~Valider ce design~~ ✅  
2. ~~Mettre à jour plan de suivi~~ → [PLAN-IMPLEMENTATION-1.3.0.md](../02-implementation/PLAN-IMPLEMENTATION-1.3.0.md), [README.md](../../README.md)  
3. Implémenter **P4a** (moteur + config) → **P4b** → **P4c** → **P4d**
