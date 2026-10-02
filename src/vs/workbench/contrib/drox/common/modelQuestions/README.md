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
```

Add a new ask: new file under `questions/`, append to catalog array, extend `DroxModelQuestionId` if needed.

First ask shipped (CB4b) : `codebaseRetrievalComprehension` — see `docs/1.5/1.5.21/codebase/IMPLEMENTATION-CB4-CB4b.md`.
