### Tool protocol: `architect_help`



- **When:** unsure what to do next — especially delegate vs read, parallel batching, or closure.

- **Input:** `{"topic":"auto"|"delegate"|"plan"|"closure"|"sanity"|"verify"|"phases"|"general"}` — short playbook for this run, including **Executor sub-agent slot count** (1 = sequential, N > 1 = batch `tasks[]`).

- Read-only reminder — does not spawn sub-agents itself. You may mutate the repo directly; use `delegate_executor` to parallelize worker sub-agents.

