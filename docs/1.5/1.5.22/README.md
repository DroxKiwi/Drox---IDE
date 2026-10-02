# 1.5.22 — Auto-régulation + reportés 1.5.21

**Statut** : **préparé** · pas encore implémenté  
**Version cible** : `droxVersion` **1.5.22**  
**Précédent** : [1.5.21](../1.5.21/README.md) — `@Codebase` CB4/CB4b · shell discussion  
**Suite** : libre (plus de 1.5.23 réservé)

## Cap

Système **auto-régulateur** qui mesure la réussite du modèle en conditions réelles et **adapte** le moteur (prompt, outils exposés, complexité) selon des scores internes.

**Abandonné** : tool calling « universel » tous providers.

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-MODEL-AUTO-REGULATION.md](PLAN-MODEL-AUTO-REGULATION.md) | Scores, panel live, adaptation |
| [PLAN-SUBAGENTS-EXPLORE-IDE.md](PLAN-SUBAGENTS-EXPLORE-IDE.md) | Explore / `task` IDE (opt-in) — **reporté 1.5.21** |
| [PLAN-SAV-CHAT-ERRORS.md](PLAN-SAV-CHAT-ERRORS.md) | SAV retry + capture erreurs chat — **reporté 1.5.21** |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Scores internes multi-axes | 📋 |
| B | Panel live | 📋 |
| C | Adaptation prompt / tools / complexité | 📋 |
| D | Opt-in utilisateur | 📋 |
| E | Explore IDE (`task` / subagents) | 📋 reporté |
| F | SAV erreurs chat | 📋 reporté |
| G | CB3b catalogue admin index | 📋 reporté |
| H | CB5 carte code (opt.) | 📋 reporté |

## Décisions clés

- Objectif = **auto-ajustement du moteur au modèle** (défaut off jusqu’à dogfood).
- Scores **mathématiques / observables** + panel live.
- Explore / SAV / admin index / carte : reportés depuis 1.5.21 (non démarrés).
