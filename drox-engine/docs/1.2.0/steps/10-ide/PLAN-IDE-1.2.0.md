# Plan IDE — orchestration 1.2.0

**Version** : 1.2.0  
**Statut** : **livré (P3)** — smoke manuel P3-9 en cours  
**Parent** : [PLAN-IMPLEMENTATION-1.2.0.md](../04-implementation/PLAN-IMPLEMENTATION-1.2.0.md)

---

## Objectif

Adapter Nexus (`contrib/drox`) sans logique orchestration dans le noyau VS Code.

---

## Tâches

| Id | Tâche | Statut |
|----|-------|--------|
| IDE-1 | Settings `nexus.drox.orchestrationMode` (`legacy` \| `v1_2`, défaut `v1_2`) | ✅ |
| IDE-2 | Modèles par rôle (`architectModel`, `executorModel` + vignettes composer) | ✅ |
| IDE-3 | `buildAgentRunParams` → `orchestrationMode` RPC | ✅ |
| IDE-4 | Fil linéaire (`07b-runTimeline.js`) + badges exécuteur + rôle architecte | ✅ |
| IDE-5 | Smoke chat scénarios 1–3 | 🔧 [SMOKE](../11-operations/SMOKE-ORCHESTRATION-1.2.0.md) |

---

## Journal

| Date | Note |
|------|------|
| 2026-05-20 | Plan créé |
| 2026-05-26 | IDE-1→4 livrés ; retrait `modelTier` Low/Medium (P5 code) |
