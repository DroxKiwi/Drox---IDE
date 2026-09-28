# Clôture 1.5.16

**Branche** : `1.5.16` (conservée après merge)  
**Version** : `droxVersion` **1.5.16**

## Livré

| Pilier | Contenu |
|--------|---------|
| **FX-A** | Hors-workspace chat IDE : injection `sessionBackgroundService` + recovery (`allowOutsideWorkspace` sur `agent.run`) |
| **FX-B** | Gate intent-only write (Rust) : nudges dédiés ×2 puis soft-abort `LoopDetected { kind: "intent_only_write" }` (avant LoopDetector) |

## Non livré (report)

| Item | Note |
|------|------|
| FX-A P1 | Persistance flag / descriptions tools hors-WS |
| FX-B P1 | Cancel confirm write → erreur explicite côté modèle |

## Docs

- [PLAN-1.5.16.md](PLAN-1.5.16.md)
- [ENGINE-RUST-1.5.16.md](ENGINE-RUST-1.5.16.md) — audit Rust FX-B
- [README.md](README.md)

## Ship

Windows + Linux → repo OR `Drox---IDE---OR` tag `v1.5.16`.
