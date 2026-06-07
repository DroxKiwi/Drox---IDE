# Drox 1.3.3 — Stabilisation moteur & release fiable

**Statut** : **en cours** (branche `1.3.3`)  
**Prérequis** : [1.3.2](../1.3.2/README.md) mergée sur `main`

---

## En une phrase

On **verrouille** le moteur `role_split` (1.3.2) par des **tests systématiques** — pas de nouvelle feature produit tant que le binaire installable et la chaîne MAJ ne sont pas fiables.

---

## Pourquoi 1.3.3 (et pas index / graphe tout de suite)

L’installeur publié en 1.3.2 ne reflétait pas le code attendu (bundle obsolète). On en profite pour :

1. **Republier** un package IDE **1.3.3** rebuild complet (`-ForceCompile`).
2. **Valider** la notification MAJ (`latest.json` → GitHub Release).
3. **Passer** TEST-PLAN, presets, `cargo test` — critère avant tout pilier contexte.

Les anciens piliers « index / graphe / fast path » restent documentés en [backlog](PLAN-1.3.3.md#backlog-post-stabilisation) — **après** stabilisation.

---

## Axes 1.3.3

| # | Axe | Doc |
|---|-----|-----|
| **T1** | Tests moteur (T1–T10, presets P8–P13) | [TEST-PLAN-1.3.2](../1.3.2/finalisation/TEST-PLAN-1.3.2.md) · [VALIDATION-PRESETS](../1.3.2/finalisation/VALIDATION-PRESETS-ENGINE-1.3.2.md) |
| **T2** | `cargo test -p drox-engine` + smoke IDE | [CLOSURE-1.3.3](finalisation/CLOSURE-1.3.3.md) |
| **T3** | Package win32 **1.3.3** + MAJ depuis install existante | [GUIDE-PUBLICATION-WIN32](../../operations/GUIDE-PUBLICATION-WIN32.md) |
| **T4** | Dogfood sessions longues (régression L2 lazy history) | [chat.txt](../1.3.2/chat.txt) |

---

## Liens

- [Plan détaillé](PLAN-1.3.3.md)
- [Clôture](finalisation/CLOSURE-1.3.3.md)
- [Conducteur moteur (base 1.3.2)](../1.3.2/CONDUCTEUR-CODE.md)
- [Hub 1.3](../README.md)
