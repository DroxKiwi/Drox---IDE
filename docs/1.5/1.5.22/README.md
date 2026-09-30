# 1.5.22 — Tool calling universel

**Statut** : **préparé** · après index / Explore / shell 1.5.21  
**Version cible** : `droxVersion` **1.5.22**  
**Précédent** : [1.5.21](../1.5.21/README.md) — index `@Codebase` + Explore + shell discussion  
**Suite** : [1.5.23](../1.5.23/README.md) — réservé

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-UNIVERSAL-TOOL-CALLING.md](PLAN-UNIVERSAL-TOOL-CALLING.md) | **Plan principal** — tool calling universel (tous providers) |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| T0 | Inventaire écarts provider / formats tool call | 📋 |
| T1 | Normalisation moteur → protocole unique | 📋 |
| T2 | Smoke multi-provider (Ollama, OpenAI-compat, etc.) | 📋 |
| T3 | CLOSURE + docs | 📋 |

## Décisions clés

- Un **chemin unique** côté moteur pour les tool calls, indépendant du provider.
- Reporté hors **1.5.21** pour prioriser index `@Codebase`, Explore et shell discussion.

## Origine

Était 1.5.21 puis 1.5.23. **Placé en 1.5.22** après remontée du shell discussion dans 1.5.21.
