# `@Codebase` (contrib/drox)

Workbench modules for the local codebase index (CB1 lexical → CB2 MiniLM hybrid → CB2b auto-index / pipeline).

## Layout (CB2c)

```text
common/codebase/
  droxCodebaseTypes.ts / PipelineView.ts   # snapshots + pipeline builders
  droxCodebase*Paths|Ignore|Chunker|…      # pure helpers
  droxCodebaseIndexService.ts              # interface
  droxCodebaseIndexServiceImpl.ts          # thin orchestration
  index/                                   # scan / ensure+invalidate / embed / emit
  supervision/                             # auto-index, watcher filter, pipeline log, embed UI glue
  droxCodebaseSupervisionService.ts        # cockpit façade

browser/codebase/
  droxCodebaseCockpitViewPane.ts           # shell
  cockpit/                                 # embed / pipeline / probe renderers
  media/
```

Engine side: `drox-cli/src/jsonrpc/handlers/embed.rs` (`embed.status|load|encode`).

Soft max ~250–300 LOC / file (excl. CSS / tests). Behavior changes belong in CB3+, not here.
