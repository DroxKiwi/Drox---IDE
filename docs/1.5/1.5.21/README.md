# 1.5.21 — Index `@Codebase` + Explore IDE + shell discussion partagé

**Statut** : **en cours** · branche `1.5.21`  
**Version cible** : `droxVersion` **1.5.21**  
**Précédent** : [1.5.20](../1.5.20/README.md) — History / Changes IDE  
**Suite** : [1.5.22](../1.5.22/README.md) — tool calling universel

## `@Codebase` — tout est ici

| | |
|--|--|
| **Docs** | **[codebase/](codebase/README.md)** — ambition · archi · cockpit · CB1 · carte |
| **Code** | `src/vs/workbench/contrib/drox/{common,browser}/codebase/` |

Ne pas chercher les fiches index à la racine de `1.5.21/` : elles ont été regroupées sous `codebase/`.

## Autres chantiers 1.5.21

| Fiche | Sujet | Priorité |
|-------|--------|----------|
| [PLAN-SUBAGENTS-EXPLORE-IDE.md](PLAN-SUBAGENTS-EXPLORE-IDE.md) | Explore / `task` IDE (opt-in) | **#2** |
| [PLAN-SHARED-DISCUSSION-SHELL.md](PLAN-SHARED-DISCUSSION-SHELL.md) | Shell discussion Agents ↔ IDE | **#3** |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | `@Codebase` — docs + arborescence code | 🔄 [codebase/](codebase/README.md) · CB0 ✅ · **CB1** |
| B | Explore IDE | 📋 |
| C | Shell discussion partagé | 🔄 S0–S2 ✅ · S3–S5 |

## Décisions clés

- Index = retrieval local par **racine workspace** ; cockpit shell partagé ; embed llama.cpp RAM-first (voir [codebase/AMBITION.md](codebase/AMBITION.md)).
- Explore puis shell discussion ensuite.
- Tool calling → [1.5.22](../1.5.22/README.md).
