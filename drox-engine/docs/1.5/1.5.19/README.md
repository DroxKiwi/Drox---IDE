# 1.5.19 — Badge branche + Git Graph natif

**Statut** : **ouvert** · implémentation **en cours** (fondation + badge + vue read-only)  
**Version** : `droxVersion` **1.5.19**

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-GIT-BRANCH-GRAPH.md](PLAN-GIT-BRANCH-GRAPH.md) | Plan global (badge · service · graphe) |
| [ARCHITECTURE-BRANCH-SERVICE.md](ARCHITECTURE-BRANCH-SERVICE.md) | Service centralisé branches / HEAD |
| [FEATURES-GIT-GRAPH.md](FEATURES-GIT-GRAPH.md) | Catalogue MVP = parité extension Git Graph |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Suivi d’implémentation |
| [ARCHITECTURE-CODEBASE-INDEX.md](ARCHITECTURE-CODEBASE-INDEX.md) | Répliquer `@Codebase` (embed · index · retrieval) |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Badge branche visible (dossier git) | ✅ tranche 1 |
| B | Service centralisé gestion branche | ✅ fondation + ops tranche 2 |
| C | Git Graph natif — parité `mhutchie.git-graph` | 🔄 diffs + compare + branches/colonnes |
| D | Index codebase type Cursor (`@Codebase`) | 📋 spec CB0 |

## Décisions clés

- Badge = **indication permanente** de la branche de travail (pas seulement hover).
- Graphe = **fait maison**, comportement cible = **parité Git Graph**.
- Double-clic pastille → checkout (raccourci Drox).
- Observables **fins** (`currentBranch` vs fenêtre graphe).
- Compréhension code LLM = **retrieval local** (chunk → embed → hybrid search), pas fine-tune — voir fiche D.