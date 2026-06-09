# Ouverture 1.4.0 — Run Rail

**Version** : `droxVersion` **1.4.0** (à bumper à la release)  
**Branche git** : `1.4.0`  
**Date ouverture** : juin 2026  
**Statut** : **ouvert**

---

## Motif d’ouverture

Clôture anticipée de [1.3.4](../../1.3/1.3.4/finalisation/CLOSURE-1.3.4.md) : le dogfood ([chat.txt](../../1.3/chat.txt)) montre que la stabilisation « solo sans conducteur » ne suffit pas face à un modèle fort. La refonte moteur (**run rail**) devient la priorité produit.

---

## Périmètre 1.4.0

| # | Livrable |
|---|----------|
| **G1** | Module `agent/run_rail/` (stations, hold/advance, mode A) |
| **G2** | Segments internes (contexte isolé, réutilisation delegate) |
| **G3** | Blocs UI repliables par station |
| **G4** | Flag `runRailEnabled` + migration depuis solo 1.3.4 |
| **G5** | [TEST-PLAN](09-TEST-PLAN.md) R1–D3 signé |

---

## Documentation (lire avant code)

| Ordre | Doc |
|-------|-----|
| 1 | [01-VISION.md](../01-VISION.md) |
| 2 | [02-RAIL-PROTOCOL.md](../02-RAIL-PROTOCOL.md) |
| 3 | [03-STATIONS.md](../03-STATIONS.md) |
| 4 | [05-CODE-ARCHITECTURE.md](../05-CODE-ARCHITECTURE.md) |
| 5 | [07-IMPLEMENTATION-PHASES.md](../07-IMPLEMENTATION-PHASES.md) |

**Règle** : Phase 0 (squelette, flag off) avant Phase 1 (comportement).

---

## Héritage 1.3.4

Code conservé et réutilisé :

- Solo architecte (`executor_delegation_enabled: false` par défaut)
- Prompts `*_solo.md`, `01_core_solo.md`
- `orchestration_delegate.rs` → segments ACT
- Gates clôture existantes (`gates.rs`)

---

## Hors scope 1.4.0

- Index RAG / ContextPack → [1.4.3](../../1.4.3/README.md)
- Réactivation UI `delegate_executor`
- `GateEngine` TOML / paliers `E-*`

---

## Liens

- [README 1.4.0](../README.md)
- [CLOSURE](CLOSURE-1.4.0.md)
- [Hub 1.4](../../README.md)
