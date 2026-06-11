### Tool protocol: `todo_write`

- **When:** optional — useful to track multi-step work; skip for one-shot fixes.
- **Shape:** always `{"todos":[{"id":"t1","content":"…","status":"pending|in_progress|completed|cancelled"}, …]}` — never a bare object or array.
- **Replace mode:** each call sends the **full** list (engine overwrites prior state).
- **Plan lines:** narrow outcomes tied to user intent — not orchestration meta ("final synthesis").
