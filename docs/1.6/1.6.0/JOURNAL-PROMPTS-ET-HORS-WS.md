# Journal — prompts centralisés · Plan/Explore soft · hors-WS · dogfood (1.6.0)

**Période** : 2026-10-07 (post Vague 4)  
**Statut** : code en branche `1.6.0` · dogfood manuel en cours · **pas** encore ship  
**But de cette fiche** : historique sérieux des lots livrés *après* les Vagues 1–4 « boucles/contexte », pour ne pas les perdre dans le bruit chat.

---

## Contexte

Les Vagues 1–4 (filets LoopDetector, compaction JSONL, spill, situation card, etc.) sont documentées dans [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md) et [PLAN-CONTEXT-SITUATION.md](PLAN-CONTEXT-SITUATION.md).

Ensuite, le dogfood « doc pédagogie → site-kdds » a révélé d’autres angles : dose de prompts, Plan→Assign→Merge soft, lecture hors workspace, Sync Explore orphelin, puis **spirale de relecture** post-merge.

---

## Lots livrés (ordre chrono approximatif)

| Lot | Contenu | Preuve / sites |
|-----|---------|----------------|
| **Prompts catalog** | Crate `drox-prompts` : fiches `PromptEntry`, lint claims, docs `injection-map` / `journal` / `adding` | `drox-engine/.../drox-prompts/` |
| **Session intent multi-bool** | Ask boot `isWork` / analysis / doc ; `session_intent_preclassified` pour Explore | `session_intent.rs`, `model_questions.rs` |
| **FX-B intent-only write** | `[phase: acting]` sans tools → nudge mécanique (pas d’ask NL) | `drive.rs` + `gates.intent_only_write` |
| **Soft work sans plan** | Après N outils réussis sans `todo_write` (work/doc) → Prefer one-shot | `runtime.work_without_plan` |
| **Soft step kickoff Explore** | Nouveau todo `in_progress` → nudge Explore pour l’étape | `runtime.step_explore_kickoff` |
| **Soft step without Explore** | Étape `in_progress` + ≥2 outils parent sans `task` → Prefer one-shot / step | `runtime.step_without_explore` |
| **Hors-WS split read/write** | Config + Server settings + toggles session (œil read / cadenas write) ; inventaire RO (`file_read`/`glob`/`grep`) **toujours** hors-WS ; mutations = write toggle ; Explore reste RO | `drox.allowOutsideWorkspace.*` ; `ToolContext` |
| **Explore UTF-8 live preview** | Panic troncature mid-char → orphan Sync `task` ; fix `floor_char_boundary` + `catch_unwind` sur `task` | `explore_ui_progress.rs`, `task.rs` |
| **Post-merge closure** | Après `task` non tronqué → Prefer soft « merge / acting, ne pas re-vérifier » | `runtime.post_merge_closure` |
| **Anti-relecture rotative** | Fenêtre 10 `file_read` · ≥6 reads · ≥2 paths ×≥2 → Prefer soft ; reset sur mutation / todo / Explore | `runtime.rotating_file_read` |
| **Explore return contracts** | `return_kinds` / `return_options` · artefacts + `manifest` · `kinds_incomplete` · index `ses_` · `explore_index_list` / `explore_artifact_read` | E1–E4 · [PLAN](PLAN-EXPLORE-RETURN-CONTRACTS.md) |
| **Tags UI Explore** | Chips carte : type sub-agent · thoroughness · kinds (incomplets pointillés) | `exploreCard.js` · `droxExploreToolWire.ts` |
| **return_options coerce + cadre retry** | String JSON → objet ; prompt object-only ; **même** carte Explore IDE/Agents après erreur (même titre) | `task.rs` · `exploreCard.js` · `droxAgentsChatSink.ts` |
| **Mid-run answering (A)** | Statut / ack user (« Salut », « Je vais d’abord… ») → `[phase: answering]` visible, pas thinking-only | `session.core` · `session.native_thinking` |
| **Thinking court / action** | Prefer soft : less narration, tool dès que le next step est clair (blob A tout le run) | CORE Style · `session.native_thinking` |
| **Explore E1+E2 clôture** | Enfant : stop sur `[phase: answering]`/`done` (sans DONE_ONLY) ; consignes + kickoff alignés | `explore.rs` · `drive.rs` · `explore_executor` |
| **Explore P-safe + P-json** | Synth JSON kinds → artefacts ; extract markdown last-match + stub lint ; phase1 sans `## kind` | `explore_artifact.rs` · `return_kinds.rs` · `explore_executor` · prompts |
| **Explore P-harden** | JSON fail → incomplete (pas soft-OK) ; lint méta/CoT ; notes synth filtrées ; `drox.subagents.executionThink` / `reportThink` | `explore_executor` · `report.rs` · settings IDE |
| **Explore C5b** | Synth = notes télégraphiques + contrat JSON **seulement** (zéro desc parent / activity) ; `task` description ~900 car. | `report.rs` · `explore_executor` · `task.rs` |
| **Explore cascade fill** | 1 kind = 1 tour LLM (`cascade_fill`) + assemble ; stub = vide/placeholder structurel seulement ; `kinds_incomplete` sans abort | `cascade_fill.rs` · `explore/cascade/` |
| **Concentration C1** | Spill lecture 8 KiB / preview 512 B ; hot snip keep 4 + spill-before-stub | `tool_result_spill.rs` · `context_policy` · [PLAN](PLAN-CONCENTRATION-CONTEXTE.md) §9 |
| **Concentration C2** | Slim `task` (pas de report LLM) ; Prefer V2-c relecture paths Explore ; marqueurs `c1.*`/`c2.*` | `explore_covered.rs` · `runtime.explore_covered_reread` · [PLAN](PLAN-CONCENTRATION-CONTEXTE.md) §10 |
| **Concentration C3** | Blob A : skills/archives/map → index 1 ligne ; supplements flag + markers | `catalog.rs` · `memory_sessions` · `workspace_map` · CORE · [PLAN](PLAN-CONCENTRATION-CONTEXTE.md) §11 |
| **Concentration C4** | Situation card 3 lignes ; micros kickoff / post-merge / act-write | `situation/card.rs` · `runtime.micro_act_write` · [PLAN](PLAN-CONCENTRATION-CONTEXTE.md) §12 |
| **Concentration C5** | Synth Explore : description allégée si notes/activity riches (`prepare_synth_task_brief`) | `subagent/report.rs` · `explore_executor` · [PLAN](PLAN-CONCENTRATION-CONTEXTE.md) §13 |
| **Explore Option A** (2026-10-09) | Tool `explore_commit` + journal L0 `paths_read` ; assemble 0-LLM depuis handle ; plus de fill prose nominal | `commit/handle.rs` · `explore_commit` tool · `assemble.rs` · cascade `execution/commit` |
| **Gate mono-kind** | Reject body CoT / `## <autre_kind>` / openers « Let me… » | `validate_mono_kind_body` · prompts commit |
| **Plus de conclusion.md** | Bundle = `<kind>.md` + `manifest` seulement ; `report_path` null | `explore_artifact.rs` · wire UI summary/artefact |
| **`artifacts_inline`** | Inject merge borné (caps ~1.8k/kind, ~7.5k total) dans slim `task` + `merge_hint` | `build_artifacts_inline` · `slim_task` · `task.rs` |
| **Inventaire instructions** (2026-10-10) | Mesure catalogue 85 fiches ; CORE ~6.4k tok ; boot S2 ~11k tok ; redites Plan→Assign→Merge | `examples/inventory.rs` · `inventory-instructions.md` |
| **Cadre contrats d’étape** | Recovery D1–D3 prioritaire vs Prefer empilés ; doc approche | [APPROCHE-CONTRATS-ETAPE.md](APPROCHE-CONTRATS-ETAPE.md) |

