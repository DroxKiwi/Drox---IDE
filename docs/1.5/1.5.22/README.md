# 1.5.22 — Auto-régulation + parité Agents

**Statut** : **clôturé** · [CLOSURE](CLOSURE-1.5.22.md) · `droxVersion` **1.5.22**  
**Précédent** : [1.5.21](../1.5.21/README.md) — Codebase CB4/CB4b · shell discussion  
**Suite** : [1.5.23](../1.5.23/README.md) — Port forwarding · Théming

## Ordre d’exécution (figé — terminé)

1. **CB3b** — catalogue admin index (cockpit) ✅  
2. **A–D** — auto-régulation modèle (roadmap R0–R11) ✅  
3. Explore / SAV / CB5 — **reportés** (hors chemin critique)  
4. **Parité Agents (AG)** — Codebase + Regulation sur Agents ✅  
5. **DOC (R12)** — relecture docs 1.5.21 + 1.5.22 ✅

**Reporté → 1.5.23** : Port forwarding (PF) · Théming (THEME).

## Cap

Système **auto-régulateur** : on n’adapte pas les capacités du moteur, on adapte **ce qu’on expose au modèle** (L1–L5). Sonde + historique prompts + console + wrappers — **après** CB3b.  
Clôture produit 1.5.22 : **parité Agents** (mêmes services, surface Agents) + pass docs.

**Abandonné** : tool calling « universel » tous providers.

## Docs

| Fiche | Sujet |
|-------|--------|
| [CLOSURE-1.5.22.md](CLOSURE-1.5.22.md) | Clôture |
| [PLAN-CB3b-CATALOGUE.md](PLAN-CB3b-CATALOGUE.md) | Catalogue admin — **#1** |
| [PLAN-MODEL-AUTO-REGULATION.md](PLAN-MODEL-AUTO-REGULATION.md) | Leviers L1–L5 · console · histo · R0–R12 |
| [Réf. notes / scorer](../../engine/model-regulation.md) | Formules v0 · signaux · Auto |
| [Pédagogie 15](../../pedagogie/15-regulation-et-notes.md) | Lecture guidée notes ≠ Auto |
| [PLAN-AGENTS-PARITY.md](PLAN-AGENTS-PARITY.md) | Parité Agents (Codebase + Regulation + RAG lazy) |
| [Réf. Codebase / RAG](../../engine/codebase-and-rag.md) | Index, coalesce, sync racine Agents |
| [PLAN-SUBAGENTS-EXPLORE-IDE.md](PLAN-SUBAGENTS-EXPLORE-IDE.md) | Explore / `task` IDE — backlog |
| [PLAN-SAV-CHAT-ERRORS.md](PLAN-SAV-CHAT-ERRORS.md) | SAV retry + capture erreurs — backlog |
| [FIX-BASH-REDIRECT-INSPECT.md](FIX-BASH-REDIRECT-INSPECT.md) | Redirects temp / hors workspace = inspect-only |
| → [1.5.23 PF](../1.5.23/PLAN-PORT-FORWARDING.md) | Port forward |
| → [1.5.23 THEME](../1.5.23/PLAN-THEMING.md) | Théming |

## Synthèse

| # | Sujet | Statut | Ordre |
|---|--------|--------|-------|
| **G** | CB3b catalogue admin | ✅ MVP + exclusions + rebuild | **1** |
| A–D | Auto-régulation (console · histo · L1–L5) | ✅ **R0–R11** | **2** |
| E | Explore IDE (`task` / subagents) | 📋 backlog | hors critique |
| F | SAV erreurs chat | 📋 backlog | hors critique |
| H | CB5 carte code (opt.) | 📋 backlog | hors critique |
| **AG** | Parité Agents (Codebase & Regulation) | ✅ MVP badges + sync racine | **fin produit** |
| **DOC** | Relecture / MAJ docs (**1.5.21 + 1.5.22**) | ✅ **R12** | **fin** |
| **FIX** | Bash `>` scratch / hors WS ≠ mutateur | ✅ | dogfood |
| **PF** | Port forwarding | → [1.5.23](../1.5.23/README.md) | reporté |
| **THEME** | Théming | → [1.5.23](../1.5.23/README.md) | reporté |

## Décisions clés

- **CB3b d’abord**, régulation ensuite.  
- Explore / SAV / CB5 : hors chemin critique (backlog).  
- Fin de maj 1.5.22 : **AG** → **DOC** (R12) — **fait**.  
- **PF** et **THEME** : packagés dans **1.5.23**.
