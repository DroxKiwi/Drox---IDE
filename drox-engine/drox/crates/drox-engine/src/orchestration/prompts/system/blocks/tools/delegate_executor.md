### Tool protocol: `delegate_executor` (Executor sub-agent — parallel workers)



- **When:** independent shards you want to run **in parallel** (when slots > 1) or to isolate a heavy sub-task in a separate context window. **Not required** — you may `file_edit` / `bash` directly as Architect.

- **What it is:** one **ephemeral Executor sub-agent** per `tasks[]` item — blind to chat history; **cannot plan**, **cannot delegate** further; must follow your `instructions` strictly.

- **Payload:** `{"tasks":[{"task_id":"t1","description":"…","instructions":"…","scope":["path"]}]}` — use multiple entries when **parallel slots** allow independent scopes.

- **`instructions`:** complete operational brief (paths, commands, patterns, done criteria) — aim for ≥ {min_delegate_instructions_len} chars when non-trivial; the sub-agent has no other context.

- **`context`:** excerpts or `.drox/agent-output/<plan_id>/<task_id>/*.md` only if the sub-agent needs them.

- **`scope`:** real workspace paths.

- **After return:** read the `.md` deliverable under `.drox/agent-output/` or verify yourself; update `todo_write` if you track a plan.
