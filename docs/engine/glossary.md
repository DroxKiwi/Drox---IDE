Rédigé à l'aide de Cursor Agent

# Glossaire moteur Drox

| Terme | Définition |
|-------|------------|
| **`tui_mono`** | Pipeline d’orchestration actuel : une boucle agent unique. Annoncé dans `initialize.orchestration_pipeline`. |
| **`drox` / `drox.exe`** | Binaire `drox-cli` : CLI one-shot + serveur `--serve`. |
| **`drox-tui`** | Client terminal in-process sur le même `drox-engine`. |
| **`drive_inner`** | Boucle principale : LLM ↔ tools ↔ nudges jusqu’à done / cancel / plafond. |
| **`AgentConfig`** | Config d’un run (prompt, itérations, permissions, contexte, hooks, parallélisme). |
| **`AgentEvent`** | Événement de run streamé vers le client (`agent/event`). |
| **`Phase` / `[phase:]`** | Marqueur protocole dans le flux modèle (`[phase: answering]`, `[phase: done]`, …). |
| **`RemoteTool`** | Outil exécuté par le client via `tool/exec`, déclaré dans `executableTools`. |
| **`executableTools`** | Liste handshake des outils remote IDE. |
| **NDJSON** | Une requête/réponse JSON par ligne sur stdio (pas de `Content-Length`). |
| **`PROTOCOL_VERSION`** | `"1.0"` — version du contrat JSON-RPC Drox. |
| **Nudge** | Message système injecté quand le modèle dévie (sans done, todos ouverts, boucle…). |
| **Gate** | Condition moteur qui bloque un tool ou refuse `done` (todo avant mutation, testing, professor…). |
| **LoopDetector** | Fingerprint anti-répétition ; 3 tours identiques → abort. |
| **Compaction / snip** | Réduction d’historique pour le budget tokens (`ContextSnip`, `ContextCompacted`). |
| **Memdir / session notes** | Mémoire locale projet ou session. |
| **`.drox/memory/sessions/`** | Archives auto (plan clos + fin de run). |
| **`rail_station_*`** | Événements UI hérités ; souvent **synthétisés** par le shim depuis les phases. |
| **`role_split`** | Ancien pipeline Architecte/Exécuteur — **obsolète**. |
| **`task` / Explore** | Sous-agent read-only pour cartographier un large périmètre. |
| **`mcp__*`** | Préfixe des outils issus de serveurs MCP. |
| **Ollama-first** | Inférence locale par défaut ; OpenAI-compat pour d’autres endpoints. |
| **Hooks** | `.drox/hooks.json` — commandes pre/post tool. |
| **PermissionMode** | `default` \| `plan` \| `acceptEdits` \| `bypassPermissions` \| `professor` (**enum Rust** ; `professor` **non exposé** de façon fiable dans l’IDE — downgrade 1.4.0). |

Pour l’historique des releases : `docs/1.5/`, `docs/1.4/`, etc.
