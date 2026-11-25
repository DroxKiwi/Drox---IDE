# 06 — État d'intégration Cline → écosystème Drox

Document de suivi après la vague « intégration forte » (novembre 2026). Complète [`05-plan-transformation-moteur.md`](05-plan-transformation-moteur.md).

## Tableau mécaniques

| Mécanique Cline | Point d'ancrage Drox | Statut |
|-----------------|----------------------|--------|
| Budget 90 % / 97 % | [`ContextBudget::from_user_window`](../../drox-engine/drox/crates/drox-context/src/budget.rs) + `ContextPolicy::for_model_context_window` | **DONE** |
| Estimation requête Cline | `ClineStyleTokenCounter` + [`prepare_turn/request_load.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/prepare_turn/request_load.rs) + budget ÷ `underestimate_factor` ; shrink après situation card | **DONE** |
| `prepareTurn` shrink | [`run/shrink_phase.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/shrink_phase.rs) via `pre_turn` | **DONE** |
| Blocage pré-LLM | `at_blocking_limit` + notice `context_blocking` | **DONE** |
| Overflow provider | `LlmError::is_context_length_exceeded` + `try_context_overflow_recovery` + retry 1× | **DONE** |
| Args schema-aware | [`normalize_for_schema`](../../drox-engine/drox/crates/drox-tools/src/normalize_for_schema.rs) dans registry | **DONE** |
| Checkpoints workspace | `WorkspaceCheckpoint` + `DroxRunRevertService.checkpointActiveRun` + manifest `.drox/checkpoints/` | **DONE** (revert-first) |
| Clôture / notices / basic compact (vague 1) | Lots 1–4 doc 05 | **DONE** |

## prepareTurn — choix architecture

Façade **`run_shrink_phase`** (pas middleware unique) : situation card, puis hot snip → microcompact → snip → live/basic ; nudges système **après** shrink (marge conservative). Décision compaction sur **`request_tokens`** (messages + outils). `loop_detect/` et `text_gates` restent hors shrink.

## Checkpoints

- **Contexte LLM** : `format_compact_checkpoint` / compaction live (inchangé).
- **Workspace** : snapshot via `DroxRunRevertService` (fichiers trackés) ; corrélation dans `manifest.jsonl` ; restore via `revertToCommit` / historique run.

Shadow-git : **hors v1** (cf. plan).

## Validation

```bash
cd drox-engine/drox
cargo test -p drox-context -p drox-tools -p drox-engine --lib
```

Manuel : run long `num_ctx` 32k → compaction avant ~90 % ; checkpoint avant lot mutateur ; restore commit si run terminé.