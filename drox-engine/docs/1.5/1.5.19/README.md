# 1.5.19 — Badge branche + Git Graph natif

**Statut** : **clôturé** · [CLOSURE-1.5.19.md](CLOSURE-1.5.19.md)  
**Version** : `droxVersion` **1.5.19**

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-GIT-BRANCH-GRAPH.md](PLAN-GIT-BRANCH-GRAPH.md) | Plan global (badge · service · graphe) |
| [ARCHITECTURE-BRANCH-SERVICE.md](ARCHITECTURE-BRANCH-SERVICE.md) | Service centralisé branches / HEAD |
| [FEATURES-GIT-GRAPH.md](FEATURES-GIT-GRAPH.md) | Catalogue MVP = parité extension Git Graph |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Suivi d’implémentation Git Graph |
| [ENGINE-RUST-AGENT-LOOPS.md](ENGINE-RUST-AGENT-LOOPS.md) | **Moteur Rust** — gates bash/todo/testing, LoopDetector, prompts (smoke commit / boucles) |
| [ENGINE-OLLAMA-THINKING-AND-LOOPS.md](ENGINE-OLLAMA-THINKING-AND-LOOPS.md) | **Moteur LLM** — Ollama `$ref` / system Jinja / empreinte thinking (KAT-Coder) |
| [PLAN-MUTATORS-AND-TRANSCRIPT-EXPORT.md](PLAN-MUTATORS-AND-TRANSCRIPT-EXPORT.md) | Unification mutateurs + export transcript |
| [PLAN-INSTRUCTION-RUNTIME-COHERENCE.md](PLAN-INSTRUCTION-RUNTIME-COHERENCE.md) | **Priorité** : cohérence instructions (prompt / gates / nudges) ↔ runtime |
| [FEATURES-DEV-TRANSCRIPT-EXPORT.md](FEATURES-DEV-TRANSCRIPT-EXPORT.md) | Export transcript natif (dev) |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Badge branche visible (dossier git) | ✅ |
| B | Service centralisé gestion branche | ✅ |
| C | Git Graph natif — parité `mhutchie.git-graph` | ✅ (reste polish catalogue) |
| D | Moteur Rust — anti-boucles agent / bash inspectif / commit Windows | ✅ (doc [ENGINE-RUST…](ENGINE-RUST-AGENT-LOOPS.md) · rebuild `drox.exe` requis) |
| F | Moteur LLM — Ollama schema/system + LoopDetector thinking (KAT-Coder) | ✅ (doc [ENGINE-OLLAMA…](ENGINE-OLLAMA-THINKING-AND-LOOPS.md) · E16–E18 · rebuild `drox.exe`) |
| E | Unification mutateurs + export transcript dev | ✅ code + docs · rebuild `drox.exe` + smoke |

## Reporté → [1.5.21](../1.5.21/README.md) / [1.5.22](../1.5.22/README.md) / [1.5.23](../1.5.23/README.md)

| Sujet | Fiche |
|-------|--------|
| Shell discussion Agents ↔ IDE | [PLAN-SHARED-DISCUSSION-SHELL.md](../1.5.21/PLAN-SHARED-DISCUSSION-SHELL.md) |
| Tool calling universel | [PLAN-UNIVERSAL-TOOL-CALLING.md](../1.5.22/PLAN-UNIVERSAL-TOOL-CALLING.md) |
| Index `@Codebase` · embed · BDD locale | [ARCHITECTURE-CODEBASE-INDEX.md](../1.5.23/ARCHITECTURE-CODEBASE-INDEX.md) |
| Carte visuelle du code | [PLAN-CODE-MAP.md](../1.5.23/PLAN-CODE-MAP.md) |

## Suite immédiate → [1.5.20](../1.5.20/README.md)

| Sujet | Fiche |
|-------|--------|
| Bugs résiduels / chat IDE | [PLAN-RESIDUAL-BUGS.md](../1.5.20/PLAN-RESIDUAL-BUGS.md) |

## Décisions clés

- Badge = **indication permanente** de la branche de travail (pas seulement hover).
- Graphe = **fait maison**, comportement cible = **parité Git Graph**.
- Double-clic pastille → checkout (raccourci Drox).
- Observables **fins** (`currentBranch` vs fenêtre graphe).
- Socle layout isolé → réutilisable en 1.5.23 pour la carte code.
