### Tool protocol: `workspace_map_read`

- **When:** when you need **real paths** for edits or plan lines (typically once early in a run).
- **Why:** copy paths from `nodes[].path` — avoids invented paths.
- **Input:** optional `{"path_prefix":"src/"}` to filter; omit for full tree (excludes `.drox/`).
- Reuse paths you already know from earlier in the run when possible.
