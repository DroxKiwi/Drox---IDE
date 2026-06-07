# Drox 1.3.4 — Stabilisation moteur

**Statut** : **planifié** (après [1.3.3](../1.3.3/README.md))  
**Prérequis** : package IDE fiable, installeur aligné sur `main`

---

## En une phrase

On **verrouille** le moteur `role_split` (1.3.2) par des **tests systématiques** — TEST-PLAN, presets, `cargo test`.

---

## Pourquoi 1.3.4 (après 1.3.3)

**1.3.3** corrige le pipeline release (bundle stale). **1.3.4** valide le moteur et les réglages avant tout pilier contexte.

Les piliers « index / graphe / fast path » → **[1.3.5](../1.3.5/README.md)**.

---

## Axes 1.3.4

| # | Axe | Doc |
|---|-----|-----|
| **T1** | Tests moteur (T1–T10, presets P8–P13) | [TEST-PLAN-1.3.2](../1.3.2/finalisation/TEST-PLAN-1.3.2.md) · [VALIDATION-PRESETS](../1.3.2/finalisation/VALIDATION-PRESETS-ENGINE-1.3.2.md) |
| **T2** | `cargo test -p drox-engine` + smoke IDE | [CLOSURE-1.3.4](finalisation/CLOSURE-1.3.4.md) |
| **T3** | Dogfood sessions longues (régression L2) | [chat.txt](../1.3.2/chat.txt) |

---

## Liens

- [Plan détaillé](PLAN-1.3.4.md)
- [Clôture](finalisation/CLOSURE-1.3.4.md)
- [1.3.3 — release fiable](../1.3.3/README.md)
- [Hub 1.3](../README.md)
