# Model questions (Drox IDE)

Versionable **English** asks used by the IDE host (not the engine agent loop).

Session boot intent (`isWork` / `isAnalysis` / `isDocIngestion`) lives in the
engine via `drox-prompts` (`model_question.session.user_intent`) — do **not**
reintroduce an IDE-side work classifier for `workPlanFrame`.

```text
modelQuestions/
  droxModelQuestionTypes.ts
  droxModelQuestionCatalog.ts
  droxModelQuestionResolve.ts
  droxModelQuestionParse.ts
  droxModelQuestionLlmCall.ts
  droxModelQuestionService.ts
  questions/
    codebaseRetrievalComprehension.ts   # v1 + v1-compact
```

Shipped asks:
- `codebase.retrieval.comprehension` (CB4b)
