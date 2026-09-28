# 1.5.23 — Index codebase + carte visuelle du code

**Statut** : **préparé** · reporté (était 1.5.22)  
**Version cible** : `droxVersion` **1.5.23**  
**Précédent** : [1.5.22](../1.5.22/README.md) — shell discussion partagé Agents ↔ IDE

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
- Store = **BDD locale** bornée sous `{workspace}/.drox/codebase-index/`.
- Carte code = **autre domaine** que le Git Graph, même famille UI.
- Hits retrieval peuvent **alimenter** la carte.

## Origine

Features reportées hors 1.5.19 → … → **1.5.23** pour prioriser stabilisation (1.5.20), tool calling (1.5.21), puis shell discussion unifié (1.5.22).
