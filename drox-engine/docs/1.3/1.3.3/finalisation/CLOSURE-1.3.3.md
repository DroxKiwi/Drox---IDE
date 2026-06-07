# Clôture 1.3.3 — stabilisation moteur & release fiable

**Version** : `droxVersion` **1.3.3**  
**Statut** : **ouvert**

---

## Périmètre inclus

| # | Livrable | Statut |
|---|----------|--------|
| **R1** | Installeur win32 **1.3.3** rebuild `-ForceCompile` | ☐ |
| **R2** | Chaîne MAJ (`latest.json` + Release OR) testée | ☐ |
| **R3** | TEST-PLAN 1.3.2 exécuté (T1–T10) | ☐ |
| **R4** | VALIDATION-PRESETS P8–P13 | ☐ |
| **R5** | `cargo test -p drox-engine` vert | ☐ |
| **R6** | Tests unitaires IDE drox (replay, remap, …) | ☐ |

---

## Hors scope 1.3.3

- Index / RAG local, graphe, fast path (backlog [PLAN-1.3.3.md](../PLAN-1.3.3.md))
- Agents Window KDDS
- Open VSX / marketplace

---

## Contexte

Release **1.3.2** mergée sur `main` (code produit) ; binaire OR **1.3.2** publié depuis un bundle obsolète — **1.3.3** corrige le package et valide la MAJ.

---

## Liens

- [README 1.3.3](../README.md)
- [PLAN](../PLAN-1.3.3.md)
- [CLOSURE 1.3.2](../../1.3.2/finalisation/CLOSURE-1.3.2.md)
