# 09 — Run Rail (conducteur 1.4.x)

**Question** : qu’est-ce que le rail linéaire, et où vit-il dans le code ?

---

## Rôle

Conducteur pour runs architect **edit** (`ArchitectGate::Edit`) : **7 stations** linéaires, marqueurs `[gate: hold|advance]` et `[depth: short|complex]`, filtrage outils par station, **tool folders** (1.4.1.3).

**Statut produit (1.4.1)** : **actif et stabilisé** sur le chemin solo — plus de segments ACT ni `delegate_executor`. Toujours **expérimental** côté produit global.

Ordre canonique (`agent/rail/station.rs`) :

```text
INTENT → READ → PROPOSE → PLAN → ACT → VERIFY → ANSWER
         └─ depth short ──────────────► ACT (saute PROPOSE + PLAN)
```

---

## Activation

```text
EngineTuning.run_rail_enabled == true   # profil produit unique (toujours true en prod)
  && RoleId::Architect
  && StartRunKind::Edit                 # pas discuss / analyze
```

Discuss utilise `ArchitectDiscussion` + marqueurs `[discussion: reply|done]` — **pas** de rail.

---

## Fichiers code (`agent/rail/`)

| Module | Rôle |
|--------|------|
| `mod.rs` | Façade, `run_rail_active` |
| `station.rs` | `RunStation`, `RunDepth`, `next_mode_a` |
| `state.rs` | `RunRailState` — station, depth, compteurs stall |
| `policy.rs` | `tool_allowed`, `filter_tool_specs_for_station` |
| `pre_gate.rs` | Erreur si tool hors station |
| `transition.rs` | `[gate: hold|advance]`, reopen VERIFY/ACT |
| `infer.rs` | Auto-advance depuis outils (C12) |
| `loop_hooks.rs` | Hooks depuis `drive_llm_turn` / post-assistant |
| `snapshot_block.rs` | Bloc `## Run rail (engine)` injecté |
| `propose_hold.rs` | Pause PROPOSE (`depth: complex`) |
| `read_stall.rs` / `act_stall.rs` | Nudges exploration / mutation bloquée |
| `verify.rs` | Résultat VERIFY avant `done` |

**Tool folders** (couplés au rail) : `orchestration/tool_folders/` — `describe` débloque les outils wire par station.

**Plan interne L2** : `internal_plan_write` obligatoire en INTENT (`agent/state/internal_plan.rs`).

---

## Interaction avec la boucle 1.3

Le rail **ne remplace pas** `gates/` ni les `nudges/` — il **s’ajoute**. Les deux couches coexistent sur edit ; la 1.4.1 a réduit les conflits (VERIFY, PROPOSE hold, stall READ/ACT).

---

## Documentation archive

| Doc | Sujet |
|-----|-------|
| [README](../../1.4.0/archive/1.4.0/README.md) | Vision initiale 1.4.0 |
| [02-RAIL-PROTOCOL](../../1.4.0/archive/1.4.0/02-RAIL-PROTOCOL.md) | hold / advance |
| [03-STATIONS](../../1.4.0/archive/1.4.0/03-STATIONS.md) | Outils par station (archive — voir `policy.rs` + tool folders) |
| [SMOKE-BACKLOG](../../1.4.0/archive/SMOKE-BACKLOG.md) | Bugs dogfood historiques |

---

## Liens

- Prompt solo : `orchestration/prompts/system/blocks/edit/01_core_rail_solo.md`
- Gates classiques : [08-gates-nudges-etat](../08-gates-nudges-etat/README.md)
- Intent probe (mode Auto) : `orchestration/intent_probe/`
