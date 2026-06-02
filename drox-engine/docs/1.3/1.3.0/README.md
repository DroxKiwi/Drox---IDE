# Drox 1.3.0 — livré

**Thème** : parallélisation des exécuteurs orchestration (`v1_2` → lot moteur 1.3) + **première release Windows** (F1/F3).

**Statut** (2026-05-29) : moteur **clôturé** ; canal `v1.3.0` publié. La suite distribution (installeur polish, MAJ in-app) est dans [**1.3.1**](../1.3.1/README.md).

---

## Documents

| Document | Rôle |
|----------|------|
| [VISION-CONSOLIDEE-1.3.0.md](steps/01-vision/VISION-CONSOLIDEE-1.3.0.md) | Objectifs produit, axiomes |
| [PARALLELISME-DESIGN.md](steps/03-parallelisme/PARALLELISME-DESIGN.md) | Design batch `tasks[]`, scopes disjoints |
| [PLAN-IMPLEMENTATION-1.3.0.md](steps/02-implementation/PLAN-IMPLEMENTATION-1.3.0.md) | Plan d’exécution P4a–c |
| [FAILURE-ABSORPTION.md](steps/04-resilience/FAILURE-ABSORPTION.md) | `FailurePacket`, truth check |
| [cartographie/README.md](cartographie/README.md) | Fichiers moteur + IDE touchés |
| [finalisation/](finalisation/README.md) | Distribution : cadrage, plan F1–F7, clôture 1.3.0 |
| [CLOSURE-1.3.0.md](finalisation/CLOSURE-1.3.0.md) | Bilan livré (moteur + F1/F3) |
| [CRITERES-TEST-REEL.md](finalisation/CRITERES-TEST-REEL.md) | Grille test terrain « > 15 min » |
| [MISE-A-JOUR-ARCHITECTE-TODO.md](finalisation/MISE-A-JOUR-ARCHITECTE-TODO.md) | Guidance architecte anti-boucle `todo_write` |

---

## Décisions figées

| # | Décision |
|---|----------|
| D1 | Un seul `delegate_executor` par batch — `tasks[]` |
| D2 | Réponse outil = `results[]` |
| D3 | Retry par tâche après batch partiel |
| D4 | UI : cartes exécuteur live pendant le batch |
| D5 | `drox.orchestration.maxParallelExecutors` (défaut **1**) |
| D6 | Gate scopes disjoints obligatoire |
| D7 | `wait_for` / DAG → hors 1.3.0 |

---

## Distribution (partie livrée en 1.3.0)

| Phase | Statut |
|-------|--------|
| F1 Build packagé | ✅ |
| F3 Canal `v1.3.0` + `latest.json` | ✅ |

→ F2 polish, F4 notification, F5 updater : [**1.3.1**](../1.3.1/finalisation/CLOSURE-1.3.1.md).
