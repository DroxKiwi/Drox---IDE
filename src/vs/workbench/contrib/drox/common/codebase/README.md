# `@Codebase` (contrib/drox)

Workbench modules for the local codebase index  
(CB1 lexical → CB2 MiniLM hybrid → CB2b auto-index → CB3 tool → **CB4 inject** → **CB4b modelQuestions**).

Docs : `docs/1.5/1.5.21/codebase/` · carte fichiers [IMPLEMENTATION-CB4-CB4b.md](../../../../../../docs/1.5/1.5.21/codebase/IMPLEMENTATION-CB4-CB4b.md)

## Layout (CB2c + CB4)

```text
common/codebase/
  droxCodebaseTypes.ts / PipelineView.ts   # snapshots + pipeline + lastInject
  droxCodebase*Paths|Ignore|Chunker|…      # pure helpers
  droxCodebaseContextPack.ts               # CB4 format hits → system block
  droxCodebaseContextService.ts            # CB4 auto-inject + force-next + lastInject
  droxCodebaseForcePath.ts                 # CB4 force: workspace-relative prefixes
  droxCodebaseRerank.ts                    # CB4b path boost iff preferCodeFiles
  droxCodebaseIndexService.ts              # interface
  droxCodebaseIndexServiceImpl.ts          # thin orchestration
  index/                                   # scan / ensure+invalidate / embed / emit
  supervision/                             # auto-index, watcher filter, pipeline log
  droxCodebaseSupervisionService.ts        # cockpit + diag export (lastInject)

common/modelQuestions/                     # CB4b EN comprehension catalog
  questions/codebaseRetrievalComprehension.ts

browser/codebase/
  droxCodebaseCockpitViewPane.ts
  droxCodebaseForceEditorPath.ts           # active editor → force prefixes
  cockpit/                                 # embed / inject / pipeline / probe
  media/

browser/agents/
  droxAgentsComposerToolbar.ts             # Codebase force chip
```

Engine side: `drox-cli` embed handlers · LoopDetector `tool_family` (bash/grep) in `drox-engine` agent.rs.

Soft max ~250–300 LOC / file (excl. CSS / tests).
