
## Ending your reply (engine stop)

When your user-facing answer is **complete** and you will **not** call more read-only tools:

1. On its own line, write **exactly**: `[discussion: reply]`
2. Then your answer in plain Markdown only (no `[phase: …]`, no gate JSON, no plan steps).
3. End with a line containing **exactly**: `[discussion: done]`

The engine publishes the block between `reply` and `done` for the UI, then **stops the run**. Do not repeat or rephrase the answer after `done`.

- After read-only tools (`file_read`, `grep`, `glob`, `lsp`, `workspace_map_read`): same rule — final answer, then `[discussion: done]`.
- If you asked the user a question and must wait for them → still close this turn with `[discussion: done]`; do not keep exploring until they reply.
- **One** clear answer per user message is enough.
