# Résilience — absorption des échecs sub-agent (1.3.0)

**Date** : 2026-05-27  
**Source** : `drox-engine/docs/1.2.0/retour_discussion/chat1` (réflexion architecte + smoke site-kdds)  
**Statut** : conception — à valider avant implémentation

---

## 1. Diagnostic `chat1`

### A. Faux `completed` — la chaîne ment sans planter

**Exemple smoke (t1, hook souris)** :

1. Exécuteur retourne `status: completed`, `verified: yes`.
2. Rapport : « Created `app-kdds-main/src/lib/use-mouse-position.ts` ».
3. Architecte `file_read` sur ce chemin → **fichier introuvable** (os error 2).
4. Re-délégation → succès au 2e essai.

**Cause racine** : le Contrat A considère **`completed`** si un `.md` ≥ 64 octets existe sous `.drox/agent-output/<plan_id>/<task_id>/`, **même quand le livrable réel** (fichier source dans `scope`) **n'existe pas**.

```text
disk_ok (.md agent-output)  →  status Completed
                         →  verified_task_ids auto-rempli
                         →  gate todo completed OK sans file_read sur scope
```

L'exécuteur peut écrire **uniquement** le rapport dans `agent-output` et le moteur clôt en `completed`. C'est le bug le plus dangereux : pas de crash, mais **confiance illégitime**.

### B. Gates correctes mais coût cognitif

| Gate | Effet observé |
|------|----------------|
| `workspace_map_read` avant delegate | Plusieurs `ERROR` puis recovery (OK) |
| Scope pas dans la carte | `app-kdds-main/src/components` rejeté → retry avec chemin fichier |
| Re-delegate cap (2×) | Bloque après 2 tentatives — architecte doit verify |
| `todo completed` sans delegate | t4 « Résumé utilisateur » bloqué — gate trop stricte pour tâches **meta** |

### C. Architecte qui n'arrive pas à clôturer

En tête de `chat1` et en fin de smoke lampe torche :

- Boucles `#[phase: done]` répétées (« nothing left to do ») alors que le run continue.
- `todo_write { todos: [] }` → erreur « needs at least one non-empty todo item ».
- Tâche « résumé » marquée `completed` sans `delegate_executor` → gate bloque.

**Cause** : pas de signal moteur clair « run terminable » ; le modèle improvise la clôture avec des outils inadaptés.

### D. Effet utilisateur : « toute la chaîne tombe »

Quand un sub-agent **échoue** ou **ment** (`completed` faux) :

- L'architecte entre en mode compensation (verify / re-delegate) — **correct en théorie**.
- Mais sans **paquet d'échec structuré**, il re-planifie à l'aveugle, re-lit la carte, ou boucle sur `[phase: done]`.
- L'UI donne l'impression d'un blocage (run long, plans qui se répètent, réponses finales dupliquées).

---

## 2. Principe produit

> **Un échec exécuteur ne doit jamais être une fin de chaîne. C'est un événement normal du cycle architecte.**

```text
Delegate → (completed | partial | failed | blocked)
         → Verify vérité terrain (scope + agent-output)
         → Si OK : todo completed, tâche suivante
         → Si KO : FailurePacket → replan (même plan ou todo scindé) → re-delegate
         → Quand plan épuisé ou bloqué utilisateur : [phase: answering] puis done
```

L'architecte **ne compense pas** en faisant le travail lui-même ; il **reprogramme** avec l'état actuel du code et des tâches.

---

## 3. Contrat de vérité (fix P0)

### 3.1 Deux types de tâches

| Type | Exemple plan | Critère `completed` |
|------|--------------|---------------------|
| **Mutation** | Créer/modifier `src/.../foo.tsx` | Au moins un chemin du `scope` **existe sur disque** et correspond au brief (taille > 0, ou diff appliqué) |
| **Lecture / analyse** | Lister deps, décrire structure | Livrable `.md` agent-output **ou** verify read-only sur scope |

### 3.2 Règles moteur

1. **`finalize_delegate_result`** : `Completed` **uniquement si** :
   - `disk_ok` **et** (`mutation_ok` **ou** tâche classée read-only), **ou**
   - verify explicite post-delegate a réussi.
2. **`record_delegate_result`** : **ne plus** auto-remplir `verified_task_ids` sur `status == Completed` seul.
3. **Gate `todo completed`** : exiger `verified_task_ids` **toujours** (y compris après completed delegate).
4. **Checkpoint architecte** enrichi :

```text
## Delegation result · t1
- Status: partial (report claimed completed; scope file MISSING)
- Scope: app-kdds-main/src/lib/use-mouse-position.ts — NOT FOUND
- Agent-output: .drox/agent-output/plan_X/t1/....md — present (441 bytes)
- Recovery: re-delegate with explicit file_write to scope path; do not mark completed
```

### 3.3 Vérification automatique post-delegate (option P0b)

Après chaque `delegate_executor`, le moteur exécute **sans LLM** :

```rust
fn post_delegate_truth_check(scope_paths, workspace) -> TruthCheck {
    // mutation: all scope files exist?
    // read-only: agent-output md exists?
}
```

Si mismatch → forcer `status` wire à `partial` même si le modèle a dit completed.

---

## 4. FailurePacket — absorber l'échec

Structure injectée dans le **tool result** `delegate_executor` et le **checkpoint** :

```json
{
  "taskId": "t1",
  "status": "partial",
  "verified": false,
  "failure": {
    "kind": "deliverable_missing",
    "summary": "Report claimed file created; scope path not on disk",
    "scope_checked": [
      { "path": "app-kdds-main/src/lib/use-mouse-position.ts", "exists": false }
    ],
    "agent_output": ".drox/agent-output/plan_X/t1/....md",
    "iterations_used": 1,
    "recovery_hints": [
      "Re-delegate t1 with instructions: file_write ONLY to scope path",
      "Or split t1 into t1a (create file) + t1b (verify imports)"
    ]
  },
  "reportMarkdown": "## Executor report · t1\n..."
}
```

