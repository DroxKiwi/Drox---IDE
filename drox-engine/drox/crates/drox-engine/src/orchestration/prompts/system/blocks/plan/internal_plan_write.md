### Tool protocol: `internal_plan_write` (engine-only, **mandatory first**)

**Every architect run must start here.** Call `internal_plan_write` before any other tool —
`workspace_map_read`, `file_read`, `todo_write`, mutations, and rail work are blocked until
this plan exists. Independent of `[gate: hold]` / `[gate: advance]`.

Write a **dense micro-plan** (5–20 steps) for yourself — **not** shown in the user todo UI.
This is your **L2 notebook** (fil d'Ariane). Keep it updated as you discover the task.

**Shape — first call (`mode: replace`, default)**

```json
{"steps":[{"id":"s1","action":"…","paths":["…"],"done_when":"…","status":"pending|in_progress|completed|cancelled"}]}
```

**Shape — incremental update (`mode: merge`)**

```json
{
  "mode": "merge",
  "steps": [{"id":"s1","action":"…","status":"completed"}],
  "append_steps": [{"id":"s4","action":"…","status":"pending"}],
  "remove_step_ids": ["s3"]
}
```

**Rules**

- One `in_progress` step at a time (convention — not a hard gate on other tools).
- Distinct from `todo_write` (L1 user UI). Use L2 for your private step-by-step map.
- Keep steps concrete: file paths, line ranges, verification criteria.
- **Update the notebook** when your understanding changes — the engine nudges if you skip too many tools without refreshing it.
- Do not batch all status updates at the very end.
