# 1.5.22 — Index codebase + carte visuelle du code

**Statut** : **préparé** · reporté depuis 1.5.21  
**Version cible** : `droxVersion` **1.5.22**  
**Précédent** : [1.5.21](../1.5.21/README.md) — tool calling universel

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

Features reportées hors 1.5.19 → 1.5.20 → 1.5.21 → **1.5.22** pour prioriser stabilisation puis tool calling.
