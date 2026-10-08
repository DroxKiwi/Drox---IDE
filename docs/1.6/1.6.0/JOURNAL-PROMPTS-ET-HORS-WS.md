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
| **Explore P-harden** | JSON fail → incomplete (pas soft-OK) ; lint méta/CoT ; notes synth filtrées ; `drox.subagents.executionThink` | `explore_executor` · `report.rs` · settings IDE |

Catalogue prompts vivant : `drox-prompts/docs/journal.md` + `injection-map.md`.

**Binaire dogfood** (2026-10-08) : `npm run package-drox -- --profile debug` → `resources/drox/win32-x64/drox.exe` (P-safe/P-json inclus).

---

## Dogfood (même brief répété)

Workspace dogfood : `site-kdds` · source : `Drox---IDE/docs/pedagogie`.

| Run | Observation clé |
|-----|------------------|
| V1 (pré nudges) | 0 todo / 0 task · spam parent tools |
| Mid | Soft plan+Explore mieux pensés ; Sync Explore **orphan** (`Run ended without tool result`) = panic UTF-8 live notes |
| Post-fix orphan + hors-WS partiel | Explore×2 OK · `file_read` hors-WS OK · encore `path escapes` sur glob/grep si read toggle off · **parent en boucle `file_read` rotative** (~3 fichiers UI) · 0 mutation · phase finale `reading` · ~23 M tokens in |

**Ce que ça ne contredit pas** : Vagues 1–4 + Explore Sync + anti-orphan UTF-8.  
**Ce que ça ouvre** : filets post-merge / anti-relecture volume (angle mort LoopDetector actuel).

---

## Cibles suivantes (priorisées dogfood 2026-10-07)

1. ~~**Anti-loop / anti-relecture**~~ — ✅ soft `runtime.rotating_file_read` (dogfood à revalider).  
2. ~~**Clôture après merge Explore**~~ — ✅ soft `runtime.post_merge_closure`.  
3. ~~**Hors-WS inventaire**~~ — ✅ glob/grep alignés `file_read` (RO toujours).  
4. **Découpage brief** (process dogfood) — optionnel côté utilisateur.  
5. ~~**Contrats de retour Explore**~~ — ✅ E1–E4 + **E4b tags UI** · notes RELEASE / popup à jour · **dogfood E5** encore dû · [PLAN](PLAN-EXPLORE-RETURN-CONTRACTS.md).

Règle produit : Prefer soft d’abord ; hard gate seulement si demandé explicitement ([pas-d-initiative](../../../.cursor/rules/pas-d-initiative.mdc)).

---

## Liens

- [README 1.6.0](README.md)  
- [ANTI-LOOP-METHODES.md](ANTI-LOOP-METHODES.md) — comment le détecteur se déclenche aujourd’hui  
- [PLAN-EXPLORE-RETURN-CONTRACTS.md](PLAN-EXPLORE-RETURN-CONTRACTS.md) — contrats retour + index (suite produit)  
- [PLAN-CONCENTRATION-CONTEXTE.md](PLAN-CONCENTRATION-CONTEXTE.md) — concentration modèle / volume contexte (solutions applicables)  
- [PLAN-DOGFOOD-TERMINAL-EXPLORE.md](PLAN-DOGFOOD-TERMINAL-EXPLORE.md)  
- `drox-prompts/docs/journal.md`
