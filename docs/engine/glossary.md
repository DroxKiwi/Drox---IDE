# Glossaire moteur Drox

| Terme | Définition |
|-------|------------|
| **`tui_mono`** | Pipeline actuel : une boucle `Agent::run`. Handshake `orchestrationPipeline`. |
| **`EngineProfile`** | `local-9b` · `local-27b` · `cloud-full` — knobs parent (CORE, outils, clôture). RPC `engineProfile`. |
| **`drox` / `drox.exe`** | Binaire `drox-cli` (`--serve`, CLI one-shot). |
| **`drox-tui`** | Client terminal in-process sur `drox-engine`. |
| **`drive_inner`** | Boucle principale dans [`agent/run/drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs). |
| **`AgentConfig`** | Config run : prompt, itérations, permissions, **`engine_profile`**, hooks, parallélisme, … |
| **`AgentEvent`** | Événement streamé (`agent/event`). |
| **`Phase` / `[phase:]`** | Marqueurs protocole (`answering`, `done`, `testing`, …). |
| **`drox-prompts`** | Crate catalogue textes injectés (CORE, gates, runtime, Explore, tools). |
| **`RemoteTool`** | Outil client via `tool/exec` (`executableTools`). |
| **NDJSON** | JSON + `\n` sur stdio. |
| **`PROTOCOL_VERSION`** | `"1.0"`. |
| **`rpc_types.rs`** | DTO wire JSON-RPC (`AgentRunParams`, …). |
| **Nudge** | `Message::system` de relance (done, testing, loop, local, …). |
| **Gate** | Blocage tool ou refus `done` (todo, testing, professor, …). |
| **LoopDetector** | Anti-répétition → Warn · ForceConclude · **SyntheticDone** (souvent Stop propre). |
| **Situation card** | Bloc system réécrit chaque tour (état court du run). |
| **Tool result spill** | Externalise / stub gros résultats outil (contexte). |
| **Compaction / snip** | Réduction historique (`ContextSnip`, `ContextCompacted`). |
| **`.drox/memory/sessions/`** | Archives auto post-run / plan clos. |
| **`rail_station_*`** | UI legacy ; shim depuis phases. |
| **`role_split`** | Ancien Architecte/Exécuteur — **obsolète**. |
| **`task` / Explore** | Sous-run read-only ; `explore_index_list` / `explore_artifact_read` côté parent. |
| **`mcp__*`** | Tools MCP dynamiques. |
| **`codebase_search`** | Retrieval index workspace (souvent remote IDE). |
| **Hooks** | `.drox/hooks.json` pre/post tool. |
| **`PermissionPolicy`** | Pont run permissions (`agent_permissions`). |
| **Codebase / RAG** | Index `{root}/.drox/codebase-index/` — [codebase-and-rag.md](codebase-and-rag.md). |
| **Regulation** | Notes L1–L5 IDE — [model-regulation.md](model-regulation.md). |

Historique releases : `docs/1.5/`, `docs/1.4/`.
