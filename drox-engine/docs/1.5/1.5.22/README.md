# 1.5.22 — Tool calling universel

**Statut** : **préparé** · reporté (était 1.5.21)  
**Version cible** : `droxVersion` **1.5.22**  
**Précédent** : [1.5.21](../1.5.21/README.md) — shell discussion partagé Agents ↔ IDE  
**Suite** : [1.5.23](../1.5.23/README.md) — index `@Codebase` + carte code

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-UNIVERSAL-TOOL-CALLING.md](PLAN-UNIVERSAL-TOOL-CALLING.md) | Plan produit / tech — universaliser l’accès aux outils sans modèle Drox |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Constater les canaux « universels » LLM vs tool calling natif | 📋 plan |
| B | Durcir / normaliser le chemin natif (args, schémas, erreurs) | 📋 |
| C | Concevoir un contrat d’outils compatible multi-modèles (local GGUF inclus) | 📋 |
| D | Doc moteur + smoke KAT / Laguna / Qwen | 📋 |

## Décisions clés (point de départ)

- Pas de **fine-tune / LoRA Drox** comme prérequis.
- Les LLM sont **universels en langage** ; le **JSON/XML tool calling natif n’est pas universel**.
- Objectif : outils Drox exécutables sur une large famille de modèles — design exact tranché dans le plan.
- Index codebase / carte code → **[1.5.23](../1.5.23/README.md)**.

## Origine

Smoke KAT-Coder (1.5.19) + discussion canaux LLM ; planifié puis décalé pour laisser 1.5.20 à la stabilisation IDE et **1.5.21** à l’unification du shell discussion.
