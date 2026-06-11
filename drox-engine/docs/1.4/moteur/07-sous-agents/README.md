# 07 — Sous-agents

> **⚠️ 1.4.0 table rase** : `delegate_executor`, Explore `task` et segments ACT sont **supprimés** ([SUPPRESSIONS Tier 2](../../1.4.0/SUPPRESSIONS.md)). Ce dossier décrit l’**état actuel du code** avant nettoyage — référence historique.

**Question** : comment le moteur délègue du travail à d’autres contextes LLM ?

---

## Rôle

Deux mécanismes de **délégation** : Explore (lecture isolée) et Executor (édition bornée). Chacun = un `Agent` fils avec prompt et allowlist réduits.

---

## Types

| Mécanisme | Tool | Fichier pivot | Tools autorisés |
|-----------|------|---------------|-----------------|
| **Explore** | `task` | `subagent.rs` | Read-only (grep, glob, file_read, lsp, web…) |
| **Executor** | `delegate_executor` | `orchestration_delegate.rs` | `EXECUTOR_TOOL_ALLOWLIST` |

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `drox-engine/src/subagent.rs` | `EngineSubagentExecutor` — runs Explore |
| `drox-engine/src/orchestration_delegate.rs` | Runs Executor + deliverable path |
| `drox-engine/src/subagent_jobs.rs` | Jobs Explore `background: true` |
| `drox-engine/src/agent/subagent_report_gate.rs` | Injection rapport structuré |
| `drox-engine/src/agent/loop/subagents.rs` | Hooks dans la boucle parent |
| `drox-tools/src/simple/task.rs` | Tool `task` |
| `drox-tools/src/simple/delegate_executor.rs` | Tool délégation |

---

## Flux Executor

```text
Architect appelle delegate_executor { tasks[] }
  → orchestration_delegate spawn Agent (RoleId::Executor)
  → prompt EXECUTOR + brief tâche + chemin deliverable
  → boucle fils jusqu'à file_write deliverable ou stop
  → rapport injecté dans transcript parent
```

---

## Flux Explore async

```text
task { background: true }
  → job enregistré subagent_jobs
  → parent continue (nudge explore_jobs_pending)
  → à la fin : rapport injecté tour suivant
```

---

## Run rail & segments

Les **segments ACT** ([09-run-rail](../09-run-rail/README.md)) sont une 3ᵉ forme de sous-run : même modèle, transcript frais, scope fichiers étroit.

---

## Liens

- [SETUP-PARALLEL-SUBAGENTS-LOW](../../../0.0/architecture/SETUP-PARALLEL-SUBAGENTS-LOW.md)
- Orchestration : [03-orchestration-prompts](../03-orchestration-prompts/README.md)
