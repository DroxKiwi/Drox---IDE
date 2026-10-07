# Carte d’injection — ce que le modèle reçoit

Document vivant (étape 0 du désempilage). Décrire **l’état actuel**, pas la cible idéale.
Mettre à jour quand l’ordre d’assemblage ou un scénario change ; tracer le « pourquoi » dans [`journal.md`](journal.md).

## Canaux (ne pas confondre)

| Canal | Où | Contenu typique |
|-------|-----|-----------------|
| **A. Blob system parent** | 1× `Message::system` au boot (`AgentConfig.system_prompt`) | CORE + annexes host + listing mémoire/skills/map + supplements session |
| **B. Messages system runtime** | `drive.rs` chaque tour / au besoin | Situation card, frames turn-0, nudges gates/rescues |
| **C. Tool schemas** | API tools du provider | `tools.*.description` (catalogue `tools.rs`) |
| **D. Ask one-shot** | Hors transcript agent | Boot session intent (`model_questions`) — RTT séparé, tools off |
| **E. Explore enfant** | Agent enfant séparé | `explore` system (+ thoroughness) ; phase report dédiée |

L’IDE peut enrichir `params.system` (rules, codebase, notes) **avant** le prepend CORE côté CLI — ce n’est pas du catalogue `drox-prompts`, mais ça entre dans le canal A.

## Pipeline parent (canal A) — ordre d’assemblage JSON-RPC

Site : `drox-cli` → `jsonrpc/handlers/mod.rs` (TUI / interactive : même idée, sous-ensemble).

Ordre approximatif dans **une** string system :

1. `session.core` — `CORE_SYSTEM_PROMPT` (`prepend_core_system_prompt`)
2. Host / memdir — `params.system` (IDE) + préfixe MEMORY si mémoire on
3. Listing sessions archivées (si mémoire on) — *hors catalogue prompts*
4. Catalogue skills — *hors catalogue*
5. `.droxignore` formaté — *hors catalogue*
6. Workspace map — *hors catalogue*
7. Supplément langue — *hors catalogue*
8. `session.native_thinking` — si `native_thinking`
9. `session.outside_ws.toggle` — si `allow_outside_workspace`
10. `session.subagents.explore` — si `subagents_enabled`
11. `session.professor` — si mode professeur
12. Notice outils désactivés — *hors catalogue*

Puis, dans `drive.rs` **après** ce blob (canal B, messages séparés) :

- `run_objective` (si présent) — builders `gates` / runtime
- historique + message user
- **classif boot** (canal D) si `!session_intent_preclassified` → flags `work_plan` / `analysis` / `doc_ingestion` (pas injecté tel quel dans le transcript)
- chaque itération : situation card (upsert) puis frames / nudges selon conditions

## Canal B — injections `drive.rs` (rappel)

| Moment | Condition (résumé) | Id catalogue / builder |
|--------|-------------------|-------------------------|
| Chaque tour (avant stream) | toujours | situation card (engine, hors fiche body fixe) |
| Turn-0 | `session_frames.work_plan` | `runtime.work_plan_frame` |
| Turn-0 | Explore + `doc_ingestion` | `runtime.doc_ingestion` |
| Après ≥2 outils réussis (toute activité) sans `todo_write` | work ou doc frame | `runtime.work_without_plan` (soft, one-shot ; ignore OK si légitime) |
| Après `todo` → `in_progress` | Explore on | `runtime.step_explore_kickoff` (body dynamique) |
| Streak lectures parent | Explore on + seuil | `runtime.s5_heavy_read` |
| Explore tronqué + lectures | … | `runtime.explore_rescue` / `explore_incomplete_nudge` |
| Post-glob context load | policy | `context_load_nudge` (dynamique) |
| Même path `file_read` ×N | seuil | `gates.repeated_file_read` |
| Done sans answering / todos / testing / … | gates | `gates.*` / `blocks.*` |
| `[phase: acting]` sans tools | mécanique FX-B | `gates.intent_only_write` (+ example strike 2) |
| Analysis frame + ≥2 outils explore sans `[phase: analyzing]` | turn-0 | `runtime.analyzing_phase` |
| Loops / ask failures | détecteurs | `gates.loop_*`, ask loop nudge |

## Scénarios (état actuel — dose perçue)

Légende : **A** = déjà dans le blob system ; **B** = message system runtime ; **D** = ask séparé.

### S1 — Chitchat (bonjour / merci)

- **D** : classif → souvent `isWork=false` → pas de work/doc/analyzing frames
- **A** : CORE (+ supplements si flags run) — Explore supplement **absent** si subagents off
- **B** : situation card ; pas de WORK PLAN FRAME
- Attendu modèle : answering → done, sans todo obligatoire (CORE §6d)

### S2 — Work + Explore on

- **D** : `isWork=true` (+ éventuellement analysis/doc)
- **A** : CORE (pointeur vers supplement) **+** `session.subagents.explore` (**protocole canonique** Plan→Assign→Merge)
- **B turn-0** : `runtime.work_plan_frame` = **delta** « c’est du work → todo early » (ne re-déroule pas le protocole)
- Si aussi doc : **+** `runtime.doc_ingestion` = **delta** docs (2–4 steps, pas de dump parent)
- **Dose cible** : protocole ×1 (supplement) + deltas courts

### S3 — Doc ingestion + Explore

- Comme S2 avec `isDocIngestion` → annex delta `runtime.doc_ingestion` turn-0

### S4 — Analysis (repo / architecture)

- **D** : `isAnalysis=true` ⇒ work aussi (normalisation)
- **A** : comme S2 si Explore on
- **B** : `runtime.work_plan_frame` si work ; `runtime.analyzing_phase` = delta phase (`analyzing` + thoroughness) si turn-0 + ≥2 outils d’exploration **sans** marqueur `analyzing`

### S5 — Acting sans tool_calls (FX-B)

- Trigger **mécanique** : `final_phase == Acting` et `tool_calls` vide (pas de needles prose)
- **B** : `gates.intent_only_write` (`when: phase_acting_without_tool_calls`) puis example strike 2 ; abort après `INTENT_ONLY_WRITE_MAX_NUDGES` (2)

### S6 — Explore enfant

- **E** : `explore.system` (+ thoroughness) ; `session_intent_preclassified=true` (pas d’ask boot sur le brief)
- Phase report : `explore.report_system`
- Parent reçoit summary / report_path — pas le transcript enfant

## Sites de code (pour tracer)

| Responsabilité | Fichier |
|----------------|---------|
| Assemblage blob A (RPC) | `drox-cli/.../jsonrpc/handlers/mod.rs` |
| Boucle + canal B | `drox-engine/.../agent/run/drive.rs` |
| Classif D | `drox-engine/.../agent/session_intent.rs` + `model_questions.rs` |
| Explore E | `drox-engine/.../subagent/explore_executor.rs` |
| Pont nudges | `drox-engine/.../agent/nudges.rs` (re-exports) |
| Fiches | `drox-prompts/src/*.rs` + `catalog.rs` |

## Dette restante

1. ~~Plan→Assign×N~~ — traité 2026-10-07  
2. ~~Intent-write `when`/bodies + orphelin large-write~~ — traité 2026-10-07  
3. ~~Vestige IDE `session.user_message_is_work`~~ — retiré 2026-10-07  
4. ~~`PromptStrength::Soft`~~ — retiré ; Prefer | MustText seulement (`docs/adding.md`)  
5. Rescues dynamiques (`explore_incomplete`, kickoff) — encore un peu verbeux ; OK pour l’action immédiate  
6. Dogfood V1–V6 — checklist [`verification.md`](verification.md)
