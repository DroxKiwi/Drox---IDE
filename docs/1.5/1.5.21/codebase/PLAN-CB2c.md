# Plan CB2c — Découpage / lisibilité `@Codebase`

**Parent** : [PLAN-CB2b.md](PLAN-CB2b.md) · [ARCHITECTURE.md](ARCHITECTURE.md)  
**Suite** : **CB3** (tool agent) — **uniquement après** CB2c  
**Statut** : ✅ **done** · découpage lisibilité (avant CB3)

## Pourquoi maintenant

Le code 1.5.21 a grossi vite (auto-index, pipeline, embed, cockpit).  
Des fichiers dépassent le confort de lecture (~500–600 lignes TS ; `jsonrpc/handlers.rs` ~1364).  
Avant d’ajouter le tool agent (CB3), on **découpe** pour que l’arborescence reste instinctive.

## Règles de découpe

| Règle | Cible |
|-------|--------|
| Soft max | **~250–300 lignes** / fichier source (hors tests / CSS) |
| 1 job / fichier | Un souci métier clair dans le nom |
| Pas de big-bang | Extraire par tranche, compiler / dogfood entre chaque |
| Zéro changement produit | Comportement inchangé (refactor only) |

## Constat (après découpe CB2c — lignes approx.)

| Fichier | ~Lignes | Note |
|---------|---------|------|
| `handlers/mod.rs` | **~1340** | Agent/sessions restent ; **embed extrait** |
| `handlers/embed.rs` | **~30** | `embed.status/load/encode` |
| `droxCodebaseSupervisionService.ts` | **~340** | Façade (helpers sous `supervision/`) |
| `index/droxCodebaseIndexIncremental.ts` | **~210** | ensure + invalidate |
| `droxCodebaseIndexServiceImpl.ts` | **~200** | Orchestration fine |
| `droxCodebaseCockpitViewPane.ts` | **~190** | Shell ; UI sous `cockpit/` |

## Arborescence cible — workbench

```text
contrib/drox/
  common/codebase/
    README.md
    droxCodebaseTypes.ts              # types / snapshots seulement
    droxCodebasePipelineView.ts       # buildDroxCodebasePipelineView + empty
    droxCodebasePaths.ts
    droxCodebaseIgnore.ts
    droxCodebaseChunker.ts
    droxCodebaseLexicalSearch.ts
    droxCodebaseHybrid.ts
    droxCodebaseJsonStore.ts
    droxCodebaseEmbedClient.ts
    droxCodebaseEmbedPaths.ts
    droxCodebaseIndexService.ts       # interface + decorator
    index/
      droxCodebaseIndexServiceImpl.ts # orchestration fine (~200)
      droxCodebaseIndexScan.ts        # walk / collect files
      droxCodebaseIndexIncremental.ts # invalidate + hash reuse
      droxCodebaseIndexEmbed.ts       # merge / encode batches + emit
      droxCodebaseIndexPipelineEmit.ts
    supervision/
      droxCodebaseSupervisionService.ts  # façade
      droxCodebaseAutoIndex.ts           # bootstrap open
      droxCodebaseFileWatcher.ts         # debounce invalidate
      droxCodebasePipelineLog.ts         # ring buffer + export diag
  browser/codebase/
    droxCodebase.contribution.ts
    droxCodebaseCockpitViewPane.ts    # shell + layout (~150)
    cockpit/
      droxCodebaseCockpitEmbed.ts
      droxCodebaseCockpitPipeline.ts
      droxCodebaseCockpitProbe.ts
      droxCodebaseCockpitStorage.ts
    media/droxCodebaseCockpit.css
```

## Arborescence cible — moteur (embed RPC)

```text
drox-cli/src/jsonrpc/
  handlers.rs              # thin re-exports / dispatch only
  handlers/
    mod.rs
    embed.rs               # embed.status / load / encode  ← extraire d’abord
    sessions.rs            # (tranche suivante si besoin)
    agent_run.rs           # (tranche suivante)
    …
```

**Priorité CB2c** : `handlers/embed.rs` + découpe TS `index/` + `supervision/` + `cockpit/`.  
Le reste de `handlers.rs` (agent 700+ lignes) peut suivre en sous-tranches sans bloquer CB3 **si** embed est déjà sorti.

## Ordre d’exécution suggéré

1. Extraire **types pipeline** → `droxCodebasePipelineView.ts`  
2. Extraire **emit + embed batch** de l’index service  
3. Extraire **auto-index + watcher + pipeline log** de supervision  
4. Découper **cockpit** en sous-vues  
5. Extraire **`jsonrpc/handlers/embed.rs`**  
6. (Optionnel) ignorer `.commitmsg` / `*.tsbuildinfo` en passant dans `Ignore`

## Critères d’acceptation

1. Aucun fichier `@Codebase` TS > ~300 lignes (hors CSS).  
2. `embed.*` RPC dans un module dédié, plus noyé dans le monolithe handlers.  
3. Comportement dogfood inchangé : auto-index, hybrid probe, pipeline chips, export diag.  
4. Docs hub / phases mises à jour : **CB2b → CB2c → CB3**.

## Hors scope CB2c

- Tool agent / pastille chat (CB3)  
- Changement d’algo d’embed ou de store  
- Rewrite complet de `protocol.rs` / `agent_run` (peut être CB2c-bis)
