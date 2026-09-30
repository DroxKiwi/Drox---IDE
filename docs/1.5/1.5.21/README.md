# 1.5.21 — Index `@Codebase` + Explore IDE + shell discussion partagé

**Statut** : **en cours** · branche `1.5.21`  
**Version cible** : `droxVersion` **1.5.21**  
**Précédent** : [1.5.20](../1.5.20/README.md) — History / Changes IDE  
**Suite** : [1.5.22](../1.5.22/README.md) — tool calling universel

## Docs

| Fiche | Sujet | Priorité |
|-------|--------|----------|
| [ARCHITECTURE-CODEBASE-INDEX.md](ARCHITECTURE-CODEBASE-INDEX.md) | `@Codebase` local : chunk · embed · store · retrieval | **#1** |
| [PLAN-CODE-MAP.md](PLAN-CODE-MAP.md) | Carte visuelle du code (canvas fichiers / symboles) | Lié à #1 |
| [PLAN-SUBAGENTS-EXPLORE-IDE.md](PLAN-SUBAGENTS-EXPLORE-IDE.md) | Brancher Explore / `task` dans l’IDE (opt-in) | **#2** |
| [PLAN-SHARED-DISCUSSION-SHELL.md](PLAN-SHARED-DISCUSSION-SHELL.md) | Shell Agents + **tous** ses outils de discussion dans l’IDE | **#3** |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Index codebase type Cursor (`@Codebase`) — SQLite + embed local | 📋 CB0 (spec) → CB1+ |
| B | Embeddings locaux (Ollama / modèle dédié) + recherche hybride | 📋 CB2 |
| C | Carte visuelle du code (réutilise le socle layout Git Graph) | 📋 plan |
| D | Explore / sous-agents dans l’IDE — settings + câblage UI | 📋 |
| E | Shell discussion partagé Agents ↔ IDE (parité contrôles) | 🔄 S0–S2 ✅ · S3–S5 |

## Décisions clés

- **Ordre produit 1.5.21** : **BDD vectorielle / index d’abord**, **Explore ensuite**, **shell discussion partagé** dans la même maj.
- Compréhension code LLM = **retrieval local** (chunk → embed → hybrid search), pas fine-tune.
- Store = **BDD locale** bornée sous `{workspace}/.drox/codebase-index/`.
- **Explore** : code moteur déjà là ; câblage produit IDE (opt-in), pas réécriture du sous-agent.
- **Shell** : parité stricte zone discussion Agents ↔ IDE (modèle, connexion, params, modes, status) ; pas le chrome fenêtre Agents.
- Tool calling universel → **[1.5.22](../1.5.22/README.md)**.

## Origine

Features reportées hors 1.5.19. Index `@Codebase` prioritaire ; Explore + shell discussion remontés dans **1.5.21** ; tool calling décalé en **1.5.22**.
