# Vision consolidée — Drox 1.3.0

**Date** : 2026-05-27
**Statut** : document actif — amorce de version.
**Construit sur** : 1.2.0 (orchestration architecte/exécuteur séquentielle, gates, fil linéaire multi-tours).

---

## 0. Contexte : ce que 1.2.0 a livré

| Acquis 1.2.0 | Description |
|---|---|
| Mode `v1_2` | Architecte + exécuteurs éphémères séquentiels |
| Gates qualité | `workspace_map_read` avant délégation, scope validé, verify avant `completed` |
| Agent-output par plan | `.drox/agent-output/<plan_id>/<task_id>/` |
| Fil linéaire multi-tours | Un strip par cycle user, réponse scellée dans son cycle |
| Jauge ctx parent seule | La jauge `ctx` ne gonfle pas sur les runs exécuteur |
| `agent/done` v1_2 | Le chat ne reste plus bloqué en « running… » après la réponse architecte |

**Limitation majeure restante** : les exécuteurs tournent **séquentiellement** (un à la fois). Le parallélisme est le sujet central de 1.3.0.

---

## 1. Objectif principal — Parallélisation multi-exécuteurs

> **1.3.0 = passer de 1 exécuteur séquentiel à N exécuteurs asynchrones en parallèle.**

Voir le document de design complet : [`03-parallelisme/PARALLELISME-DESIGN.md`](../03-parallelisme/PARALLELISME-DESIGN.md)

### Modèle retenu (résumé)

L'architecte est **déchargé dès le premier outil soumis** — il ne peut pas émettre plusieurs `delegate_executor` séparés et attendre. Il doit donc préparer tous ses briefs parallèles **dans le même tour** et les soumettre en un seul appel via le champ `parallel_with` de `delegate_executor` :

```text
Architecte (tour n)
  1. workspace_map_read
  2. todo_write (plan complet)
  3. delegate_executor(t1, parallel_with=[
       { task_id: t2, instructions: "...", scope: [...] },
       { task_id: t3, instructions: "...", scope: [...] },
     ])
     → moteur lance t1, t2, t3 en parallèle (tokio::join_all)
     → collecte Vec<DelegateReport>
  4. Architecte (tour n+1) reçoit les 3 rapports
  5. [phase: answering] — synthèse globale
  6. [phase: done]
```

### Contraintes fondamentales

- **Scopes disjoints obligatoires** dans un batch — gate moteur si overlap.
- **L'architecte déclare** le groupement ; le moteur l'exécute.
- **Budget utilisateur** : nb de slots parallèles = réglage IDE (languette paramètres exécuteur).
- **Contexte architecte** : le moteur injecte la capacité disponible (`Slots : 3`) au démarrage du run.
- Chaque exécuteur reste éphémère et borné (Contrat A inchangé).

---

## 2. Problèmes UI à régler (hérités 1.2.0, bloquants avant parallèle)

La parallélisation expose les problèmes UI existants encore plus brutalement — il faut les régler en même temps.

| # | Problème | Symptôme observé | Priorité |
|---|---|---|---|
| UI-1 | **Réponse finale mal positionnée multi-tours** | `ensureFinalAnswerIsLastOnLog` déplace la réponse du cycle 1 sous les actions du cycle 2 | P0 — partiellement corrigé en 1.2.0, à valider |
| UI-2 | **Plan sticky emporté à la fin du cycle** | Le plan du cycle 1 disparaît dès qu'on scrolle dans le cycle 2 | P0 — partiellement corrigé, à valider |
| UI-3 | **Cartes exécuteurs parallèles dans `work`** | Aujourd'hui une seule carte à la fois ; il faut afficher N cartes en cours simultanément | P0 (nouveau, 1.3.0) |
| UI-4 | **Progression globale plan** | Pas de barre/compteur `t1 ✓ / t2 ⏳ / t3 ⏳` visible pendant le run | P1 (nouveau, 1.3.0) |
| UI-5 | **Thinking architecte vs exécuteurs** | La section `thinking` mélange encore les flux dans certains cas | P1 |
| UI-6 | **Jauge ctx en mode parallèle** | Avec N sous-runs, risque de re-gonflement si le garde n'est pas étendu | P1 |

---

## 3. Axiomes produit (reconduits + 1 ajout)

Les 4 axiomes de 1.2.0 sont inchangés. Un axiome s'ajoute :

### Axiome 5 — Parallélisme déclaratif, ordonnancement moteur

> **L'architecte déclare des tâches et leurs dépendances. Le moteur décide du moment de lancement.**

L'architecte ne gère **pas** lui-même les slots ni les waits — c'est la responsabilité exclusive du moteur. Ce principe garantit que le prompt architecte reste stable quel que soit le degré de parallélisme.

---

## 4. Architecture cible 1.3.0

### Moteur Rust

```text
delegate_executor(t1, t2, t3) → OrchestratorQueue
  ├─ Slot 1 : RunSpec(t1) → exécuteur t1 (tokio::spawn)
  ├─ Slot 2 : RunSpec(t2) → exécuteur t2 (tokio::spawn)
  └─ Slot 3 : RunSpec(t3) → exécuteur t3 (tokio::spawn)

OrchestratorQueue::join_all(timeout) → Vec<DelegateReport>
→ architecte reçoit les 3 rapports consolidés
```

Fichiers principaux impactés :
- `drox-engine/.../orchestration_delegate.rs` — passer de sync à `async + join`
- `drox-engine/.../agent/architect_state.rs` — tracking des slots parallèles
- `drox-engine/.../agent/architect_gates.rs` — gate dépendances
- `drox-cli/.../agent_run.rs` — streaming multi-sous-runs simultanés

### IDE (webview)

```text
work:
  ┌─ Executor · t1 [Running] ─┐
  │ tools stream…             │   ← visible en parallèle
  └───────────────────────────┘
  ┌─ Executor · t2 [Running] ─┐
  │ tools stream…             │
  └───────────────────────────┘
  ┌─ Executor · t3 [Done ✓]  ─┐
  │ rapport extrait           │
  └───────────────────────────┘
```

Fichiers principaux impactés :
- `07b-runTimeline.js` / `07-log.js` — N cartes exécuteur simultanées dans `work`
- `droxChatMvp.css` — layout cartes parallèles (grid ou stack)

---

## 5. Phases de livraison

| Phase | Description | Statut |
|---|---|---|
| **UI-fix** | Valider + finir les corrections multi-tours (UI-1 à UI-2) | 🔧 en cours |
| **P4a** | Infrastructure moteur async — `join_all`, slots, DependencyGraph | ⬜ |
| **P4b** | Prompt architecte — déclaration `deps` dans `todo_write`, brief multi-delegate | ⬜ |
| **P4c** | IDE — cartes parallèles dans `work`, compteur plan, ctx guard N slots | ⬜ |
| **P4d** | Smoke parallèle — scénario 2 exécuteurs simultanés sur workspace réel | ⬜ |
| **P5** | Décommission `legacy` mode (si P4 stable) | ⬜ |

---

## 6. Ce qui est hors périmètre 1.3.0

- Chefs intermédiaires / récursion (architecte qui délègue à un sous-architecte).
- Exécuteurs sur machines distantes / cloud workers.
- Replay historique session.
- Retrait complet mode `legacy` (conservé en fallback jusqu'à P5 confirmé).
