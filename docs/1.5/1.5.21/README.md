# 1.5.21 — Index `@Codebase` + Explore IDE + shell discussion partagé

**Statut** : **en cours** · branche `1.5.21`  
**Version cible** : `droxVersion` **1.5.21**  
**Précédent** : [1.5.20](../1.5.20/README.md) — History / Changes IDE  
**Suite** : [1.5.22](../1.5.22/README.md) — tool calling universel

## Docs

| Fiche | Sujet | Priorité |
|-------|--------|----------|
| [AMBITION-CODEBASE-INDEX.md](AMBITION-CODEBASE-INDEX.md) | **But produit** + supervision IDE + embed embarqué / ressources | **#1 — avant code** |
| [PLAN-CODEBASE-COCKPIT.md](PLAN-CODEBASE-COCKPIT.md) | **CB0b** — spec cockpit shell partagé (layout · hosts · events) | **En cours** |
| [ARCHITECTURE-CODEBASE-INDEX.md](ARCHITECTURE-CODEBASE-INDEX.md) | Pipeline technique chunk · embed · store · retrieval | Aligné après ambition |
| [PLAN-CODE-MAP.md](PLAN-CODE-MAP.md) | Carte visuelle du code (canvas fichiers / symboles) | Lié à #1 |
| [PLAN-SUBAGENTS-EXPLORE-IDE.md](PLAN-SUBAGENTS-EXPLORE-IDE.md) | Brancher Explore / `task` dans l’IDE (opt-in) | **#2** |
| [PLAN-SHARED-DISCUSSION-SHELL.md](PLAN-SHARED-DISCUSSION-SHELL.md) | Shell Agents + **tous** ses outils de discussion dans l’IDE | **#3** |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Ambition + UI supervision `@Codebase` (avant code index) | 📋 [AMBITION…](AMBITION-CODEBASE-INDEX.md) |
| B | Index codebase — SQLite + embed **embarqué** | 📋 CB0a/b → CB1+ |
| C | Embeddings locaux + recherche hybride | 📋 CB2 |
| D | Carte visuelle du code (réutilise le socle layout Git Graph) | 📋 plan |
| E | Explore / sous-agents dans l’IDE — settings + câblage UI | 📋 |
| F | Shell discussion partagé Agents ↔ IDE (parité contrôles) | 🔄 S0–S2 ✅ · S3–S5 |

## Décisions clés

- **Ordre produit 1.5.21** : **ambition + supervision `@Codebase` d’abord** (pas de code index aveugle), puis Explore, puis shell discussion.
- Compréhension code LLM = **retrieval local** (chunk → embed → hybrid search), pas fine-tune.
- Embed **shippé dans l’app** (consommation minimale) ; ressources CPU/GPU/RAM paramétrables dans l’UI de supervision.
- Store = **BDD locale** bornée sous `{workspace}/.drox/codebase-index/` (par instance projet).
- **Explore** : code moteur déjà là ; câblage produit IDE (opt-in), pas réécriture du sous-agent.
- **Shell** : parité stricte zone discussion Agents ↔ IDE (modèle, connexion, params, modes, status) ; pas le chrome fenêtre Agents.
- Tool calling universel → **[1.5.22](../1.5.22/README.md)**.
- Branchement agent / tests coding sur `@Codebase` → **après** verrouillage ambition (voir fiche).

## Origine

Features reportées hors 1.5.19. Index `@Codebase` prioritaire ; Explore + shell discussion remontés dans **1.5.21** ; tool calling décalé en **1.5.22**.
