# Project rules (Drox)

Cursor-style rules for the local agent. Auto-injected into `agent.run` when they match.

## Location

- Workspace: `.drox/rules/`
- User: `~/.drox/rules/` (workspace id wins on collision)

## Formats

- `*.instructions.md` (preferred, VS Code Customizations)
- `*.mdc` / `*.md` also accepted

## Frontmatter

```yaml
---
description: Short label
alwaysApply: true          # Cursor-style — always inject
applyTo: "**/*.rs,**/*.ts" # or globs: — scoped to open editors / context paths
---
```

| Field | Effect |
|-------|--------|
| `alwaysApply: true` | Always inject |
| `applyTo` / `globs` = `**` | Always inject |
| scoped globs | Inject when an open editor path matches |
| no `alwaysApply` and empty patterns | **Not** auto-injected (edit via Customizations) |

No frontmatter → treated as `alwaysApply: true`.

Budget soft ≈ 12k chars for the annex.

## Setting

`drox.rules.enabled` (default **on**) — also in General settings → **Project rules (.drox/rules)**.

When **off**: no auto-inject into agent runs; Customizations no longer lists `.drox/rules` (no create/edit UI for rules). `DROX.md` / `MEMORY.md` / Skills stay available.
