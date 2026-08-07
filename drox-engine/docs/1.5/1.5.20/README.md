# 1.5.20 — Index codebase + carte visuelle du code

**Statut** : **ouvert** · branche `1.5.20`  
**Version** : `droxVersion` **1.5.20**  
**Précédent** : [1.5.19](../1.5.19/README.md) — badge branche + Git Graph natif ([CLOSURE](../1.5.19/CLOSURE-1.5.19.md))

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

Features reportées hors 1.5.19 pour laisser le ship Git Graph se terminer proprement :

- Index / embed / database → fiche Architecture Codebase  
- Carte visuelle du code → plan dédié  
