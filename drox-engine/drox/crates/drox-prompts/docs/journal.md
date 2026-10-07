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

## 2026-10-07 — Soft nudge work sans plan (dogfood V2)

- **Contexte** : dogfood docs pédagogie — 566 tools parent, 0 todo / 0 task ; modèle reportait le plan après `dir`.
- **Canal** : B — `runtime.work_without_plan` (Prefer, one-shot) ; seuil 2 outils pre-plan (`bash`/`file_read`/…).
- **Ids** : `runtime.work_without_plan` ; claim `work.prefer_todo_before_parent_inventory=prefer`.
- **Effet modèle** : rappel soft « préfère todo_write maintenant » ; needles peuvent ignorer ; **aucun** blocked tool.
- **Carte** : ligne canal B + delta DOC (dir → preferred next = todo).

## 2026-10-07 — Étape 3 : discipline d’ajout + strength

- **Contexte** : figer comment on ajoute des fiches sans rerégénérer de dose.
- **Canal** : doc (`docs/adding.md`, `docs/verification.md`) ; enum `PromptStrength` sans `Soft`.
- **Ids** : n/a (process) ; strength = Prefer | MustText.
- **Effet modèle** : aucun immédiat ; moins de risque de régression dose.
- **Carte** : dette Soft cochée ; lien vérif V1–V6.

## 2026-10-07 — Étape 2 : sync intent-write + hygiène orphelins

- **Contexte** : catalogue aligné sur la mécanique FX-B ; dead code IDE isWork.
- **Canal** : B (`gates.intent_only_write*`) ; retrait fiche `gates.large_write_chunk` ; IDE modelQuestions sans `session.user_message_is_work`.
- **Ids** : `when` → `phase_acting_without_tool_calls` (+strike2) ; claim `mutation.acting_without_tools=forbidden`.
- **Effet modèle** : nudge parle d’`acting` sans tools (plus de « Je vais écrire »).
- **Carte** : S5 + dette.

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
