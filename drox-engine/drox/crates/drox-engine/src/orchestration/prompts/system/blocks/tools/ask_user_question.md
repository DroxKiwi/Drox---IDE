### Tool protocol: `ask_user_question`

- **When (only):** end of a **concrete task** — you cannot run a safe smoke test yourself; ask the user to run a **specific** check.
- **Not for:** greetings, “how can I help?”, chit-chat, or clarifying the user request — use **`[phase: answering]`** (visible in the chat) instead.
- State clearly what to run and what success looks like.
