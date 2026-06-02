# Cartographie — Drox 1.3.0

**Date** : 2026-05-27  
**Plan** : [PLAN-IMPLEMENTATION-1.3.0.md](../steps/02-implementation/PLAN-IMPLEMENTATION-1.3.0.md)

---

## Moteur

| Fichier | Rôle 1.2.0 | Évolution 1.3.0 |
|---------|------------|-----------------|
| `drox-tools/.../delegate_executor.rs` | 1 tâche sync | `parallel_with[]`, réponse `results[]` |
| `drox-engine/.../orchestration_delegate.rs` | `run_executor_task` ×1 | `run_parallel_executor_tasks` + slots |
| `drox-engine/.../orchestration/config.rs` | modèles architect/executor | + `max_parallel_executors` |
| `drox-engine/.../orchestration/parallel_batch.rs` | — | **nouveau** — validation scopes disjoints |
| `drox-engine/.../agent/architect_gates.rs` | gates qualité | + budget batch, overlap scope |
| `drox-engine/.../agent/architect_state.rs` | 1 dernière délégation | ingest **N** résultats batch |
| `drox-engine/.../agent/loop.rs` | handler delegate | parser `results[]`, record multi |
| `drox-engine/.../orchestration/prompts.rs` | prompt séquentiel | bloc « Slots : N », règles batch |
| `drox-cli/.../agent_run.rs` | wire delegate | passer `max_parallel_executors` |
| `drox-cli/.../orchestration_run.rs` | run v1_2 | idem |
| `drox-tools/.../orchestration_delegate.rs` | trait sync | optionnel : méthode batch sur trait |

`drox-tools/agent_output.rs` : déjà `plan_id/task_id/` — pas de changement structurel (vérifier concurrence FS).

---

## IDE (Nexus)

| Fichier | Évolution 1.3.0 |
|---------|-----------------|
| `common/droxConfiguration.ts` | `OrchestrationMaxParallelExecutors` |
| `common/droxRunSettings.ts` | champ + RPC param |
| `electron-browser/droxRunSettingsService.ts` | lecture setting |
| `browser/droxChatWebview.ts` | UI réglage parallélisme (panneau exécuteur) |
| `browser/media/droxChat/01c-role-models.js` | persistance réglage |
| `browser/media/droxChat/07-log.js` | `Map` captures exécuteur |
| `browser/media/droxChat/07b-runTimeline.js` | `.drox-executor-grid` |
| `browser/media/droxChatMvp.css` | grille cartes |
| `browser/droxChatAgentEvents.ts` | ctx guard N sous-runs |

---

## Setting produit

| Clé | Défaut | Description |
|-----|--------|-------------|
| `nexus.drox.orchestration.maxParallelExecutors` | `1` | Nombre max d'exécuteurs lancés **en parallèle** dans un batch `parallel_with` (1 = séquentiel 1.2.0) |

---

## Arborescence docs

```
drox-engine/docs/1.3/
├── README.md                 ← hub ligne 1.3
├── 1.3.0/                    ← livré (moteur + v1.3.0)
│   ├── README.md
│   ├── cartographie/         ← ce fichier
│   ├── steps/01-vision … 04-resilience/
│   └── finalisation/
└── 1.3.1/                    ← release produit (en cours)
    ├── finalisation/CLOSURE-1.3.1.md
    └── retour_discussion/

../feature-brainstorm/          ← idées post-release (hors docs/1.3)
```
