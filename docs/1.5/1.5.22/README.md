# 1.5.22 — Auto-régulation + parité Agents

**Statut** : **en cours** · branche `1.5.22`  
**Version cible** : `droxVersion` **1.5.22**  
**Précédent** : [1.5.21](../1.5.21/README.md) — Codebase CB4/CB4b · shell discussion  
**Suite** : [1.5.23](../1.5.23/README.md) — Port forwarding · Théming (**reportés**)

## Ordre d’exécution (figé)

1. **CB3b** — catalogue admin index (cockpit)  
2. **A–D** — auto-régulation modèle (roadmap R0–R11)  
3. Explore / SAV / CB5 — **à arbitrer** (hors chemin critique)  
4. **Parité Agents (AG)** — exposer côté Agents ce qui est livré IDE (ex. Embed) — **fin de maj produit**  
5. **Fin de maj** — **relecture docs** (1.5.21 + 1.5.22) (**dernier**)

**Reporté → 1.5.23** : Port forwarding (PF) · Théming (THEME).

## Cap

Système **auto-régulateur** : on n’adapte pas les capacités du moteur, on adapte **ce qu’on expose au modèle** (L1–L5). Sonde + historique prompts + console + wrappers — **après** CB3b.  
Clôture produit 1.5.22 : **parité Agents** (même services, surface Agents).

**Abandonné** : tool calling « universel » tous providers.

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-CB3b-CATALOGUE.md](PLAN-CB3b-CATALOGUE.md) | Catalogue admin — **#1** |
| [PLAN-MODEL-AUTO-REGULATION.md](PLAN-MODEL-AUTO-REGULATION.md) | Leviers L1–L5 · console · histo · R0–R11 — **#2** |
| [Réf. notes / scorer](../../engine/model-regulation.md) | Formules v0 · signaux · Auto |
| [Pédagogie 15](../../pedagogie/15-regulation-et-notes.md) | Lecture guidée notes ≠ Auto |
| [PLAN-AGENTS-PARITY.md](PLAN-AGENTS-PARITY.md) | Parité Agents (Codebase + Regulation + RAG lazy) — **MVP** |
| [Réf. Codebase / RAG](../../engine/codebase-and-rag.md) | Index, coalesce, sync racine Agents |
| [PLAN-SUBAGENTS-EXPLORE-IDE.md](PLAN-SUBAGENTS-EXPLORE-IDE.md) | Explore / `task` IDE — à arbitrer |
| [PLAN-SAV-CHAT-ERRORS.md](PLAN-SAV-CHAT-ERRORS.md) | SAV retry + capture erreurs — à arbitrer |
| [FIX-BASH-REDIRECT-INSPECT.md](FIX-BASH-REDIRECT-INSPECT.md) | Redirects temp / hors workspace = inspect-only |
| → [1.5.23 PF](../1.5.23/PLAN-PORT-FORWARDING.md) | Port forward — **reporté** |
| → [1.5.23 THEME](../1.5.23/PLAN-THEMING.md) | Théming — **reporté** |

## Synthèse

| # | Sujet | Statut | Ordre |
|---|--------|--------|-------|
| **G** | CB3b catalogue admin | ✅ MVP + exclusions + rebuild | **1** |
| A–D | Auto-régulation (console · histo · L1–L5) | ✅ **R0–R11** | **2** |
| E | Explore IDE (`task` / subagents) | 📋 reporté | hors critique |
| F | SAV erreurs chat | 📋 reporté | hors critique |
| H | CB5 carte code (opt.) | 📋 reporté | hors critique |
| **AG** | Parité Agents (Embed & Regulation) | ✅ MVP badges historique + sync racine | **fin produit** |
| **DOC** | Relecture / MAJ docs (**1.5.21 + 1.5.22**) | 📋 | **fin** |
| **FIX** | Bash `>` scratch / hors WS ≠ mutateur | ✅ | dogfood |
| **PF** | Port forwarding | → [1.5.23](../1.5.23/README.md) | reporté |
| **THEME** | Théming | → [1.5.23](../1.5.23/README.md) | reporté |

## Décisions clés

- **CB3b d’abord**, régulation ensuite.  
- Explore / SAV / CB5 : arbitrage hors chemin critique.  
- **Fin de maj 1.5.22** : **AG** → **DOC** (R12).  
- **PF** et **THEME** : packagés dans **1.5.23**, pas dans la clôture actuelle.
