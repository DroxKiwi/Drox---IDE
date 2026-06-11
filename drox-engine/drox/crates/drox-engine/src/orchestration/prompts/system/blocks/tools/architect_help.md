### Tool protocol: `architect_help`

- **When:** unsure what to do next — especially plan, verify, or closure.
- **Input:** `{"topic":"auto"|"plan"|"closure"|"verify"|"phases"|"general"}` — short playbook for this run.
- Read-only reminder — does not run tools itself. Work directly with `file_edit`, `bash`, `grep`, `file_read`, etc.
