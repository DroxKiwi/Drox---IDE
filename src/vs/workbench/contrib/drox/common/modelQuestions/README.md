# Model questions (Drox)

Versionable **English** asks to the LLM. No NL heuristics in application code.

```text
modelQuestions/
  droxModelQuestionTypes.ts
  droxModelQuestionCatalog.ts      # register variants
  droxModelQuestionResolve.ts      # pick variant (settings / later auto-reg)
  droxModelQuestionParse.ts        # strict JSON → filter
  droxModelQuestionLlmCall.ts      # one-shot HTTP
  droxModelQuestionService.ts      # façade IDE
  questions/
    codebaseRetrievalComprehension.ts   # v1 + v1-compact
    exploreMissionDecompose.ts          # Explore Plan→Assign missions
```

Add a new ask: new file under `questions/`, append to catalog array, extend `DroxModelQuestionId` if needed.

Shipped asks:
- `codebase.retrieval.comprehension` (CB4b)
- `explore.mission.decompose` — session-master Explore fan-out plan
