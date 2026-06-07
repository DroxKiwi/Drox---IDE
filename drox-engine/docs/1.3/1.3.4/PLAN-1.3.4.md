# Plan 1.3.4 — Stabilisation moteur

**Version** : 1.3.4 · juin 2026  
**Base** : moteur 1.3.2 mergé (`role_split` — [CONDUCTEUR-CODE.md](../1.3.2/CONDUCTEUR-CODE.md))  
**Prérequis** : [1.3.3](../1.3.3/README.md) — installeur fiable, pipeline garde-fous

---

## Objectif release

| Priorité | Livrable |
|----------|----------|
| **P0** | TEST-PLAN 1.3.2 exécuté et signé |
| **P0** | `cargo test -p drox-engine` vert |
| **P1** | Presets `relaxed` / `normal` / `strict` validés post-refacto |
| **P1** | Tests unitaires IDE drox (replay, remap, …) |

**Hors scope** : onboarding, index RAG, graphe, fast path → [1.3.5](../1.3.5/README.md).

---

## Phase S — Stabilisation

### S.1 Tests manuels moteur

[TEST-PLAN-1.3.2.md](../1.3.2/finalisation/TEST-PLAN-1.3.2.md) : T1–T10.

Critère : export transcript sans artefacts `GATE · probe` / `architect_intent`.

### S.2 Presets & réglages IDE

[VALIDATION-PRESETS-ENGINE-1.3.2.md](../1.3.2/finalisation/VALIDATION-PRESETS-ENGINE-1.3.2.md) — P8–P13.

### S.3 Tests automatisés

```powershell
cd drox-engine\drox
cargo test -p drox-engine
npm run test-node -- --run "vs/workbench/contrib/drox/test/common/"
```

### S.4 Régression IDE

| # | Scénario |
|---|----------|
| H1–H3 | Session lazy L2 |
| D1 | Agents MS off, Drox Chat OK |

---

## Critère « 1.3.4 livrée »

- [ ] TEST-PLAN + presets OK
- [ ] `cargo test` vert
- [ ] [CLOSURE-1.3.4.md](finalisation/CLOSURE-1.3.4.md) signée

---

## Suite (1.3.5)

Onboarding, index, graphe, fast path, benchmark — [PLAN-1.3.5.md](../1.3.5/PLAN-1.3.5.md).

---

## Liens

- [README 1.3.4](README.md)
- [CLOSURE](finalisation/CLOSURE-1.3.4.md)
- [Hub 1.3](../README.md)
