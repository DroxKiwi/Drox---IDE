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
    userMessageIsWork.ts                # Work vs discussion (plan frame)
```

Add a new ask: new file under `questions/`, append to catalog array, extend `DroxModelQuestionId` if needed.

Shipped asks:
- `codebase.retrieval.comprehension` (CB4b)
- `session.user_message_is_work` — **legacy IDE-only**; session boot intent
  (work / analysis / doc) is owned by the engine via `drox-prompts`
  multi-bool JSON (`model_question.session.user_intent`). Do not drive
  `workPlanFrame` from the IDE.
