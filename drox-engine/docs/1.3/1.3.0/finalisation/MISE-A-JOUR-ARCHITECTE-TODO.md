# Mise a jour 1.3.0 - Accompagnement Architecte (todo_write)

**Date** : 2026-05-28  
**Portee** : moteur orchestration (`drox-engine`)  
**Objectif** : reduire les boucles `todo_write` -> `completed` sans verification reelle.

---

## Probleme observe

Sur certains modeles (ex. qwen3.6:27b), l'Architecte tentait de marquer des taches `completed` trop tot, puis retentait la meme action apres refus gate:

- refus `todo_write`: "Task tX cannot be completed yet"
- nouvelle tentative `todo_write completed` sans faire l'action demandee
- repetition de ce schema sur plusieurs tours (`t1`, `t2`, `sanity`, `t4`, ...)

Resultat: perte de tours, confusion et fermeture de cycle retardee.

---

## Correctifs implementes

## 1) Protocole de cloture explicite dans le prompt Architecte

Fichier: `drox-engine/drox/crates/drox-engine/src/orchestration/prompts.rs`

Ajout d'un protocole "no shortcut":

1. `todo_write` -> `in_progress`
2. `delegate_executor` avec le meme `task_id`
3. verification sur disque (`file_read` / `grep` / `lsp`) dans le `scope`
4. seulement ensuite `todo_write` -> `completed`

Le prompt rappelle aussi que `delegate_executor.status = completed` ne suffit pas sans preuve de verification.

## 2) Messages de gate plus actionnables

Fichier: `drox-engine/drox/crates/drox-engine/src/agent/architect_todo_gate.rs`

Les refus `todo_write` incluent maintenant:

- un tag machine-readable: `[completion_block_reasons] ...`
- une section `Next required action` concrete
- une instruction explicite anti-retry premature (`do not retry completed before ...`)

But: transformer un refus generique en prochaine action deterministe.

## 3) Escalade anti-repetition en boucle

Fichier: `drox-engine/drox/crates/drox-engine/src/agent/loop.rs`

Ajout d'un compteur de refus consecutifs sur `todo_write` (completion gate):

- au 2e refus consecutif du meme type, le moteur enrichit le message avec un bloc `[anti-repeat escalation]`
- ce bloc force le modele a executer l'action requise avant toute nouvelle tentative `completed`
- le compteur est reset des qu'un `todo_write` reussit

But: casser la boucle "retry identique" le plus tot possible.

## 4) Bonus - mini table de checkpoint Architecte

Fichier: `drox-engine/drox/crates/drox-engine/src/agent/architect_state.rs`

Le checkpoint cycle expose maintenant une table:

- `task_id`
- `delegated_count`
- `verified`
- `last_status`
- `next_required_action`

But: reduire l'ambiguite sur les runs longs et donner un plan d'action immediat entre deux delegations.

---

## 5) Correctif lot parallèle read-only (régression chat1 plan_1779992707)

Fichier: `drox-engine/drox/crates/drox-engine/src/agent/architect_gates.rs`, `loop.rs`

`file_read` / `grep` / `lsp` passent par le lot **parallèle** (`apply_read_only_tool_success`) qui n'appelait pas `try_mark_verified` — d'où `verified: no` au checkpoint malgré des lectures correctes sur le scope.

Ajout de `architect_record_read_only_tool_success` (ack « Verification recorded » + `verified_task_ids`) sur ce chemin.

---

## Impact attendu

- moins de refus `todo_write` en cascade
- progression plus lineaire task par task
- meilleure robustesse sur modeles moins "strict-following"
- trace checkpoint plus lisible pour debug et replay

---

## Validation suggeree

- scenario reproduction: forcer `todo_write completed` sans delegation/verif et verifier:
  - refus + `Next required action`
  - apparition du bloc `[anti-repeat escalation]` apres repetition
- scenario nominal:
  - `in_progress` -> `delegate_executor` -> verification scope -> `completed`
  - absence de refus, et table checkpoint coherente.
