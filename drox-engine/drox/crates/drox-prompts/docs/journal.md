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

## 2026-10-08 — Explore rapport : harden + notes filtrées + executionThink

- **Contexte** : dogfood — phase rapport en CoT (« Let me distill… ») acceptée comme `ok` ; kinds méta/outline.
- **Canal** : E — refuse soft markdown si JSON invalide ; lint stub méta/CoT ; `prepare_synth_notes` ; setting `drox.subagents.executionThink` (défaut off, rapport toujours off).
- **Effet** : `kinds_incomplete` / `truncated` honnêtes quand le livrable est pourri ; moins de notes CoT injectées au synth.

## 2026-10-08 — Explore artefacts P-safe + P-json

- **Contexte** : dogfood — extract `## kind` **first-match** prenait l’outline CoT → stubs / `kinds_incomplete` pourris ; phase 1 disait encore d’écrire les headers.
- **Canal** : E — `explore.system` (pas de headers phase 1) ; `explore.report_synthesis` JSON ; extract **last-match** + lint stub ; `format_kinds_contract` phase1 vs `format_kinds_json_contract` phase2.
- **Ids** : `explore.report.format=json_kinds` ; `write_explore_bundle(kind_bodies)` ; retry parse JSON une fois.
- **Effet** : artefacts remplis depuis JSON (ou fallback markdown sain) ; stub → `kinds_incomplete`.
- **Doc** : [`PLAN-EXPLORE-RETURN-CONTRACTS.md`](../../../../../docs/1.6/1.6.0/PLAN-EXPLORE-RETURN-CONTRACTS.md) §5 / §10.

## 2026-10-08 — Explore child E1+E2 : stop sur answering (pas de DONE_ONLY)

- **Contexte** : dogfood Explore #2 abort `text_only` ×3 — enfant coincé entre answering et DONE_ONLY / nudges de clôture parent.
- **Canal** : E (prompt `explore.system`) + drive `explore_execution` : answering/done sans tool → Stop ; phase rapport suit.
- **Ids** : `explore.system` ; claim `explore.execution_stop_on_answering=true` ; `AgentConfig.explore_execution`.
- **Effet** : consignes enfant alignées (ne pas attendre nudges / ne pas répéter la clôture).

## 2026-10-08 — Thinking court + action over narration (Prefer)

- **Contexte** : dogfood thinking trop long ; besoin d’un biais qui **suit tout le run** (canal A).
- **Canal** : A — CORE Style « prefer action over narration » ; `session.native_thinking` « keep thinking short → tool ».
- **Ids** : `session.core`, `session.native_thinking` ; claims `style.action_over_narration=prefer`, `thinking.concise=prefer`.
- **Complément dogfood** : `reasoningEffort=low` / L3 assertive côté UI (hors prompts).

## 2026-10-08 — Mid-run status → `[phase: answering]` (option A)

- **Contexte** : dogfood — « Salut / Je vais d’abord… » tombait en thinking / trace, invisible comme bulle chat.
- **Canal** : A — CORE (`answering` ×3 usages + règle 8 mid-run) ; `session.native_thinking` (interdit statut user only-in-thinking).
- **Ids** : `session.core`, `session.native_thinking` ; claim `answering.mid_run_status=prefer`.
- **Effet modèle** : Prefer soft — pas de nouveau canal ni hard gate ; rattrapage B/C reporté.

## 2026-10-07 — task.return_options coerce + même cadre Explore au retry

- **Contexte** : dogfood — modèle envoie `return_options` en string JSON → échec pré-spawn + **nouveau** cadre UI à chaque retry.
- **Canal** : C — coerce string→objet dans `task` ; prompt « object only » ; UI IDE/Agents réutilise le cadre après erreur (même titre mission).
- **Ids** : `tools.task.description` ; `normalize_task_input` ; `exploreCard` / `droxAgentsChatSink` alias.

## 2026-10-07 — Contrats retour Explore E1–E4 (code)

