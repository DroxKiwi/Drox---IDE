# Journal — prompts centralisés · Plan/Explore soft · hors-WS · dogfood (1.6.0)

**Période** : 2026-10-07 → 2026-10-14 (post Vague 4)  
**Statut** : code en branche `1.6.0` · **D1–D4 · E1+E2 · F1+F2** · **survie A** · **git globals bash** livrés · dogfood manuel à revalider · **pas** encore ship  
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
| **Concentration C1** | Spill lecture 8 KiB / preview 512 B ; hot snip keep 4 + spill-before-stub · **F1/F2** (64 KiB Explore + merge préservé) | `agent/tool_result_spill/` · `context_policy` · [PLAN](PLAN-CONCENTRATION-CONTEXTE.md) §9 |
| **Concentration C2** | Slim `task` ; Prefer V2-c · **E1** kinds covered · **E2** stall-act | `explore_covered.rs` · `runtime.explore_covered_reread` / `post_explore_stall_act` · [PLAN](PLAN-CONCENTRATION-CONTEXTE.md) §10 |
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
| **2026-10-12 post-D4** (`ses_d4220fc4…`) | Brief docs site ← `docs/engine` · **2 Explore OK** (kinds riches) · **~9,2 M in** · **~271 `file_read`** (page/layout/sidebar) · **0 write** · merge / artefact **spillés** → diagnostic F1/F2 + soft E1/E2 |

**Ce que ça ne contredit pas** : Vagues 1–4 + Explore Sync + Option A mécanique · D1–D4.  
**Ce que ça a ouvert** : livraison Explore survivante (**F1/F2**) + anti-spirale soft (**E1/E2**) — [APPROCHE](APPROCHE-CONTRATS-ETAPE.md) §3bis.

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

## Livré 2026-10-12 — E1 + E2 (anti spirale post-Explore)

| Lot | Changement |
|-----|------------|
| **E1** | `explore_covered` tracke aussi les chemins `artifacts.*` (fichiers kind) — Prefer si parent `file_read` |
| **E2** | Après Explore OK : ≥2 lectures parent lourdes sans mutation → `runtime.post_explore_stall_act` (Prefer act) |
| **Markers** | `c2.explore_covered_*` · `e2.post_explore_stall_act` |

## Livré 2026-10-12 — F1 + F2 (livraison Explore ne disparaît pas)

| Lot | Changement |
|-----|------------|
| **F1** | `task` / `explore_artifact_read` : seuil spill **64 KiB** (plus 8 KiB read-heavy) — n+1 `tool_result_spill/` |
| **F2** | Hot snip : compact `EXPLORE MERGE PRESERVED` (summary + chemins kind + extrait) au lieu de spill 512 B |
| **Markers** | `f2.hot_snip_explore_preserve` · `c1.spill` + `explore_delivery` |

## Livré 2026-10-12 — A + E2b (post `ses_0ce29dd7…`)

| Lot | Changement |
|-----|------------|
| **A** | Erreur `explore_artifact_read` : recovery dans `ToolError` + Prefer `runtime.explore_artifact_read_fail` (ne pas `file_read` kind) |
| **E2b** | Hit kind (artifacts / `.drox/subagents/`) → Prefer act **immédiat** ; seuil E2 heavy-read = **1** |
| **Covered** | `CoveredHit::{Source,Kind}` dans `explore_covered` |
| **Markers** | `a.explore_artifact_read_fail` · `c2.explore_covered_hit` + `is_kind` |

## Livré 2026-10-12 — R4 + R1 (anti rotation `file_read`, post `ses_45a84a19`)

| Lot | Changement |
|-----|------------|
| **R4** | Même path `file_read` ≥3× → stub `[already_read]` (pas de re-IO) · marker `r4.repeated_file_read_stub` |
| **R1** | Prefer `runtime.rotating_file_read` **ré-injecté** tous les 4 reads tant que la fenêtre tourne |

## Livré 2026-10-13/14 — survie run IDE (lot A) + classifieur git

| Lot | Changement |
|-----|------------|
| **Survie A (IDE)** | No-kill pendant `agent.run` : dispose/`respawn-settings`/`respawn-binary` **différés** ; `start()` **réutilise** le host si même exe+cwd+env ; logs `reason=` + `dispose deferred` / `reused engine` — [DIAG-RUN-STOP.md](DIAG-RUN-STOP.md) |
| **Clic chemin file-change** | `OpenSessionFile` sans `ISessionsService` (IDE) ; capture document `.fc-path` |
| **Bash git global flags** | `git --no-pager diff` / `git -c …` / `git -C …` → subcommand réel ; plus de faux « mutating bash » avant `todo_write` (dogfood `ses_e424f7a6` : loop abort) — `drox-bash` `classify_git` |

