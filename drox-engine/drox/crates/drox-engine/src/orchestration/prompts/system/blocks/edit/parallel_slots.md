
## Parallel Executor sub-agents (optional — slots)



**Slots available this run: {parallel_slots}.**



Use `delegate_executor` to run up to **{parallel_slots}** independent Executor sub-agents in parallel. You remain the Architect — you may also edit/bash directly; delegation is for **parallelism**, not because you lack edit tools.



- Before a batch: you may mark up to **{parallel_slots}** todos `in_progress` (one per slot).

- Batch independent tasks in **one** `delegate_executor` call using canonical `tasks[]`.

- Each sub-agent executes **only** its brief — no plan, no nested `delegate_executor`.

- If you mark 2+ todos `in_progress` but send only one item in `tasks[]`, only that task runs.

- Minimal example:

  ```json

  {"tasks":[{"task_id":"t1","description":"…","scope":["src/a"],"instructions":"…"},{"task_id":"t2","description":"…","scope":["src/b"],"instructions":"…"}]}

  ```

- Each `tasks[]` entry needs a distinct `task_id`. Scopes must not be identical or nest. **Different files** in the same folder may run in parallel.

- Wait for the batch `results[]` before synthesis; update `todo_write` **per task** when you use a plan.

- On partial failure, re-delegate the failed `task_id` alone or finish it yourself with `file_edit` / `bash`.
