# 1.5.17 — Alignement enveloppe IDE sur le contrat TUI (plan / run)

**Statut** : **ouvert**  
**Version** : `droxVersion` **1.5.17**  
**Plan** : [PLAN-1.5.17.md](PLAN-1.5.17.md)

## Piliers (brouillon)

| # | Sujet | Surface | Statut |
|---|--------|---------|--------|
| **AL-A** | Cycle de vie du plan : fidélité TUI (run-centric) vs widget session Copilot | IDE · doc | ⬜ à préciser |
| **AL-B** | Signaux non contradictoires UI ↔ gates moteur ↔ transcript | IDE · éventuellement Rust | ⬜ à préciser |

## Base

Release **1.5.16** : hors-WS chat IDE · gate `intent_only_write` · ship Win/Linux.

## Synthèse diagnostic (pré-impl)

Cause racine probable des boucles d’édition : **état de plan ambigu** (UI session sticky + gates per-run reset + historique LLM), pas un second moteur. Boussole produit : **contrat TUI** (run-centric).
