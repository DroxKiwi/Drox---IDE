# Plan CB3 — Tool agent + pastille `@Codebase`

**Parent** : [PLAN-CB2c.md](PLAN-CB2c.md) · [ARCHITECTURE.md](ARCHITECTURE.md)  
**Suite** : **CB3b** (catalogue admin) · **CB4** (`@` composer)  
**Statut** : ✅ **done** (dogfood tool + pastille)

## Livrable

1. Tool agent **`codebase_search`** (remote IDE, miroir `session_search`) → `IDroxCodebaseIndexService.search`.
2. Pastille statut dans la toolbar composer Agents / chat → ouvre le cockpit Codebase.

## Hors scope

- Mentions `@Codebase` dans le composer (CB4)
- Catalogue admin delete/compact (CB3b)
- Auto-inject contexte sans tool

## Critères d’acceptation

1. ✅ L’agent peut appeler `codebase_search` via `tool/exec` et recevoir des hits path/lignes/preview.
2. ✅ Pastille affiche idle / indexing / error / lexical|hybrid et ouvre la vue Codebase au clic.
3. ✅ Reindex manuel reste dans le cockpit (pas de bouton Reindex dans l’input).

## Dogfood (2026-10-01)

- Transcript `ses_a24f58c7…` : `codebase_search` → `fetchMetrics()` → 1 hit `src/app/page.tsx`.
- Mode pastille / cockpit : **hybrid** seulement si runtime embed `built` + modèle chargé + vecteurs (sinon lexical honnête).
- Binaire dogfood : `drox-cli --features embed` packagé sous `resources/drox/win32-x64/`.

## Suite

**CB4** (`@` composer) ou **CB3b** (catalogue admin).