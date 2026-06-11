# Carte globale — un run de bout en bout

Vue synthétique pour situer les 11 dossiers fonctionnels.

---

## Séquence : utilisateur → réponse

```mermaid
sequenceDiagram
    participant U as Utilisateur / IDE
    participant RPC as drox-cli jsonrpc
    participant OR as orchestration_run
    participant A as Agent drive_inner
    participant LLM as drox-llm
    participant T as drox-tools

    U->>RPC: agent.run (role_split)
    RPC->>OR: discuss ou edit ?
    OR->>A: AgentConfig + system prompt
    loop Chaque tour
        A->>A: snapshot + context snip/compact
        A->>LLM: messages + tool specs
        LLM-->>A: text + tool_calls
        alt tool_calls
            A->>A: gates + permissions + run_rail pre_gate
            A->>T: execute (local ou remote)
            T-->>A: tool_result
        else pas d'outil
            A->>A: nudges ou clôture
        end
    end
    A->>RPC: AgentEvent stream
    RPC-->>U: notifications agent/event, agent/done
```

---

## Où vit quoi (crates)

```text
drox-cli/          → 01 entree-wire
drox-engine/
  agent/loop/      → 02 boucle-agent
  orchestration/   → 03 orchestration-prompts
  permissions.rs   → 05 permissions-hooks
  compaction.rs    → 06 contexte-memoire
  subagent.rs      → 07 sous-agents
  agent/gates.rs   → 08 gates-nudges-etat
  agent/run_rail/  → 09 run-rail
  event.rs         → 10 evenements-phases
drox-tools/        → 04 tools
drox-llm/          → 11 crates-workspace
drox-session/      → 06 contexte-memoire
drox-context/      → 06 contexte-memoire
drox-permissions/  → 05 permissions-hooks
drox-types/        → 11 crates-workspace (contrats)
```

---

## Rôles (`RunSpec`)

| `RoleId` | Usage | Allowlist |
|----------|-------|-----------|
| `Architect` | Edit repo, plan, délégation | `ARCHITECT_TOOL_ALLOWLIST` |
| `ArchitectDiscussion` | Discuss / analyze, lecture seule | `ARCHITECT_DISCUSSION_TOOL_ALLOWLIST` |
| `Executor` | Shard délégué | `EXECUTOR_TOOL_ALLOWLIST` |
| `Standard` | CLI one-shot, professor | registry filtré |

Détail : [03-orchestration-prompts](03-orchestration-prompts/README.md), `run_spec/mod.rs`.

---

## Deux « conducteurs » à ne pas confondre

| Couche | Rôle | Dossier |
|--------|------|---------|
| **Boucle 1.3** | Gates réactives, nudges, phases, todos, anti-boucle | 02 + 08 |
| **Run rail 1.4.0** | Stations linéaires, pre_gate par station, segments ACT | 09 |

Les deux coexistent aujourd’hui quand `runRailEnabled` est actif sur un run architect **edit**. C’est une source de complexité documentée dans l’audit smoke ([chat_qwen27b](../../1.3/chat_qwen27b.txt)).

---

## Point d’entrée code unique

Tout run agent passe par :

```text
drox-engine/src/agent/core/agent.rs   Agent::run()
    → agent/loop/drive.rs             drive_inner()   [boucle principale]
```

Si tu ne lis qu’un fichier après cette carte : **`drive.rs`** (structure, pas ligne par ligne).
