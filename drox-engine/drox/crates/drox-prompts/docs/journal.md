# Journal des injections

Entrées **datées**, du plus récent au plus ancien.  
But : tracer *ce qui a changé* dans ce que le modèle reçoit (pas le détail de chaque commit git).

Format suggéré :

```markdown
## YYYY-MM-DD — titre court

- **Contexte** : …
- **Canal** : A / B / C / D / E (voir injection-map.md)
- **Ids** : `session.…`, `runtime.…`, …
- **Effet modèle** : …
- **Carte** : section(s) `injection-map.md` mises à jour (si oui)
```

---

## 2026-10-07 — Étape 1 : une voix Plan→Assign→Merge

- **Contexte** : désempiler la dose turn-0 (CORE + supplement + frames synonymes).
- **Canal** : A (CORE allégé) + B (frames delta) ; protocole canonique reste A `session.subagents.explore`.
- **Ids** : `session.core`, `runtime.work_plan_frame`, `runtime.doc_ingestion`, `runtime.analyzing_phase`, `runtime.s5_heavy_read` (+ `context_load_nudge` builder).
- **Effet modèle** : S2/S3/S4 — un playbook Explore, frames = signal situationnel seulement.
- **Carte** : scénarios S2–S4 + dette mise à jour.

## 2026-10-07 — Catalogue `drox-prompts` + boot multi-bool + intent mécanique

- **Contexte** : centralisation des textes LLM hors facades CLI/engine ; cohérence hors fork VS Code.
- **Canal** :
  - **A** : bodies CORE / session / explore / compaction migrés dans ce crate ; CLI ne fait plus que assembler.
  - **B** : nudges / gates / blocks rebranchés depuis le catalogue ; FX-B = `[phase: acting]` sans `tool_calls` (plus de needles NL assistant/user).
  - **C** : descriptions tools → `tools.rs`.
  - **D** : nouvel ask `model_question.session.user_intent` (`isWork` / `isAnalysis` / `isDocIngestion`) — classif moteur au boot ; IDE ne pose plus `workPlanFrame` via `isWork`.
  - **E** : Explore child `session_intent_preclassified: true` (évite ask sur le brief tâche).
- **Ids** : tout le registre initial `catalog.rs` (~40 non-tools + tools) ; claim partagé ex. `outside_ws.file_read=always`, `plan_assign_merge=soft_prefer`.
- **Effet modèle** : même doctrine soft Plan→Assign, mais **dose turn-0** encore empilée (CORE + supplement Explore + work/doc frames) — documenté comme dette dans la carte.
- **Carte** : création de `docs/injection-map.md` + ce journal + `README.md` crate.

## (template) — prochaine entrée

- **Contexte** :
- **Canal** :
- **Ids** :
- **Effet modèle** :
- **Carte** :
