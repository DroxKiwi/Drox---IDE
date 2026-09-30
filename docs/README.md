Rédigé à l'aide de Cursor Agent

# Documentation Drox — hub

**Racine doc** : ce dossier (`docs/`), anciennement `drox-engine/docs/`.

| Entrée | Contenu |
|--------|---------|
| **[`pedagogie/`](pedagogie/README.md)** | Guides **accompagnés** (Rust + moteur, ligne à ligne) |
| **[`engine/`](engine/README.md)** | Référence moteur (`tui_mono`) |
| **[`tutorials/ide-navigation.md`](tutorials/ide-navigation.md)** | Navigation dans l’interface IDE |
| **[`operations/`](operations/README.md)** | Build, release Windows/Linux, branches |
| **[`1.5/`](1.5/README.md)** | Plans / clôtures ligne 1.5.x |
| **[`1.4/`](1.4/)** · **[`1.3/`](1.3/)** · **[`1.2/`](1.2/)** · **[`0.0/`](0.0/)** | Historique (archives) |
| **[`feature-brainstorm/`](feature-brainstorm/README.md)** | Idées hors train de release |

Onboarding court racine fork : [`../DROX.md`](../DROX.md) (si présent).

---

## Pédagogie (lecture guidée)

Voir **[`pedagogie/`](pedagogie/README.md)** — série **01 → 14** (socle Ollama, boucle, erreurs, UI, outils, permissions, phases, contexte, sessions, parallélisme, MCP/Explore, hooks, TUI, professor).

---

## Moteur (doc publique de référence)

Voir **[`engine/`](engine/README.md)** :

| Document | Contenu |
|----------|---------|
| [Architecture](engine/architecture-overview.md) | Crates et clients |
| [JSON-RPC](engine/jsonrpc-protocol.md) | Wire NDJSON + schémas |
| [Boucle agent](engine/agent-run-loop.md) | `agent.run` → `drive_inner` |
| [Internes `agent.rs`](engine/agent-internals.md) | Carte du monolithe |
| [Prompts & phases](engine/system-prompts-and-phases.md) | Contrat `[phase:]` |
| [Outils & permissions](engine/tools-and-permissions.md) | Palette, hooks, parallélisme |
| [Sessions & mémoire](engine/sessions-and-memory.md) | JSONL, compaction, archives |
| [Backends LLM](engine/llm-backends.md) | Ollama / OpenAI-compat |
| [MCP & sous-agents](engine/mcp-and-subagents.md) | `mcp__*`, Explore/`task` |
| [Clients TUI vs RPC](engine/clients-tui-vs-rpc.md) | Deux entrées |
| [Intégration IDE](engine/ide-integration.md) | Spawn / bridge |
| [Guide développeur](engine/developer-guide.md) | Build & tests |
| [Migration 1.4](engine/migration-from-1.4.md) | Rail / `role_split` → `tui_mono` |
| [Glossaire](engine/glossary.md) | Lexique |

Carte fonctionnelle historique (audit) : [`1.4/moteur/`](1.4/moteur/README.md) — **archive** ; filtrer `role_split` et chemins obsolètes.

---

## Tutoriels interface

| Guide | Contenu |
|-------|---------|
| [Naviguer dans l’IDE](tutorials/ide-navigation.md) | Surfaces chat, modes, sessions, liens code UI |

---

## Opérations

| Guide | Quand |
|-------|--------|
| [operations/README.md](operations/README.md) | Index ops |
| [00-BUILD-REFERENCE.md](operations/00-BUILD-REFERENCE.md) | Quelle commande lancer |
| [03-RELEASE-WINDOWS.md](operations/03-RELEASE-WINDOWS.md) | Ship Windows |
| [04-RELEASE-LINUX.md](operations/04-RELEASE-LINUX.md) | Ship Linux |

---

## Versions (historique)

| Ligne | Statut |
|-------|--------|
| [1.5/](1.5/README.md) | Active (plans 1.5.20+) |
| [1.4/](1.4/) | Archivée / cartes moteur |
| [1.3/](1.3/README.md) | Figée |
| [1.2/](1.2/) · [0.0/](0.0/) | Archives anciennes |