**Diag dogfood `ses_e424f7a6`** : stop = loop bash (pager + faux gate), **pas** lot A. `disposed … reason=shutdown` après export = fermeture fenêtre. Diag script peut encore sur-classer `kill_mid_turn` si un dispose post-hoc est dans le terminal.

## Livré 2026-10-14 — mid-run ack hors fold thinking (Agents)

| Lot | Changement |
|-----|------------|
| **Routage null phase (AMB-09)** | `isDroxThinkingRoute(null)` → **visible** (aligné TUI) — ack content après `phase_close` thinking natif ne tombe plus dans le fold (`ses_e6695920`) |
| **Prompts** | `session.native_thinking` : thinking télégraphique 3e personne ; ordre préféré answering ack **avant** tools ; CORE règle 8 idem |

## Livré 2026-10-14 — Skip bash bloqué (Agents ExecBash)

| Lot | Changement |
|-----|------------|
| **ExecBash skip** | Track + kill process main (`skipActiveDroxBashExec`) → résultat `skipped` ; IPC `SkipExecBash` |
| **skipActiveBash unifié** | IDE terminal d’abord, sinon ExecBash — run continue |
| **UI Agents** | Bouton Skip (icône stop) sur carte terminal `bash` Running ; F1 `Drox: Skip Stuck Shell Command` |
| **Gate tool/exec** | Latch **sur l’instance** `DroxClientToolsService` (race `tool/exec` bash) — Skip résout le waiter même si le module-latch a loupé ; + `tools.skipBash` moteur (bash natif) |
| **Bash timeout 60s** | Défaut 60s si `timeout_ms` omis ; modèle peut fixer plus haut (pas de plafond produit) ; au timeout IDE : settle **+ Ctrl+C** ; prompt `tools.bash` |

## Livré 2026-10-16 — Skip bash IDE + recycle terminal

| Lot | Changement |
|-----|------------|
| **A — Skip UI** | Bouton Skip sur carte `bash` Running **même avec** `terminal_instance_id` (avant : caché si instance IDE) |
| **B — Recycle** | Timeout / Skip / forceInterrupt IDE → dispose + recreate `Drox Agent` (purge cmd `O/N`) |
| **C — Timer avant runCommand** | Deadline wall-clock armé **avant** `runCommand` (sinon SI wait sur prompt pourri = timeout jamais armé) |

## Livré 2026-10-16 — Bash live dans l’encadré chat

| Lot | Changement |
|-----|------------|
| **live-output** `droxBashLiveOutput.ts` | Bus renderer : IdeBashTerminal poll buffer → carte |
| **UI** `ChatTerminalToolProgressPart` | Mount sortie + auto-expand Running ; refresh snapshot |
| **mirror** | Snapshot xterm : append/RIS pour updates live |
| **sink** | `tool_progress` bash → `terminalCommandOutput` (chemin moteur) |

## Livré 2026-10-16 — Skip bash fiable + icône

| Lot | Changement |
|-----|------------|
| **Skip fallthrough** | `skipActiveBash` ne s’arrête plus sur un latch `settled` vide — recycle / find « Drox Agent » / ExecBash comptent comme succès |
| **SI filter** | `onCommandFinished` ignore les finishes sans marker / sans commande user (évite clôture fantôme) |
| **Icône** | Carte shell : `Codicon.circleSlash` (skip) à la place du carré `debugStop` |

## Livré 2026-10-16 — Bash IDE capture (lots réversibles)

Dogfood `ses_4eea1041` : stdout = bannière Windows / prompt seul (pas régression anti-loop). Découpe n+1 pour machine arrière fichier par fichier :

| Lot / fichier | Rôle | Revert |
|---------------|------|--------|
| **capture** `common/droxBashCapture.ts` | marker + delta + **strip chrome** (banner/prompt ≠ sortie) | retirer strip ou fichier |
| **ready** `droxIdeBashTerminal/shellReady.ts` | attendre prompt (+ SI) **avant** `bufferBefore` | no-op `return` |
| **session** `sharedSession.ts` | singleton + recycle | ne plus recycle depuis skip/timeout |
| **skip** `activeRun.ts` | latch Skip / forceInterrupt | — |
| **run** `run.ts` | timer + CommandDetection + `runCommand` | — |
| **result** `common/droxBashToolResult.ts` | policy `isError` (`exit_code` null ≠ erreur) | ancienne formule inline |

## Livré 2026-10-16 — Bash fiabilité tool-result (P0 + P1)

