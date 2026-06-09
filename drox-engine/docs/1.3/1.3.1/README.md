# Drox 1.3.1 — première release publique

**Statut** : **livré** (archivé — ligne 1.3 figée, voir [CLOSURE-1.3.1](finalisation/CLOSURE-1.3.1.md))  
**Date** : 2026-05-29  
**Prérequis** : [**1.3.0**](../1.3.0/README.md) (moteur parallélisme + release `v1.3.0`)

---

## Objectif de cette version

Livrer la **première release publique complète** (`droxVersion` **1.3.1**) :

1. **Légal** — audit licences, EULA produit (non open source) + MIT socle
2. **Dé-branding** — retirer références Microsoft / Copilot / welcome par défaut
3. **Installeur** — charte graphique Drox (Inno 6.6+ dark, BMP, licences)
4. **MAJ** — notification `latest.json` + mise à jour in-app (`inno_updater`)

**Suivi unique** : [finalisation/CLOSURE-1.3.1.md](finalisation/CLOSURE-1.3.1.md)

Plans détaillés :

| Document | Sujet |
|----------|--------|
| [PLAN-DEBRAND-MICROSOFT.md](finalisation/PLAN-DEBRAND-MICROSOFT.md) | Dé-branding UI / `product.json` |
| [AUDIT-LICENCES-1.3.1.md](finalisation/AUDIT-LICENCES-1.3.1.md) | Inventaire licences |
| [LICENCE-PRODUIT.md](finalisation/LICENCE-PRODUIT.md) | EULA + MIT socle |

---

## Arborescence

| Dossier | Rôle |
|---------|------|
| [finalisation/](finalisation/README.md) | Clôture release — tous les blocs A–E |
| [retour_discussion/](retour_discussion/) | Retours terrain, dogfooding |

Backlog idées (hors version 1.3) : [`feature-brainstorm/`](../../feature-brainstorm/README.md).

---

## Références 1.3.0

- [Plan distribution (architecture)](../1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md) — F1–F7, schémas
- [Cadrage distribution](../1.3.0/finalisation/FINALISATION-DISTRIBUTION.md)
- [Patches upstream build](../1.3.0/finalisation/PATCHES-UPSTREAM-BUILD.md)

---

## Process

1. Suivre l’ordre dans [CLOSURE-1.3.1.md](finalisation/CLOSURE-1.3.1.md) (A → F → B → C → D → E).
2. `release-publish-win32` + tag **`v1.3.1`**.
3. Après release : enrichir [`feature-brainstorm/`](../../feature-brainstorm/README.md) ; promouvoir une idée → `drox-engine/docs/1.3.x/steps/` quand un chantier 1.3.2+ démarre.

**Déjà noté pour la suite** (post-1.3.1) :

- [06 — chargement sessions segmenté](../../feature-brainstorm/06-chargement-sessions-segmente.md)
- [07 — réponses légères sans plan](../../feature-brainstorm/07-reponses-legere-sans-plan.md)
- [08 — performance traitement rapide](../../feature-brainstorm/08-performance-traitement-rapide.md)
