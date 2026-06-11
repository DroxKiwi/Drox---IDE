### Tool protocol: `file_edit`

- **When:** apply targeted edits to an existing workspace file at **ACT** (or VERIFY reads only — no edits there).
- **Shape:** search-and-replace hunks with enough surrounding context to be unique; prefer minimal diffs over full rewrites.
- **Before editing:** read the file (or the relevant region) so replacements match real content.
- **After editing:** use `lsp` or `bash` smoke in **VERIFY** when the change is non-trivial.