Dogfood export mid-run : `exit_code: 0` / `timed_out: false` / `terminal_instance_id` présents mais **`stdout: ""`** (ex. `git status`, `echo`) → modèle en spirale temp+`file_read`. Live card pouvait montrer du texte ; le tool-result non.

| Priorité | Fix | Fichiers | Revert |
|----------|-----|----------|--------|
| **P0** | `isolate` : slices marker SI puis buffer (plus longue non-vide), sinon delta ; strip ligne marker ; **plus** de court-circuit « marker présent ⇒ slice vide » | `common/droxBashCapture.ts` | rétablir court-circuit marker |
| **P0** | Post-`onCommandFinished` : 3×80 ms poll buffer avant settle (lag SI vs live) | `droxIdeBashTerminal/run.ts` | settler sync immédiat |
| **P1** | IDE vide (inspect, non-reveal, non-mutateur) → **un** retry `ExecBash` si stdout/stderr utiles | `droxBashTool.ts` · `droxBashShouldRetryExecBashAfterIde` dans `droxBashToolResult.ts` | retirer branche `else if` + helper |
| **Tests** | fallthrough SI vide → buffer ; policy retry / no-retry | `test/common/droxBashCapture.test.ts` | — |

Bornes P1 (pas de double mutation / double serveur) : pas `reveal`, pas redirects fichier (`>` hors `2>&1`), pas mutateurs courants (`git add` / `mkdir` / `npm install`…).

Smoke dogfood attendu : `echo hello` et `git status` → stdout non vide dans le tool-result (IDE ou ExecBash).

## Livré 2026-10-16 — Recovery `drox client closed`

| Lot | Changement |
|-----|------------|
| **Exit reset** | `onExit` / `onError` → `resetEngineState()` complet + log `engine exit code=` |
| **Stale retry** | RPC `client closed` / `not started` → restart + **un** retry (`isDroxEngineStaleClientError`) |

## Livré 2026-10-15 — Anti-loop clôture run (ForceConclude / SyntheticDone)

| Lot | Changement |
|-----|------------|
| **Escalade** | M1–M4 : Warn → **ForceConclude** (MustText + tools off) → **SyntheticDone** (Stop propre, plus d’`EngineError::LoopDetected` sur empreintes) |
| **Arbo** | `loop_detect/` n+1 · `loop_close/synthetic` · prompts `gates.loop_force_conclude` |
| **Produit** | Priorité : **finir le run** ; le chantier incomplet se négocie au tour suivant |
| **Doc** | [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md) §2 / §7 |

Lot 2 (backlog) : shell-poison → ForceConclude anticipé.

## Cibles suivantes

1. Dogfood revalider **P0+P1 bash** (`echo hello` / `git status` → stdout tool-result non vide) + Skip + recycle + ForceConclude.  
2. Si P0+P1 insuffisant : **P2** wrap Windows capture fichier temp + `type` (hors SI).  
3. Kind actionnable (`rewrite_plan`) seulement si merge intact mais acting encore flou.  
4. D5 bash IDE (pager/`GIT_PAGER=cat` par défaut ?) · D6 orphan finish · shell-poison detector.  
5. Arrêt soudain mid-run : triage [DIAG-RUN-STOP.md](DIAG-RUN-STOP.md) — ignorer `reason=shutdown` post-export.  
6. ~~**Mistral 422**~~ ✅ dialecte `random_seed` + omit `top_p<=0` — [BACKLOG-PROVIDERS.md](BACKLOG-PROVIDERS.md).  
7. Lot B (host moteur partagé / reprise après reload) — seulement si A insuffisant.

Règle produit : **contrats / recovery / livraison moteur d’abord** ; Prefer soft en complément ; hard gate si brief explicite ([pas-d-initiative](../../../.cursor/rules/pas-d-initiative.mdc)).

---

## Liens

- [PASSATION-1.6.0.md](PASSATION-1.6.0.md) — synthèse obstacles pour un autre modèle  
- [README 1.6.0](README.md)  
- [APPROCHE-CONTRATS-ETAPE.md](APPROCHE-CONTRATS-ETAPE.md) — cadre D1–D6  
- [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md) — comment le détecteur se déclenche aujourd’hui  
- [PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md) — contrats retour + Option A  
- [PLAN-CONCENTRATION-CONTEXTE.md](PLAN-CONCENTRATION-CONTEXTE.md) — concentration modèle / volume contexte  
- [PLAN-DOGFOOD-TERMINAL-EXPLORE.md](PLAN-DOGFOOD-TERMINAL-EXPLORE.md)  
- `drox-prompts/docs/journal.md` · `inventory-instructions.md`
