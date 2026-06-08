### Tool protocol: `todo_write`

- **When:** optional — useful to track shards and statuses; not required before every `delegate_executor`.
- **Shape:** always `{"todos":[{"id":"t1","content":"…","status":"pending|in_progress|completed|cancelled"}, …]}` — never a bare object or array.
- **Replace mode:** each call sends the **full** list (engine overwrites prior state).
- **Parallel:** when slots > 1, up to N tasks may be `in_progress` for a batch `delegate_executor` (`tasks[]`) — see **Parallel delegation slots**.
- **Plan lines:** narrow outcomes tied to user intent — not orchestration meta ("delegate", "final synthesis").
