# `@Codebase` — hub 1.5.21

Index local par racine workspace · cockpit partagé · embed MiniLM (llama.cpp) · retrieval hybrid.

**Référence runtime (à jour)** : [`docs/engine/codebase-and-rag.md`](../../../engine/codebase-and-rag.md) — lazy Agents, coalesce, surfaces UI.  
**Parité Agents (1.5.22)** : [`PLAN-AGENTS-PARITY.md`](../../1.5.22/PLAN-AGENTS-PARITY.md).

## Docs

| Fiche | Sujet |
|-------|--------|
| [AMBITION.md](AMBITION.md) | But produit, cockpit, runtime embed |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Pipeline, store, phases |
| [PLAN-COCKPIT.md](PLAN-COCKPIT.md) | Spec UI supervision (+ hosts Agents) |
| [PLAN-EMBED-PACKAGING.md](PLAN-EMBED-PACKAGING.md) | GGUF bundlé / resolve paths |
| [PLAN-CB1.md](PLAN-CB1.md) | Store lexical + cockpit |
| [PLAN-CB2.md](PLAN-CB2.md) | Embed + hybrid |
| [PLAN-CB2b.md](PLAN-CB2b.md) | Auto-index (open + incrémental + coalesce Agents) |
| [PLAN-CB2c.md](PLAN-CB2c.md) | Découpage / lisibilité |
| [PLAN-CB3.md](PLAN-CB3.md) | Tool agent + pastille statut |
| [PLAN-CB4.md](PLAN-CB4.md) | **Contexte auto + forçage utilisateur** |
| [PLAN-CB4b.md](PLAN-CB4b.md) | Ranking / pertinence hits |
| [IMPLEMENTATION-CB4-CB4b.md](IMPLEMENTATION-CB4-CB4b.md) | **Carte fichiers + dogfood exports** |
| [PLAN-CODE-MAP.md](PLAN-CODE-MAP.md) | Lien carte code (plus tard) |

## Code

`src/vs/workbench/contrib/drox/{common,browser}/codebase/`

## Ordre des phases

| Phase | Livrable | Statut |
|-------|----------|--------|
| **CB0** / CB0b | Spec + IDs cockpit | ✅ |
| **CB1** | Lexical + cockpit | ✅ |
| **CB2** | Embed MiniLM + hybrid + probe | ✅ |
| **CB2b** | Auto-index (open + incrémental) + pipeline UI | ✅ · coalesce Agents → 1.5.22 |
| **CB2c** | Découpage fichiers / arborescence lisible | ✅ dogfood |
| **CB3** | Tool agent + pastille statut | ✅ dogfood |
| **CB4** | Contexte auto-inject + forçage chip/`@` → [PLAN-CB4.md](PLAN-CB4.md) | ✅ |
| **CB4b** | Ranking pertinence → [PLAN-CB4b.md](PLAN-CB4b.md) | ✅ |

**Livré ensuite (1.5.22)** : CB3b catalogue admin · parité Agents · régulation L1–L5.  
**Backlog** : CB5 carte code · Explore IDE.

**Règle** : CB3–CB4b faits en 1.5.21. Shell discussion = dernier chantier 1.5.21.
