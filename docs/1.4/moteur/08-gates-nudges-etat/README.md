# 08 — Gates, nudges & état run

**Question** : quelles règles **bloquent** ou **recadrent** le modèle, et quel état le moteur injecte ?

---

## Rôle

Couche **régulation** de la boucle 1.3 : empêcher clôtures incohérentes, rappeler le protocole, détecter boucles, maintenir snapshot plan/todos.

---

## Gates (blocages)

| Fichier | Contenu |
|---------|---------|
| `agent/gates.rs` | Gates génériques : done↔answering, testing, todos, professor |
| `agent/architect_gates.rs` | Shape `todo_write`, caps lecture/délégation |
| `agent/executor_gates.rs` | Gates exécuteur |
| `run_spec/mod.rs` | `GateKind` + flags `EngineTuning` |

Exemples :

- `done` sans `[phase: answering]` avant
- `done` avec todos `pending` / `in_progress`
- Mutation code sans passage par testing (si gate active)
- `todo_write` payload invalide

Point d’appel : `tool_pre_gate_block` dans `gates.rs` + exécution dans `tool_execution.rs`.

---

## Nudges (rappels non bloquants)

| Dossier | Rôle |
|---------|------|
| `agent/nudges/` | Textes système injectés après tour vide ou erreur |
| `agent/nudges/router.rs` | Choix nudge par `RoleId` |
| `agent/nudges/architect.rs` | Nudges architecte solo / délégation |
| `agent/nudges/loop_intervention.rs` | Anti-boucle — message user + system |
| `agent/nudges/templates/loop/*.md` | Wording LLM compile-time |

Déclencheurs dans `drive.rs` : tour sans tool, answering sans done, step-by-step todos, delegate après N reads, etc.

---

## Anti-boucle

`agent/agent_stream.rs` — `LoopDetector` : empreinte texte + tool_calls consécutifs → `LoopIntervention` → recentrage ou abort.

**Limite connue** : tours **thinking-only** (texte vide) ne comptent pas — voir audit smoke.

---

## État architecte injecté

| Fichier | Rôle |
|---------|---------|
| `agent/architect_state.rs` | Plan, focus task, delegates, cycle sanity, rail state |
| `orchestration/prompts/system/context/run_snapshot.rs` | Bloc `## Architect run (engine)` |

Rafraîchi **chaque tour** dans `drive.rs` (`refresh_architect_run_snapshot`).

---

## Phases & marqueurs

`agent/phases.rs` — parsing `[phase: reading|acting|answering|done|…]`.  
Interaction avec run rail : voir [09-run-rail](../09-run-rail/README.md) et [10-evenements-phases](../10-evenements-phases/README.md).

---

## Liens

- [CONDUCTEUR-CODE](../../../1.3/1.3.2/CONDUCTEUR-CODE.md)
- Boucle : [02-boucle-agent](../02-boucle-agent/README.md)
- Archive gates TOML : [gates/ARCHIVE](../../../1.3/1.3.2/gates/ARCHIVE.md)
