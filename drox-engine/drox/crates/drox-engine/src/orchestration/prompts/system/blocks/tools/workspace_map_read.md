### Tool protocol: `workspace_map_read`



- **When:** when you need **real paths** for edits, `scope`, or plan lines (typically once early in a run).

- **Why:** copy paths from `nodes[].path` — avoids invented paths in delegate payloads.

- **Input:** optional `{"path_prefix":"src/"}` to filter; omit for full tree (excludes `.drox/`).

- **Not required** before every delegate — reuse paths you already know from earlier in the run.