Catalogue prompts vivant : `drox-prompts/docs/journal.md` + `injection-map.md` + **`inventory-instructions.md`**.

**Binaire dogfood** : `drox-engine/drox/target/debug/drox.exe` (rebuild local après Option A / inline) · package debug optionnel via `npm run package-drox`.

---

## Dogfood (même brief répété)

Workspace dogfood : `site-kdds` · source : `Drox---IDE/docs/pedagogie`.

| Run | Observation clé |
|-----|------------------|
| V1 (pré nudges) | 0 todo / 0 task · spam parent tools |
| Mid | Soft plan+Explore mieux pensés ; Sync Explore **orphan** (`Run ended without tool result`) = panic UTF-8 live notes |
| Post-fix orphan + hors-WS partiel | Explore×2 OK · `file_read` hors-WS OK · encore `path escapes` sur glob/grep si read toggle off · **parent en boucle `file_read` rotative** (~3 fichiers UI) · 0 mutation · phase finale `reading` · ~23 M tokens in |
| **2026-10-09 Option A** (`ses_c3155f00…` / `ses_2ad37f6e…`) | Kinds remplis mais parfois **copié-collé** → gate mono-kind ; puis kinds distincts OK ; parent loop `file_read` same-path (loop detector) |
| **2026-10-09 post-inline** (`ses_bd54123b…`) | Plan OK · Explore site OK + `artifacts_inline` · inventaire pédagogie **incomplete** (`artifacts_inline: {}`, 49 iters) · C2 off · parent dump MD + spills · **~3,5 M tokens in** · ask_user tardif · 0 pages pédagogie livrées |

