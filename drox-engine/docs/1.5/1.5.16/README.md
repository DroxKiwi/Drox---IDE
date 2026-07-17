# 1.5.16 — Stabilisation modèle (hors-workspace + boucle write)

**Statut** : **clôturé**  
**Version** : `droxVersion` **1.5.16**  
**Plan** : [PLAN-1.5.16.md](PLAN-1.5.16.md) · [Clôture](CLOSURE-1.5.16.md)

## Piliers

| # | Sujet | Surface | Statut |
|---|--------|---------|--------|
| **FX-A** | Hors workspace — flag n’atteint pas le chat IDE | IDE P0 · Rust P1 | ✅ P0 câblé (chat + recovery) |
| **FX-B** | Boucle « je vais écrire » sans `file_write` | Rust P0 · IDE P1 | ✅ P0 gate intent-only (+ tests) |

## Base

Release **1.5.15** : hors workspace (Agents) · Retry · carnet session N0 · fix terminal persisté↔persisté.

## Synthèse

- **FX-A** : chat IDE injecte `sessionBackgroundService` → `allowOutsideWorkspace` sur `agent.run` (+ recovery).
- **FX-B** : prose write/edit sans `tool_calls` → nudges dédiés (×2) puis soft-abort `intent_only_write` **avant** le LoopDetector.

Audit Rust : [ENGINE-RUST-1.5.16.md](ENGINE-RUST-1.5.16.md).
