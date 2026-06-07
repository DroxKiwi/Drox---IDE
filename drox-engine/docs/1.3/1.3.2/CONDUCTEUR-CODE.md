# Conducteur moteur — carte du code (1.3.2 stabilisé)

**Statut** : référence dev — **à jour juin 2026** après simplification moteur.  
**Historique gates TOML / paliers `E-*` / backpack** : [gates/ARCHIVE.md](gates/ARCHIVE.md) (obsolète).

---

## Une phrase

**Routage léger (RPC)** → **run discuss ou edit** → **prompt core + T-*** → **boucle LLM ↔ outils** → **tool gates durs** → **`delegate_executor`** (sub-agents).

Pas de `GateEngine`, pas de palier `EditTier`, pas de backpack, pas de tour `architect_intent`.

---

## Flux prod (`role_split`)

```text
agent.run (orchestrationMode: role_split)
  → orchestration_run.rs : resolve_architect_gate
       · RPC architectInteractionMode (discuss | analyze | edit)
       · sinon heuristique légère (`looks_like_light_conversation`) → discuss reply-only, sinon edit
  → drive_role_split_discuss  OU  drive_role_split_edit
  → loop.rs (RoleId::ArchitectDiscussion | Architect | Executor)
  → tool gates : architect_gates.rs + gates.rs (clôture [phase: done])
```

| Étape | Fichier | Rôle |
|-------|---------|------|
| Routage | `drox-cli/.../orchestration_run.rs` | Discuss / edit direct |
| Modes RPC | `orchestration/architect_gate.rs` | Parse `ArchitectGate` |
| Boot edit | `agent/edit_start.rs` | Ancrage objectif |
| System prompt edit | `prompts/system/gates/edit.rs` | `01_core` + tous les `T-*` + parallel_slots |
| System prompt discuss | `prompts/system/gates/discuss.rs` | G2 + read budget |
| Boucle | `agent/loop.rs` | LLM, outils, snapshot injecté |
| Tool gates architecte | `agent/architect_gates.rs` | todo avant delegate, cap reads, scope… |
| Tool gates génériques | `agent/gates.rs` | done, professor, testing… |
| Sub-agents | `orchestration_delegate.rs` | `delegate_executor` → Executor éphémère |
| État run | `agent/architect_state.rs` + `prompts/system/context/run_snapshot.rs` | Snapshot factuel par checkpoint |

---

## Ce qui n’existe plus (ne pas recréer sans décision 1.3.3+)

| Retiré | Ancien rôle |
|--------|-------------|
| `gate_engine/` | Chaîne TOML entry → discuss.* → START_RUN |
| `EditTier` / `e_*.md` | Paliers plan / delegate / verify imposés par le moteur |
| `context_bubble/` | Bulles gate LLM |
| `run_journal/` | Journal gate UI |
| `RoleId::ArchitectIntent` | Tours probe JSON |
| `GateProbe` / `GatePass` / `GatePath` | Events routage gate |
| Backpack | RAG fiches architecte (phase D annulée) |

---

## Tool gates ≠ routage

`agent/gates.rs` et `agent/architect_gates.rs` restent **volontairement** : ce sont des **garde-fous d’exécution** (outil invalide, clôture prématurée), pas un second cerveau de routage.

---

## Prochaine évolution (1.3.3)

Index local, contexte graphe, fast path complétion — voir [../1.3.3/README.md](../1.3.3/README.md).
