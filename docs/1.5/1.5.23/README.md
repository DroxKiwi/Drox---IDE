# 1.5.23 — Tool calling universel

**Statut** : **préparé** · après shell 1.5.22  
**Version cible** : `droxVersion` **1.5.23**  
**Précédent** : [1.5.22](../1.5.22/README.md) — shell discussion partagé Agents ↔ IDE

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
- Reporté hors **1.5.21** pour prioriser **index `@Codebase` + Explore**.

## Origine

Était le focus 1.5.21. **Reporté en 1.5.23** : BDD vectorielle locale + Explore d’abord (1.5.21), puis shell discussion (1.5.22).
