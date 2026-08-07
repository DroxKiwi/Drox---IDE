# 1.5.21 — Index codebase + carte visuelle du code

**Statut** : **préparé** · reporté depuis 1.5.20  
**Version cible** : `droxVersion` **1.5.21**  
**Précédent** : [1.5.20](../1.5.20/README.md) — universalisation du tool calling

## Docs

| Fiche | Sujet |
|-------|--------|
| [ARCHITECTURE-CODEBASE-INDEX.md](ARCHITECTURE-CODEBASE-INDEX.md) | `@Codebase` local : chunk · embed · store · retrieval |
| [PLAN-CODE-MAP.md](PLAN-CODE-MAP.md) | Carte visuelle du code (canvas fichiers / symboles) |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Index codebase type Cursor (`@Codebase`) — SQLite + embed local | 📋 CB0 (spec) → CB1+ |
| B | Embeddings locaux (Ollama / modèle dédié) + recherche hybride | 📋 CB2 |
| C | Carte visuelle du code (réutilise le socle layout Git Graph) | 📋 plan |

## Décisions clés

- Compréhension code LLM = **retrieval local** (chunk → embed → hybrid search), pas fine-tune.
- Store = **BDD locale** bornée sous `{workspace}/.drox/codebase-index/` (pas de monolithe type `state.vscdb`).
- Carte code = **autre domaine** que le Git Graph, mais **même famille UI** (pastilles, liens, layout).
- Les hits retrieval peuvent **alimenter** la carte (nœuds fichiers / symboles).

## Origine

Features d’abord planifiées en 1.5.20, **décalées** pour laisser 1.5.20 au tool calling universel :

- Index / embed / database → fiche Architecture Codebase  
- Carte visuelle du code → plan dédié  
