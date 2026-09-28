# 06 — Contexte & mémoire

**Question** : comment le moteur tient dans la fenêtre de contexte et persiste les runs ?

---

## Rôle

Gestion **tokens** : budget, snip des gros `tool_result`, compaction LLM du préfixe ; persistance **session** JSONL, mémoire long terme, résumés de run.

---

## Crates & fichiers

| Emplacement | Rôle |
|-------------|------|
| `drox-context/` | Comptage tokens, snip, microcompact |
| `drox-engine/src/context.rs` | `ContextPolicy` dans `AgentConfig` |
| `drox-engine/src/agent/loop/context.rs` | `maybe_snip` avant chaque tour LLM |
| `drox-engine/src/compaction.rs` | Compaction live + `summarize_run` fin de run |
| `drox-engine/src/memory.rs` | `MemoryRuntime`, orchestration compaction |
| `drox-session/` | Transcripts, memdir, `MEMORY.md` |
| `drox-engine/src/long_memory.rs` | Types chunks mémoire long terme |
| Tools `session_*` | `session_compact`, `session_note`, `session_search` |

---

## Avant chaque tour LLM

```text
count_tokens(messages)
  → si au-dessus budget :
      microcompact (vider vieux tool_result)
      → snip (tronquer blocs)
      → live compact LLM (résumé préfixe → checkpoint system)
      → ré-injecter snapshot architecte post-compact
```

---

## Fin de run

`closure.rs` → `summarize_run` si run non trivial → fichier sous `.drox/memory/sessions/`.

---

## Session IDE

RPC `session.list` / `session.read` — replay du journal UI. Lié aux bugs replay lents ([SMOKE-BACKLOG](../archive/1.4.0/SMOKE-BACKLOG.md)).

---

## Liens

- [MEMOIRE-LONG-TERME](../../../0.0/architecture/MEMOIRE-LONG-TERME.md)
- [GUIDE-MOTEUR-DROX](../../../0.0/guides/GUIDE-MOTEUR-DROX.md)
- Boucle : [02-boucle-agent](../02-boucle-agent/README.md)
