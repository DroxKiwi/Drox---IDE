# Idée 04 — Mode « long-run » (tâches multi-heures)

**Statut** : idée brute  
**Date** : 2026-05-28

---

## Résumé

Un **mode dédié** pour confier des tâches **très complexes** — ex. *« Créer une app web portfolio + vente en ligne à partir de cette doc »* — où le moteur établit un **plan à très grande échelle** (potentiellement **centaines d’étapes**) et exécute sur **plusieurs heures** si nécessaire, avec reprise, checkpoints et livrable final cohérent.

---

## Problème actuel

| Mécanisme | Limite |
|-----------|--------|
| `maxIterations` | Plafond bas, orienté session interactive |
| Plan architecte `todo_write` | Dizaines d’items, pas **centaines** ; risque boucles / dérive |
| Compaction mémoire | Conçue pour runs longs mais pas **orchestration jour entier** |
| UI chat | Pensée pour cycles minutes, pas suivi **heures** |

Les tâches « refonte complète » dépassent le cadre 15 min–1 h validé en 1.3.0.

---

## Vision produit

```text
Utilisateur : brief + doc (PDF/MD) + contraintes
        │
        ▼
┌───────────────────┐
│  Long-run planner │  → plan hiérarchique (phases → épiques → tâches)
│  (architecte)     │     centaines de steps, estimations, dépendances
└─────────┬─────────┘
          │ checkpoint / reprise disque
          ▼
┌───────────────────┐
│  Orchestration    │  → batches exécuteurs, gates, vérité terrain
│  multi-heures     │     pause / reprise / annulation
└─────────┬─────────┘
          ▼
    Livrable : repo + rapport + (option) preview web
```

### UX attendue

- Commande ou mode explicite : **« Démarrer un long-run »** (pas le chat rapide par défaut).  
- Barre de progression **macro** (phases) + micro (tâches courantes).  
- Notifications IDE (pause, blocage permission, fin de phase).  
- Reprise après crash IDE / redémarrage machine.

### Exemple d’entrée utilisateur

> Créer une app web qui sert de portfolio et de vente en ligne. Voici la doc produit complète [fichier]. Respecter la charte, Stripe plus tard, livrer MVP navigable.

---

## Pistes techniques

### Moteur

- **Run spec** `long_run: true` : budgets séparés (itérations, tokens, durée wall-clock).  
- Plan **hiérarchique** persisté (SQLite / JSONL sous `.drox/runs/<id>/`).  
- Checkpoints : commit git automatique ou snapshot workspace (politique à définir).  
- Gates renforcés : anti-dérive plan, `truth_check`, limite répétition outils.  
- Scheduler : file de tâches avec priorité ; lien avec idée **01** (serveurs séparés).  
- Compaction **par phase** (pas tout le transcript en contexte).

### IDE

- Session / onglet dédié long-run (timeline + parcours idée 02).  
- Paramètres : durée max, confirmation avant writes massifs.  
- Intégration preview web (idée 03) pour valider le MVP.

### Hors scope MVP

- Multi-utilisateur, file d’attente cloud.  
- Facturation au token pour runs 8 h.

---

## Liens existants

- Orchestration `v1_2`, `parallel_with`, `architect_todo_gate`, `final_answer_guard`  
- Doc : [VISION-CONSOLIDEE-1.3.0.md](../../steps/01-vision/VISION-CONSOLIDEE-1.3.0.md), [CRITERES-TEST-REEL.md](../../finalisation/CRITERES-TEST-REEL.md)  
- Idées 01–03 : infra perf, visibilité, validation web

---

## Questions ouvertes

| ID | Question |
|----|----------|
| Q1 | **Durée max** par défaut (4 h, 12 h, illimité avec opt-in) ? |
| Q2 | Plan **figé** après validation utilisateur ou révision continue ? |
| Q3 | Git : branche dédiée `drox/long-run/<id>` obligatoire ? |
| Q4 | Reprise : rejeu depuis dernier checkpoint ou re-planification ? |
| Q5 | Comment facturer / limiter coût LLM (budget tokens affiché) ? |
| Q6 | Relation avec **course / professeur** (reporté 1.3.0) ? |

---

## Risques

- Dérive objectif sur 200+ steps sans gate humain périodique.  
- Coût tokens / électricité non maîtrisé.  
- Corruption workspace si writes automatiques trop agressifs.  
- Support : déboguer un run 6 h est difficile sans outils idée 02.

---

## Critères de succès (si promu)

- Brief type « site portfolio + e-commerce MVP » tient **≥ 2 h** sans crash moteur, avec reprise après redémarrage IDE.  
- ≥ 80 % des tâches du plan initial terminées ou explicitement annulées avec raison.  
- Livrable : app lançable + doc récap utilisateur (&lt; 2 pages).
