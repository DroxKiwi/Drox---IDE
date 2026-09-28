# 03 — Orchestration & prompts

**Question** : comment le moteur choisit le **rôle**, le **system prompt** et le **comportement** du run ?

---

## Rôle

Couche **C** du moteur : multi-rôles (`role_split`), assemblage des prompts, tuning strictness, routage discuss vs edit. Le modèle reçoit ici ses instructions métier.

---

## Fichiers clés

| Zone | Fichiers |
|------|----------|
| Routage run | `orchestration/architect_gate.rs`, `start_run.rs` |
| Handler RPC | `drox-cli/.../orchestration_run.rs` |
| Tuning | `orchestration/tuning/` — `EngineTuning`, presets, `runRailEnabled` |
| Contrat run | `run_spec/mod.rs` — `RoleId`, allowlists outils, `GateKind` |
| Prompts Rust | `orchestration/prompts/mod.rs`, `architect_edit.rs`, `executor.rs` |
| Blocs `.md` | `orchestration/prompts/system/blocks/edit/` (`01_core_rail.md`, `01_core_solo.md`) |
| Protocoles tools | `orchestration/prompts/system/blocks/tools/` (`T-*`) |
| Gates prompt | `orchestration/prompts/system/gates/discuss.rs`, `edit.rs` |
| Snapshot injecté | `orchestration/prompts/system/context/run_snapshot.rs` |
| Boot edit | `agent/edit_start.rs` |
| État run | `agent/architect_state.rs` — plan, focus, delegates |

---

## Modes `role_split`

| Mode RPC | Rôle | Prompt gate |
|----------|------|-------------|
| `discuss` / `analyze` | `ArchitectDiscussion` | `discuss.rs` + G2 |
| `edit` | `Architect` | `edit.rs` + core + `T-*` tools |
| (via tool) | `Executor` | `EXECUTOR_SYSTEM_PROMPT` |

Heuristique si mode non précisé : `architect_gate.rs`.

---

## Assemblage prompt edit (boot)

```text
edit::core(vars)           → 01_core_rail | 01_core | 01_core_solo
+ tool_supplements_all     → todo_write, file_read, grep, … (pas file_edit!)
+ parallel_slots (option)
+ literal user message block
```

Le **registry API** expose quand même `file_edit` / `file_write` via `build_tool_specs` — écart doc/code à connaître pour l’audit.

---

## `EngineTuning` (extraits)

Flags qui changent le comportement sans toucher au prompt : `run_rail_enabled`, `loop_strikes_before_abort`, gates L1–L5, caps lecture/délégation, compaction.

---

## Liens

- [CONDUCTEUR-CODE](../../../1.3/1.3.2/CONDUCTEUR-CODE.md)
- [10-parametrage-prompts-strictesse](../../../feature-brainstorm/10-parametrage-prompts-strictesse.md)
- État injecté : [08-gates-nudges-etat](../08-gates-nudges-etat/README.md)
