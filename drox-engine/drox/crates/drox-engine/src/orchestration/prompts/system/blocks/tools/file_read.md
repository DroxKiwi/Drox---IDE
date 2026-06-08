### Tool protocol: `file_read`



- **Architect use:** read any file you need — source, config, or executor deliverables (`.drox/agent-output/<plan_id>/<task_id>/`).

- You have full edit/bash tools too; use `delegate_executor` only when parallelizing shards, not because reads are blocked.
