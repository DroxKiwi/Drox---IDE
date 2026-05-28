# Orchestration 1.2.0 — rôles, cycle, outils

**Statut** : MVP test (`v1_2`)

---

## UI chat (Nexus)

| Élément utilisateur | Source moteur |
|---------------------|-----------------|
| Bloc **Plan** | `todo_write` → `todoUpdate` |
| Carte **Exécutant · t1** | `delegate_executor` → `SubagentStart` / `SubagentDone` (`executor`) |
| Bannière **Architecte** | `RoleEnter { architect }` |
| Étape **en cours** | todo `in_progress` + surbrillance `todo-active` |
| Étape **clôturée** | todo `completed` (après vérif. architecte) |

Le tool legacy **`task`** (explore) est **désactivé** en `v1_2` (`nexus.drox.orchestrationMode`).

---

## Cycle produit (itératif, qualité > vitesse)

Un **seul run Architecte** pilote tout le travail. L'exécutant n'est pas lancé en rafale par le moteur : l'Architecte appelle l'outil **`delegate_executor`** **une tâche à la fois**.

```text
Utilisateur
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ ARCHITECTE (gros modèle, run unique)                        │
│  1. Comprendre la demande                                   │
│  2. Rédiger un plan d'action (todo_write / liste ordonnée)  │
│  3. Pour chaque tâche :                                     │
│     a. delegate_executor(task)  ──► run EXÉCUTANT (sync)    │
│     b. Vérifier (file_read, grep, lsp, …)                   │
│     c. Tâche suivante                                       │
│  4. Synthèse utilisateur → [phase: done]                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Outil `delegate_executor` (Architecte uniquement)

Chaque appel crée un **exécuteur éphemère aveugle** : il ne voit **pas** la conversation utilisateur ni le plan `todo_write`. L'Architecte compose tout le bagage dans l'appel.

| Champ | Rôle |
|-------|------|
| `task_id` | Identifiant stable (`t1`, `t2`, …) |
| `description` | Action concrète à réaliser |
| `deliverable` | Critère de fin |
| `instructions` | Consignes opérationnelles (≥80 car., chemins, commandes, critères) |
| `context` | **Optionnel** — extraits, notes, chemins vers `.drox/agent-output/<task_id>/*.md` d'une tâche précédente |
| `scope` | Chemins à privilégier |

**Retour** : `{ taskId, status, reportMarkdown, iterationsUsed, truncated }` — l'Architecte **doit** vérifier avant la tâche suivante.

**Contrat A (clôture exécuteur)** : livrable `.md` sous `.drox/agent-output/<task_id>/` (≥64 o, de préférence `report.md`). Le moteur **arrête** le sous-run dès l'écriture réussie ; `status: completed` si le fichier est présent, même sans `[phase: done]` propre dans le stream.

Rapports disque : `.drox/agent-output/<task_id>/` (chaînage via `context` sur les tâches suivantes).

Événements UI pendant la délégation : `RoleEnter { executor }` → événements agent relayés → `RoleEnter { architect }`.

---

## Allowlists

### Architecte

`delegate_executor`, `ask_user_question`, `file_read`, `glob`, `grep`, `lsp`, `memory_*`, `todo_write`, `workspace_map_read` — **pas** `bash`, `file_edit`, `file_write`.

### Exécutant (sous-run interne, éphemère)

`bash`, `file_edit`, `file_write`, `file_read`, `glob`, `grep`, `lsp` — **pas** `todo_write`, `ask_user_question`, `delegate_executor`, `web_*`, `task`, MCP.

---

## Modèles (settings)

| Rôle | Setting |
|------|---------|
| Architecte | `nexus.drox.architect.model` |
| Exécutant | `nexus.drox.executor.model` (vide → même que l'architecte) |

Activer : `DROX_ORCHESTRATION=v1_2` ou `orchestrationMode: "v1_2"` sur `agent.run`.

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `drox-tools/.../delegate_executor.rs` | Tool LLM |
| `drox-engine/.../orchestration_delegate.rs` | Run exécuteur inline |
| `drox-cli/.../orchestration_run.rs` | Entrée `v1_2` (run architecte seul) |
| `drox-engine/.../orchestration/prompts.rs` | Prompts cycle |