**Ce que ça ne contredit pas** : Vagues 1–4 + Explore Sync + Option A mécanique.  
**Ce que ça ouvre** : recovery Explore fail + C2 si truncated + spill sans « re-read » (D1–D3) — [APPROCHE](APPROCHE-CONTRATS-ETAPE.md).

---

## Livré 2026-10-10 — D3 + D1

| Lot | Changement |
|-----|------------|
| **D3** | `explore_covered` : `merge_from_task_outcome` si `truncated` ; plus de `clear` ; source `artifacts_inline.paths_read` |
| **D1** | Stubs spill / hot-snip : « Do NOT file_read this spill path » (plus d’invite re-read) |

## Livré 2026-10-10 — Désempilage prompts P1+P2+P3

| Lot | Changement |
|-----|------------|
| **P1** | `tools.task.description` : plus de playbook Plan→Assign→Merge (~610 → ~440 tok) |
| **P2** | `session.core` : pointeurs Explore seulement (~6.4k → ~6.2k tok) |
| **P3** | frames B / rescues : delta-only ; runtime+gates ~2.5k → **~2.05k tok** |
| **Mesure** | [inventory](../../../drox-engine/drox/crates/drox-prompts/docs/inventory-instructions.md) |

## Livré 2026-10-10 — D2 Explore fail recovery

| Lot | Changement |
|-----|------------|
| **Abort early** | phase1 : si 0 commit + 0 evidence après `max(8, budget/2)` → stop (`d2.explore_empty_abort`) |
| **`partial`** | manifest / wire `status: "partial"` quand tous les kinds incomplets |
| **Step-complete** | `explore_deliverable_empty` → ne pas marquer `step_had_task_success` |

## Livré 2026-10-10 — D4 post-ask_user acting

| Lot | Changement |
|-----|------------|
| **Soft transition** | Succès `ask_user_question` → `runtime.post_ask_acting` (skeleton / mutate) one-shot |
| **Marker** | `d4.post_ask_acting` |

## Cibles suivantes

1. Dogfood revalider (site-kdds / inventaire).  
2. D5 bash IDE (séparé) · D6 orphan finish.

Règle produit : **contrats / recovery moteur d’abord** ; Prefer soft seulement en complément ; hard gate si brief explicite ([pas-d-initiative](../../../.cursor/rules/pas-d-initiative.mdc)).

---

## Liens

- [README 1.6.0](README.md)  
- [APPROCHE-CONTRATS-ETAPE.md](APPROCHE-CONTRATS-ETAPE.md) — cadre D1–D6  
- [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md) — comment le détecteur se déclenche aujourd’hui  
- [PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md) — contrats retour + Option A  
- [PLAN-CONCENTRATION-CONTEXTE.md](PLAN-CONCENTRATION-CONTEXTE.md) — concentration modèle / volume contexte  
- [PLAN-DOGFOOD-TERMINAL-EXPLORE.md](PLAN-DOGFOOD-TERMINAL-EXPLORE.md)  
- `drox-prompts/docs/journal.md` · `inventory-instructions.md`
