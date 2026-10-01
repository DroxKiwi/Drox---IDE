# `@Codebase` — hub 1.5.21

Index local par racine workspace · cockpit partagé · embed MiniLM (llama.cpp) · retrieval hybrid.

## Docs

| Fiche | Sujet |
|-------|--------|
| [AMBITION.md](AMBITION.md) | But produit, cockpit, runtime embed |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Pipeline, store, phases |
| [PLAN-COCKPIT.md](PLAN-COCKPIT.md) | Spec UI supervision |
| [PLAN-EMBED-PACKAGING.md](PLAN-EMBED-PACKAGING.md) | GGUF bundlé / resolve paths |
| [PLAN-CB1.md](PLAN-CB1.md) | Store lexical + cockpit |
| [PLAN-CB2.md](PLAN-CB2.md) | Embed + hybrid |
| [PLAN-CB2b.md](PLAN-CB2b.md) | Auto-index type Cursor |
| [PLAN-CB2c.md](PLAN-CB2c.md) | Découpage / lisibilité |
| [PLAN-CB3.md](PLAN-CB3.md) | Tool agent + pastille statut |
| [PLAN-CODE-MAP.md](PLAN-CODE-MAP.md) | Lien carte code (plus tard) |

## Code

`src/vs/workbench/contrib/drox/{common,browser}/codebase/`

## Ordre des phases

| Phase | Livrable | Statut |
|-------|----------|--------|
| **CB0** / CB0b | Spec + IDs cockpit | ✅ |
| **CB1** | Lexical + cockpit | ✅ |
| **CB2** | Embed MiniLM + hybrid + probe | ✅ |
| **CB2b** | Auto-index (open + incrémental) + pipeline UI | ✅ |
| **CB2c** | Découpage fichiers / arborescence lisible | ✅ dogfood |
| **CB3** | Tool agent + pastille statut | ✅ dogfood |
| **CB3b** | Catalogue admin | ⏳ |
| **CB4** | `@Codebase` composer | ⏳ **next** |
| **CB5** | Carte code (opt.) | ⏳ |

**Règle** : CB2c avant CB3 — fait. Suite produit typique : **CB4** (`@` composer).
