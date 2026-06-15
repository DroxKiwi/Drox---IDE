### Tool protocol: `file_edit`

- **When:** apply targeted edits to an existing workspace file at **ACT** (or VERIFY reads only — no edits there).
- **Shape:** search-and-replace hunks with enough surrounding context to be unique; prefer minimal diffs over full rewrites.
- **Before editing:** read the file (or the relevant region) so replacements match real content.
- **After editing:** use `lsp` or `bash` smoke in **VERIFY** when the change is non-trivial.

**Required JSON** (top-level `path` + `edits` array — do not put `path` inside each edit):

```json
{
  "path": "app/src/components/home-content.tsx",
  "edits": [
    {
      "old_string": "import SectionTransition from \"@/components/section-transition\";\n",
      "new_string": "import AnimatedBackground from \"@/components/animated-background\";\nimport SectionTransition from \"@/components/section-transition\";\n"
    }
  ]
}
```

- Each edit needs **`old_string`** and **`new_string`** (exact text from the file).
- Do **not** use `op`, `replace`, or per-edit `path` — only `old_string` / `new_string` (optional `replace_all: true`).
- For several hunks, append more objects to `edits` in order.
- If many scattered changes are needed, prefer one `file_write` after `file_read` instead of empty or malformed `edits`.
