# Ouverture 1.4.1 — Stabilisation dogfood

**Date** : juin 2026  
**Branche** : `1.4.1`  
**Prérequis** : [CLOSURE-1.4.0](../../1.4.0/archive/finalisation/CLOSURE-1.4.0.md) · squelette moteur mergé sur `main`

---

## Objectif

Fiabiliser le moteur et la session **sans** nouvelle refonte. La 1.4.0 a livré le run rail et retiré les reliquats 1.3 ; la 1.4.1 corrige les bugs observés au dogfood.

→ Plan : [PLAN-1.4.1.md](../PLAN-1.4.1.md)

---

## Non-objectifs

- Refonte rail ou split moteur (figé en 1.4.0)
- Polish UI chat complet (→ 1.4.2)
- Index / graphe (→ 1.4.3)

---

## Rappel produit

Le README racine et le dépôt OR précisent que **1.4.x n’est pas utilisable en production** tant que la stabilisation n’est pas livrée. Cette branche vise à réduire cet écart.
