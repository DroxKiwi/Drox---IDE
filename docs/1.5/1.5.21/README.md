# 1.5.21 — Tool calling universel + Explore IDE

**Statut** : **préparé** · prochain chantier après 1.5.20  
**Version cible** : `droxVersion` **1.5.21**  
**Précédent** : [1.5.20](../1.5.20/README.md) — stabilisation + historique + Changes IDE  
**Suite** : [1.5.22](../1.5.22/README.md) — shell discussion partagé Agents ↔ IDE

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-UNIVERSAL-TOOL-CALLING.md](PLAN-UNIVERSAL-TOOL-CALLING.md) | Plan produit / tech — universaliser l’accès aux outils sans modèle Drox |
| [PLAN-SUBAGENTS-EXPLORE-IDE.md](PLAN-SUBAGENTS-EXPLORE-IDE.md) | **Brancher Explore (`task`) dans l’IDE** — moteur prêt, settings + bridge manquants |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Constater les canaux « universels » LLM vs tool calling natif | 📋 plan |
| B | Durcir / normaliser le chemin natif (args, schémas, erreurs) | 📋 · U1 partiel |
| C | Concevoir un contrat d’outils compatible multi-modèles (local GGUF inclus) | 📋 |
| D | Doc moteur + smoke KAT / Laguna / Qwen | 📋 |
| E | **Explore / sous-agents** — settings IDE + `subagentsEnabled` sur `agent.run` | 📋 plan |

## Décisions clés (point de départ)

- Pas de **fine-tune / LoRA Drox** comme prérequis.
- Les LLM sont **universels en langage** ; le **JSON/XML tool calling natif n’est pas universel**.
- Objectif : outils Drox exécutables sur une large famille de modèles — design exact tranché dans le plan.
- **Explore** : code moteur déjà là ; 1.5.21 = **câblage produit IDE** (opt-in via settings), pas réécriture du sous-agent.
- Shell discussion unifié → **[1.5.22](../1.5.22/README.md)**.
- Index codebase / carte code → **[1.5.23](../1.5.23/README.md)**.

## Origine

Smoke KAT-Coder (1.5.19) + discussion canaux LLM. Priorité produit : **tool calling avant** l’unification du shell discussion (inversion 1.5.21 ↔ 1.5.22).  
Explore IDE : constat doc / dogfood — tool `task` absent du registry tant que l’IDE n’envoie pas `subagentsEnabled`.
