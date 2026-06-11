# 09 — Run Rail (conducteur 1.4.0)

**Question** : qu’est-ce que le rail linéaire, et où vit-il dans le code ?

---

## Rôle

Conducteur **expérimental** pour runs architect **edit** : séquence de stations `INTENT → READ → … → ANSWER`, marqueurs `[gate: hold|advance]`, filtrage outils par station, segments ACT.

**Statut produit** : **squelette actif** — [SQUELETTE.md](../../1.4.0/SQUELETTE.md). Segments supprimés (option A). Archive : [1.4.0/archive](../../1.4.0/archive/README.md).

---

## Activation

```text
EngineTuning.run_rail_enabled == true
  && RoleId::Architect
  && run edit (pas discuss)
```

---

## Fichiers code (`agent/run_rail/`)

| Module | Rôle |
|--------|------|
| `mod.rs` | Façade publique, `run_rail_active` |
| `state.rs` | `RunRailState` — station, depth, compteurs |
| `station.rs` | Enum stations, ordre linéaire |
| `policy.rs` | `tool_allowed(station, tool)` |
| `pre_gate.rs` | Erreur si tool hors station |
| `transition.rs` | `[gate: hold|advance]` |
| `infer.rs` | Auto-advance depuis tools (C12) |
| `loop_hooks.rs` | **≤3 hooks** appelés depuis `drive.rs` |
| `snapshot_block.rs` | Bloc `## Run rail (engine)` injecté |
| `segment/` | Sous-run ACT isolé (runner, scope, trigger) |
| `act_failure.rs` | Circuit breaker échecs mutation ACT |
| `propose_hold.rs` | Pause PROPOSE depth complex |

---

## Interaction avec la boucle 1.3

Le rail **ne remplace pas** `gates.rs` ni les nudges — il **s’ajoute**. Les deux couches peuvent envoyer des signaux contradictoires au modèle (audit juin 2026).

---

## Documentation archive

| Doc | Sujet |
|-----|-------|
| [README](../archive/1.4.0/README.md) | Vision |
| [02-RAIL-PROTOCOL](../archive/1.4.0/02-RAIL-PROTOCOL.md) | hold / advance |
| [03-STATIONS](../archive/1.4.0/03-STATIONS.md) | Outils par station |
| [04-SEGMENTS](../archive/1.4.0/04-SEGMENTS.md) | Segments ACT |
| [05-CODE-ARCHITECTURE](../archive/1.4.0/05-CODE-ARCHITECTURE.md) | Modules Rust |
| [SMOKE-BACKLOG](../archive/1.4.0/SMOKE-BACKLOG.md) | Bugs dogfood |

---

## Liens

- Gates classiques : [08-gates-nudges-etat](../08-gates-nudges-etat/README.md)
- Sous-runs : [07-sous-agents](../07-sous-agents/README.md)
