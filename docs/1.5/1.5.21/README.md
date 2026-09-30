# 1.5.21 — Index `@Codebase` (BDD vectorielle locale) + Explore IDE

**Statut** : **en cours** · branche `1.5.21`  
**Version cible** : `droxVersion` **1.5.21**  
**Précédent** : [1.5.20](../1.5.20/README.md) — History / Changes IDE  
**Suite** : [1.5.22](../1.5.22/README.md) — shell discussion partagé Agents ↔ IDE

## Docs

| Fiche | Sujet | Priorité |
|-------|--------|----------|
| [ARCHITECTURE-CODEBASE-INDEX.md](ARCHITECTURE-CODEBASE-INDEX.md) | **#1** — `@Codebase` local : chunk · embed · store · retrieval | **Premier** |
| [PLAN-CODE-MAP.md](PLAN-CODE-MAP.md) | Carte visuelle du code (canvas fichiers / symboles) | Lié à #1 |
| [PLAN-SUBAGENTS-EXPLORE-IDE.md](PLAN-SUBAGENTS-EXPLORE-IDE.md) | **#2** — Brancher Explore / `task` dans l’IDE (opt-in) | **Deuxième** |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Index codebase type Cursor (`@Codebase`) — SQLite + embed local | 📋 CB0 (spec) → CB1+ |
| B | Embeddings locaux (Ollama / modèle dédié) + recherche hybride | 📋 CB2 |
| C | Carte visuelle du code (réutilise le socle layout Git Graph) | 📋 plan |
| D | Explore / sous-agents dans l’IDE — settings + câblage UI | 📋 |

## Décisions clés

- **Ordre produit 1.5.21** : **BDD vectorielle locale / index d’abord**, **Explore ensuite**.
- Compréhension code LLM = **retrieval local** (chunk → embed → hybrid search), pas fine-tune.
- Store = **BDD locale** bornée sous `{workspace}/.drox/codebase-index/`.
- Carte code = **autre domaine** que le Git Graph, même famille UI ; hits retrieval peuvent l’alimenter.
- **Explore** : code moteur déjà là ; 1.5.21 = **câblage produit IDE** (opt-in via settings), pas réécriture du sous-agent.
- Tool calling universel → **[1.5.23](../1.5.23/README.md)**.
- Shell discussion unifié → **[1.5.22](../1.5.22/README.md)**.

## Origine

Features reportées hors 1.5.19. **Inversion** : l’index `@Codebase` / embed local passe **devant** Explore et devant le tool calling universel pour cette maj.
