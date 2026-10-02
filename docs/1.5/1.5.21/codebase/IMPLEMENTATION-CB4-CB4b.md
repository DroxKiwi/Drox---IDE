# Implémentation CB4 + CB4b (1.5.21)

**Statut** : ✅ code livré · smoke utilisateur en cours  
**Plans** : [PLAN-CB4.md](PLAN-CB4.md) · [PLAN-CB4b.md](PLAN-CB4b.md)  
**Anti-boucle lié** : [ENGINE-RUST-AGENT-LOOPS E16](../../1.5.19/ENGINE-RUST-AGENT-LOOPS.md) (`tool_family`)

## Flux runtime

```text
user message
  → ModelQuestion « codebaseRetrievalComprehension » (EN, variant settings)
  → IDroxCodebaseRetrievalFilter { searchQuery, pathPrefixes?, preferCodeFiles?, skipRetrieval? }
  → si force chip armé : pathPrefixes éditeur (fichier + parent/) écrasent le filtre modèle
  → index.search + rerank (preferCodeFiles seulement si flag modèle / force+éditeur)
  → formatDroxCodebaseContextBlock → system supplement
  → lastInject (cockpit + export diag)
```

## Fichiers

| Zone | Fichier | Rôle |
|------|---------|------|
| Pack | `common/codebase/droxCodebaseContextPack.ts` | Bloc system borné (top‑k, soft max chars) |
| Service | `common/codebase/droxCodebaseContextService.ts` | Auto ON/OFF, force-next, compréhension, search, lastInject |
| Force path | `common/codebase/droxCodebaseForcePath.ts` | Relatif workspace → prefixes (pur path) |
| Force UI | `browser/codebase/droxCodebaseForceEditorPath.ts` | Éditeur actif → prefixes |
| Bridge | `common/droxAgentRunBridge.ts` | Inject avant `agent.run` ; resolve force si armé |
| Chip | `browser/agents/droxAgentsComposerToolbar.ts` | Toggle Auto / Forced |
| Cockpit | `browser/codebase/cockpit/droxCodebaseCockpitInject.ts` | Last inject + Force paths |
| Export | `droxCodebaseSupervisionService.buildDiagnosticsExport` | Champ `lastInject` |
| CB4b | `common/modelQuestions/**` | Catalogue questions EN versionnées |
| CB4b | `questions/codebaseRetrievalComprehension.ts` | Variantes `v1` / `v1-compact` |
| CB4b | `common/codebase/droxCodebaseRerank.ts` | Boost path si `preferCodeFiles` |
| Ignore | `common/codebase/droxCodebaseIgnore.ts` | `.tsbuildinfo`, `.map` |
| Tests | `test/common/codebase/droxCodebase{ContextPack,Rerank,ForcePath}.test.ts` | |

## Settings

| Clé | Défaut | Effet |
|-----|--------|--------|
| `drox.codebase.autoInject` | `true` | Pack auto à chaque run |
| `drox.codebase.autoInjectMaxChars` | ~5k | Soft max bloc |
| `drox.modelQuestions.codebaseRetrievalComprehensionVariant` | `v1` | Texte EN de compréhension |

## Critères dogfood (exports)

1. **Auto** : prompt d’intention → `lastInject.hitCount > 0`, `forced: false`, hits utiles dans export.  
2. **Force + éditeur** : ouvrir un fichier source, chip Forced, envoyer → `lastInject.forced: true` + `forcePathPrefixes` non vide.  
3. **Auto OFF** : setting false → `skip: disabled` / hint seul ; `codebase_search` tool encore OK.  
4. **CB4b** : chitchat → `skip: model_skip` possible ; intention code → `searchQuery` EN + éventuellement `preferCodeFiles`.  
5. **Anti-boucle** (si retry findstr) : nudge `tool_family` puis abort — rebuild `drox.exe` requis.

## Hors scope (1.5.22)

CB3b catalogue admin · CB5 carte · Explore IDE · SAV erreurs · auto-sélection variante modelQuestions.
