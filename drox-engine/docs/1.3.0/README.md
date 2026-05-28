# Drox 1.3.0 — Suivi de version

**Thème** : parallélisation des exécuteurs orchestration (`v1_2` → `v1_3`).

**Statut global** (2026-05-27) : plan **validé** — implémentation en cours (P4a).

---

## Documents de référence

| Document | Rôle |
|----------|------|
| [VISION-CONSOLIDEE-1.3.0.md](steps/01-vision/VISION-CONSOLIDEE-1.3.0.md) | Objectifs produit, axiomes |
| [PARALLELISME-DESIGN.md](steps/03-parallelisme/PARALLELISME-DESIGN.md) | Design détaillé, décisions Q1–Q5 |
| [PLAN-IMPLEMENTATION-1.3.0.md](steps/02-implementation/PLAN-IMPLEMENTATION-1.3.0.md) | **Plan d'exécution** (phases, fichiers, critères) |
| [FAILURE-ABSORPTION.md](steps/04-resilience/FAILURE-ABSORPTION.md) | Résilience échecs (prérequis) |
| [cartographie/README.md](cartographie/README.md) | Fichiers moteur + IDE touchés |
| [finalisation/](finalisation/README.md) | **Clôture 1.3.0** — distribution : [plan launcher](finalisation/PLAN-DISTRIBUTION-LAUNCHER.md), cadrage, tests terrain |
| [finalisation/CRITERES-TEST-REEL.md](finalisation/CRITERES-TEST-REEL.md) | Grille test terrain « > 15 min » |
| [finalisation/MISE-A-JOUR-ARCHITECTE-TODO.md](finalisation/MISE-A-JOUR-ARCHITECTE-TODO.md) | Mise à jour moteur: guidance Architecte pour éviter les boucles `todo_write` |
| [1.3.1/](1.3.1/README.md) | **Prochaine maj** — backlog idées (serveurs par rôle, parcours live, preview web, long-run) |

---

## Décisions figées (ne pas réouvrir sans ADR)

| # | Décision |
|---|----------|
| D1 | **Un seul** appel `delegate_executor` par batch — champ `parallel_with[]`, pas N appels async séparés |
| D2 | Réponse outil = **liste JSON** `results[]` (un élément par tâche) |
| D3 | Retry **par tâche** après batch (re-`delegate_executor` sans `parallel_with` sur t2 seul) |
| D4 | UI : cartes exécuteur **live** pendant le batch (ordre = ordre de soumission) |
| D5 | Setting dédié `drox.orchestration.maxParallelExecutors` (défaut **1**), distinct de `subagents.maxConcurrent` |
| D6 | Gate **scopes disjoints** obligatoire dans un batch |
| D7 | `wait_for` / DAG deps → **P4d** (optionnel, pas bloquant P4a–c) |

---

## Ordre d'exécution

```
R0–R2 (résilience) ✅  →  UI-fix (valider)  →  P4a moteur  →  P4a config  →  P4b prompt  →  P4c UI  →  P4d smoke
```

---

## Phase en cours

→ Voir checklist détaillée dans [PLAN-IMPLEMENTATION-1.3.0.md](steps/02-implementation/PLAN-IMPLEMENTATION-1.3.0.md).
