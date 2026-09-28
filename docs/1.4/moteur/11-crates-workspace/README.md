# 11 — Crates workspace (satellites)

**Question** : quelles crates entourent `drox-engine` et à quoi servent-elles ?

---

## Graphe

```text
                    drox-cli
                       │
                       ▼
                  drox-engine ─────┬──── drox-tools
                       │           ├──── drox-llm
                       │           ├──── drox-context
                       │           ├──── drox-session
                       │           ├──── drox-permissions
                       │           ├──── drox-hooks
                       │           └──── drox-mcp (via tools)
                       │
                  drox-types ◄──── (toutes les crates)
                  drox-bash  ◄──── permissions + bash tool
```

---

## Crates

| Crate | Rôle | Doc moteur |
|-------|------|------------|
| **drox-types** | Messages, rôles, IDs — contrats purs | 10-evenements-phases |
| **drox-llm** | Client Ollama/OpenAI-compatible, streaming | 02-boucle-agent |
| **drox-tools** | Implémentations tools + registry | 04-tools |
| **drox-session** | JSONL transcripts, memdir | 06-contexte-memoire |
| **drox-context** | Token budget, snip | 06-contexte-memoire |
| **drox-permissions** | Allow/ask/deny | 05-permissions-hooks |
| **drox-bash** | Analyse commandes shell | 05-permissions-hooks |
| **drox-hooks** | Hooks pre/post tool | 05-permissions-hooks |
| **drox-mcp** | Hub MCP rmcp | 04-tools |
| **drox-cli** | Binaire + JSON-RPC | 01-entree-wire |
| **drox-engine** | Orchestration agent | 02 + 03 + 08 + 09 |

---

## Workspace Cargo

Racine : `drox-engine/drox/Cargo.toml` — workspace members = crates ci-dessus.

Tests : `cargo test -p drox-engine` (gros module `agent/tests/mod.rs` ~3000 lignes).

---

## Liens

- [INVENTAIRE-NOYAU-MOTEUR](../../../0.0/architecture/INVENTAIRE-NOYAU-MOTEUR.md)
- [PLAN-MOTEUR-RUST](../../../0.0/plans/PLAN-MOTEUR-RUST.md)
- Hub : [moteur/README.md](../README.md)
