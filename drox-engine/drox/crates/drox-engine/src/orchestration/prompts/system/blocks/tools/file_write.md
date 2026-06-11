### Tool protocol: `file_write`

- **When:** create a new file or replace an entire file when patch edits are impractical — **ACT** station only.
- **Paths:** use real workspace paths (from `workspace_map_read`, `glob`, or prior reads); do not invent directories.
- **Content:** write complete, valid file bodies; keep scope aligned with the user request.
- **Prefer `file_edit`** for small changes to existing files.