- **Contexte** : kinds typés + options + artefacts vérifiés + index blurbs **scopé `ses_`**.
- **Canal** : C (`task.return_kinds` / `return_options`) ; artefacts `.drox/subagents/<sessionId>/<exploreId>/` ; tools `explore_index_list` / `explore_artifact_read` ; A supplement Explore.
- **Ids** : `tools.task.description`, `tools.explore_index_list.description`, `tools.explore_artifact_read.description`, `session.subagents.explore`.
- **Effet modèle** : parent coche formats → phase2 JSON → artefacts vérifiés → navigation blurbs sans cross-chat. (voir entrée P-safe/P-json du 2026-10-08)
- **Doc** : [`PLAN-EXPLORE-RETURN-CONTRACTS.md`](../../../../../docs/1.6/1.6.0/PLAN-EXPLORE-RETURN-CONTRACTS.md).

## 2026-10-07 — Ambition contrats retour Explore (doc only)

- **Contexte** : `must_return` prose insuffisant ; besoin kinds typés + options + index blurbs **scopé discussion**.
- **Suite** : livré E1–E4 (entrée ci-dessus).

## 2026-10-07 — Post-merge + anti-rotation + inventaire RO hors-WS

- **Contexte** : dogfood spirale `file_read` post-Explore ; glob/grep `path escapes` alors que `file_read` passait.
- **Canal** : B — `runtime.post_merge_closure` (après `task` non tronqué) ; `runtime.rotating_file_read` (fenêtre 10, ≥6 reads, ≥2 paths ×≥2).
- **Tools** : `glob` / `grep` alignés `file_read` — inventaire RO absolu hors-WS **toujours** ; write toggle inchangé.
- **Ids** : `runtime.post_merge_closure`, `runtime.rotating_file_read` ; claims `outside_ws.grep_glob=always`.
- **Carte** : canal B + hors-WS inventaire.

## 2026-10-07 — Hors-WS split read/write + panic Explore UTF-8

- **Contexte** : dogfood Sync Explore orphelin (`Run ended without tool result`) + inventaire hors-WS bloqué.
- **Canal** : A (supplements read/write) ; tools glob/grep = read ; mutations = write ; Explore hérite read, write=false.
- **Ids** : `session.outside_ws.read`, `session.outside_ws.write` (remplace toggle unique).
- **Fiabilité** : `build_live_preview` tronque sur frontière UTF-8 ; `task` catch_unwind → tool_result erreur au lieu d’orphan parent.
- **Carte** : ligne canal A hors-WS mise à jour.
- **Suite** : inventaire RO toujours (entrée du jour ci-dessus) — le toggle read reste un rappel produit.

## 2026-10-07 — Soft nudge étape sans Explore

- **Contexte** : après kickoff, le parent peut encore enchaîner sans `task` pour l’étape.
- **Canal** : B — compteur parent (même filtre que work_without_plan) tant que step `in_progress` et pas de `task` réussi ; reset au changement d’étape.
- **Ids** : `runtime.step_without_explore` ; seuil 2 ; one-shot / step.
- **Effet modèle** : rappel soft Prefer ; tools libres ; needle OK.
- **Carte** : ligne canal B ajoutée.

## 2026-10-07 — Soft nudge work sans plan (élargissement)

- **Contexte** : rappel dès que le modèle **travaille** sans plan (pas seulement lectures).
- **Canal** : B — compteur = tout outil réussi sauf `todo_write` / `course_plan_write` / `ask_user_question` / `session_end`.
- **Ids** : `runtime.work_without_plan` ; claim `work.prefer_todo_when_working=prefer`.
- **Effet modèle** : même soft one-shot ; ignore OK si needle / one-shot légitime.
- **Carte** : ligne canal B mise à jour.

## 2026-10-07 — Soft nudge work sans plan (dogfood V2)

- **Contexte** : dogfood docs pédagogie — 566 tools parent, 0 todo / 0 task ; modèle reportait le plan après `dir`.
- **Canal** : B — `runtime.work_without_plan` (Prefer, one-shot) ; seuil 2 (d’abord limité aux outils d’exploration).
- **Ids** : `runtime.work_without_plan`.
- **Effet modèle** : rappel soft ; **aucun** blocked tool.
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
