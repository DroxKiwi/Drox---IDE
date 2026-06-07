# Drox 1.3.3 — Release fiable (pipeline & package)

**Statut** : **en cours** (branche `1.3.3`)  
**Prérequis** : [1.3.2](../1.3.2/README.md) mergée sur `main`

---

## En une phrase

Corriger le **bug de release 1.3.2** (installeur étiqueté mais UI / bundle obsolètes) : garde-fous build, rebundle complet, MAJ in-app validée.

---

## Contexte

L’installeur OR **1.3.2** a été produit avec un `out-vscode-min` recyclé (30/05) alors que le code 1.3.2 date de juin — chat webview, welcome Drox, lazy history, etc. absents du package.

**1.3.3** ne ajoute pas de feature produit : elle garantit que **l’app installée = le code sur `main`**.

---

## Axes 1.3.3

| # | Axe | Doc |
|---|-----|-----|
| **B1** | Garde-fous `drox-bundle-readiness` (stamp, sentinelles, vérif package) | [PLAN-1.3.3](PLAN-1.3.3.md) · [RULES.md](../../../../RULES.md) |
| **B2** | `npm run drox:ship -- -Force` + smoke install | [GUIDE-PUBLICATION-WIN32](../../operations/GUIDE-PUBLICATION-WIN32.md) |
| **B3** | MAJ in-app (install ≤1.3.2 → notif → 1.3.3) | [CLOSURE-1.3.3](finalisation/CLOSURE-1.3.3.md) |

**Reporté en [1.3.4](../1.3.4/README.md)** : TEST-PLAN complet, presets, `cargo test` systématique.

**Reporté en [1.3.5](../1.3.5/README.md)** : index, graphe, fast path.

---

## Liens

- [Plan détaillé](PLAN-1.3.3.md)
- [Clôture](finalisation/CLOSURE-1.3.3.md)
- [Hub 1.3](../README.md)