L'architecte reçoit **toujours** un JSON parseable — jamais un crash ni un vide.

### Statuts et transitions autorisées

| Status | Architecte peut |
|--------|-------------------|
| `completed` + verified | `todo_write` completed → tâche suivante |
| `partial` | verify scope, **1×** re-delegate même task_id, ou scinder todo |
| `failed` | re-delegate (si cap < 2), ou `ask_user_question` |
| `blocked` | `todo_write` scinder / `ask_user_question` — pas re-delegate identique |

---

## 5. Reprogrammation intelligente (architecte)

### 5.1 Prompt checkpoint (remplace le checkpoint actuel)

Après chaque délégation **non vérifiée** :

```text
## Architect — recovery required (task t1)
Last delegate: partial — scope file missing after "completed" report.
Current plan: t1 in_progress, t2–t3 pending.
Do ONE of:
1. Re-delegate t1 with narrower brief (exact path, file_write required).
2. Split t1 → t1a (create file) + t1b (wire import) in todo_write, then delegate t1a.
3. ask_user_question ONLY if scope is ambiguous.
Forbidden: mark t1 completed; glob the whole repo; re-read workspace_map unless map stale.
```

### 5.2 Contexte « état actuel » injecté

Avant re-delegate, le moteur peut ajouter (read-only, sans LLM) :

- Liste des fichiers `scope` existants / manquants.
- Extrait du dernier rapport agent-output (600 car max — déjà fait).
- Compteur re-delegate restant (`2 - attempts`).

### 5.3 Tâches meta (résumé, synthèse)

Les todos **sans mutation** ne passent **pas** par `delegate_executor` :

| Label interdit en todo | Remplacement |
|------------------------|--------------|
| « Synthèse utilisateur », « Rapport final » | Pas de todo — directement `[phase: answering]` |
| « Résumé utilisateur fourni » | Gate : todo type `meta` → `completed` sans delegate |

Gate : `todo_write` avec contenu matchant `SYNTHESIS_TODO_PATTERN` → `completed` autorisé sans delegate si **toutes** les tâches mutation/read sont déjà verified.

---

## 6. Clôture de run (fix boucles `[phase: done]`)

### 6.1 Signal moteur `run_closable`

```text
run_closable = all todos terminal (completed|cancelled)
              AND all delegated tasks verified
              AND no active subagent
```

Quand `run_closable`, injecter **une seule fois** :

```text
[NUDGE] All tasks verified. Emit [phase: answering] with user summary, then [phase: done]. Do not call todo_write or delegate_executor.
```

### 6.2 Auto-done optionnel (P1)

Si l'architecte émet 3× `[phase: done]` sans outil en N tours → moteur force `agent/done` côté CLI (comme fix v1_2 déjà fait pour busy).

### 6.3 `todo_write` vide

Autoriser `{ "todos": [] }` quand `run_closable` (no-op) au lieu d'erreur.

---

## 7. UI (rappel 1.3.0)

| Élément | Comportement |
|---------|--------------|
| Carte exécuteur `partial` / `failed` | Badge visible, rapport court, **pas** masqué |
| Plan | Todo reste `in_progress` ou repasse `pending` après échec |
| Indicateur activité | Reste sur la carte jusqu'à `subagentDone` |
| Message utilisateur final | Mentionne les tâches échouées / retentées si pertinent |

---

## 8. Plan d'implémentation

| Phase | Livrable | Fichiers |
|-------|----------|----------|
| **R0** | `post_delegate_truth_check` + downgrade completed→partial | `delegate_report.rs`, `orchestration_delegate.rs`, `architect_state.rs` |
| **R1** | FailurePacket dans JSON delegate + checkpoint | `orchestration_delegate.rs`, `architect_state.rs`, `prompts.rs` |
| **R2** | Pas d'auto-verify sur completed seul | `architect_state.rs`, `architect_gates.rs` |
| **R3** | Todos meta + `run_closable` nudge | `architect_gates.rs`, `nudges.rs`, `loop.rs` |
| **R4** | Tests : completed+fichier absent → partial ; recovery re-delegate | `delegate_report.rs`, `architect_state.rs` |

**Ordre** : R0 → R1 → R2 (bloquant avant parallélisation P4).

---

## 9. Critères d'acceptation (rejouer chat1)

| # | Scénario | Attendu |
|---|----------|---------|
| 1 | Exécuteur écrit seulement `.md` agent-output | Status wire `partial`, todo **pas** completed |
| 2 | Architecte file_read scope absent | Checkpoint « recovery required », re-delegate guidé |
| 3 | 2e delegate OK | t1 completed, chaîne continue vers t2 |
| 4 | Sub-agent failed (engine error) | FailurePacket, architecte propose retry ou ask_user |
| 5 | Toutes tâches OK | Un seul `[phase: answering]`, pas 5× `[phase: done]` |
| 6 | Todo « résumé » | Pas de gate delegate obligatoire |

---

## 10. Hors scope 1.3.0

- Retry automatique sans architecte (auto re-delegate silencieux).
- Parallélisation (P4) — après R0–R2 stables.
- Rollback git des fichiers modifiés par exécuteur raté.

---

## Références

- [ARCHITECT-STATE-MACHINE.md](../../1.2.0/steps/08-architect-state/ARCHITECT-STATE-MACHINE.md)
- [VISION-CONSOLIDEE-1.3.0.md](../01-vision/VISION-CONSOLIDEE-1.3.0.md)
- [chat1](../../1.2.0/retour_discussion/chat1)
