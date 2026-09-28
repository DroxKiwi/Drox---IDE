# Drox 1.4.0 — Squelette moteur (table rase)

**Statut** : **actif — refonte en cours** (juin 2026)  
**Prérequis** : [1.3.4 clôturée](../../1.3/1.3.4/finalisation/CLOSURE-1.3.4.md)  
**Hub** : [1.4](../README.md) · **Carte code** : [moteur/](../moteur/README.md)

---

## Document de référence (faire foi)

→ **[FOI-REFONTE.md](FOI-REFONTE.md)** — unique source de vérité : suppressions, modifications, reliquats, règles rail + arborescence ≤ 500 lignes.

→ **[Contrat runtime](FOI-REFONTE.md#iii--contrat-runtime-canonique-refonte-profonde)** (edit + discuss seulement)  
→ **[UI conducteur](UI-CONDUCTEUR.md)** — obsolète / garder / ordre d’affichage fork VS Code  
→ **[Tableau d’exécution](FOI-REFONTE.md#xiv--tableau-dexécution-ordonné)** — moteur **1.1** · UI alignement **2d** (après 2b)

En cas de conflit entre docs, **FOI prime**.

---

## En une phrase

**Un modèle, un conducteur.** L’architecte est l’unique agent ; le **run rail** est le seul paradigme de guide ; le moteur porte la complexité (outils filtrés, snapshot, stall) — pas le modèle.

---

## Décisions figées (D1–D8)

Voir [FOI-REFONTE § II](FOI-REFONTE.md#ii--décisions-figées) — dont **D8** alignement UI (Phase 2d).

---

## Annexes (déclinaisons du FOI)

| Document | Contenu |
|----------|---------|
| [PLAN-ATTAQUE.md](PLAN-ATTAQUE.md) | Phases, suivi, risques |
| [STRUCTURE-CODE.md](STRUCTURE-CODE.md) | Détail arborescence, anti-patterns |
| [SQUELETTE.md](SQUELETTE.md) | Recette produit |
| [SUPPRESSIONS.md](SUPPRESSIONS.md) | Inventaire tiers 1–6 |
| [AUDIT-RELIQUATS.md](AUDIT-RELIQUATS.md) | Analyse pré-refonte |
| [09-TEST-PLAN.md](09-TEST-PLAN.md) | Validation |
| [SMOKE-BACKLOG.md](SMOKE-BACKLOG.md) | Journal dogfood |

---

## Archive

Première tentative rail + segments : **[archive/](archive/README.md)** — lecture seule, ne pas implémenter depuis l’archive.

---

## Liens

- [Carte moteur](../moteur/README.md)
- [chat_qwen27b dogfood](../../1.3/chat_qwen27b.txt)
