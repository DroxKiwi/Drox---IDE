# Drox 1.3.1 — cadrage & backlog

**Statut** : ouverture de version (idées + design à venir)  
**Date** : 2026-05-28  
**Prérequis** : clôture fonctionnelle **1.3.0** (parallélisme exécuteurs, stabilité UI, distribution si prévue)

---

## Objectif de ce dossier

Centraliser tout ce qui **n’entre pas** dans le sprint 1.3.0 en cours : idées produit, pistes UX, chantiers moteur/IDE pour la **prochaine** majeure.

| Sous-dossier | Rôle |
|--------------|------|
| [idees/](idees/README.md) | **Backlog d’idées** — une fiche par idée, sans engagement de livraison |
| `steps/` | *(à créer)* Vision, design, plan d’implémentation quand une idée est promue |
| `cartographie/` | *(à créer)* Fichiers touchés une fois le périmètre figé |

---

## Lien avec 1.3.0

- [README 1.3.0](../README.md) — parallélisme, finalisation distribution  
- Les idées 1.3.1 **ne bloquent pas** la fin 1.3.0 ; elles servent à ne rien oublier pendant le dogfooding (ex. site vitrine, sessions longues).

---

## Prochaines étapes (process)

1. Enrichir les fiches dans `idees/` au fil des retours terrain.  
2. Prioriser (impact / coût / dépendances).  
3. Promouvoir une idée → `steps/01-vision/` + ADR si décision structurante.  
4. Découper en sprints (moteur Rust, workbench Drox IDE, settings `drox.*`).
