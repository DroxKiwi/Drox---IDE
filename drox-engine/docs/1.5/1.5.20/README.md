# 1.5.20 — Tool calling universel

**Statut** : **ouvert** · branche `1.5.20`  
**Version** : `droxVersion` **1.5.20**  
**Précédent** : [1.5.19](../1.5.19/README.md) — badge / Git Graph + correctifs Ollama ([CLOSURE](../1.5.19/CLOSURE-1.5.19.md))  
**Suite reportée** : [1.5.21](../1.5.21/README.md) — index `@Codebase` + carte code

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
- Les LLM sont **universels en langage** (prose, Markdown souple, petits choix, canevas texte) ; le **JSON/XML tool calling natif n’est pas universel**.
- Objectif 1.5.20 : faire en sorte que **les outils Drox s’exécutent** sur une large famille de modèles, en s’appuyant d’abord sur ce que les LLM font déjà bien — le design exact (normalisation seule, canevas, filet texte, etc.) se tranche dans le plan.
- Index codebase / carte code → **[1.5.21](../1.5.21/README.md)**.

## Origine

- Smoke KAT-Coder (1.5.19) : `todo_write` avec `"status": {}`, fragments XML dans le thinking, boucles `InvalidArgs`.
- Discussion : ce que les modèles gèrent vraiment bien vs spécialité function-calling.
