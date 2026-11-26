# Documentation Drox

Ce dossier est la doc du produit. Les notes de travail par version (plans, diagnostics, passations) restent sur la machine et ne sont pas dans git.

| Entrée | Contenu |
|--------|---------|
| [Notes de mise à jour](releases-notes/latest.md) | Ce qui change dans la version en cours |
| [Tutoriels](tutorials/README.md) | IDE, chat, Codebase, régulation, SDTCM, Traffic, Ports |
| [Moteur](engine/README.md) | Référence du moteur (`tui_mono`) |
| [Pédagogie](pedagogie/README.md) | Lecture guidée du moteur, ligne à ligne |

## Moteur

| Document | Contenu |
|----------|---------|
| [Architecture](engine/architecture-overview.md) | Crates et clients |
| [JSON-RPC](engine/jsonrpc-protocol.md) | Wire NDJSON |
| [Boucle agent](engine/agent-run-loop.md) | `agent.run` |
| [Internes](engine/agent-internals.md) | Profils, gates, anti-boucle |
| [Prompts et phases](engine/system-prompts-and-phases.md) | Marqueurs `[phase:]` |
| [Outils et permissions](engine/tools-and-permissions.md) | Palette, hooks |
| [Sessions et mémoire](engine/sessions-and-memory.md) | JSONL, compaction |
| [Backends](engine/llm-backends.md) | Ollama et OpenAI-compatible |
| [MCP et sous-agents](engine/mcp-and-subagents.md) | Explore, `task` |
| [Clients](engine/clients-tui-vs-rpc.md) | TUI et RPC |
| [Intégration IDE](engine/ide-integration.md) | Spawn et bridge |
| [Régulation](engine/model-regulation.md) | Notes L1–L5 |
| [Codebase](engine/codebase-and-rag.md) | Index local |
| [Guide développeur](engine/developer-guide.md) | Build et tests |
| [Glossaire](engine/glossary.md) | Lexique |
