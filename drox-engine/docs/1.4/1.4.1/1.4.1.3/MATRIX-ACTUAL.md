# Matrice d'injection actuelle (avant Context Frame)

**Version** : juin 2026 — **Phase 1** chantier 1.4.1.3  
**Référence** : parité avec le code `iteration_start.rs` + `boot.rs` + chemins événementiels

> Cette matrice décrit le comportement **réel** du moteur Rust. L'IDE TypeScript n'injecte pas de blocs system moteur (G-CTX-01 : troncature user prompt uniquement).

---

## Légende

| Colonne | Signification |
|---------|---------------|
| **Mode** | `boot` = premier system ; `replace` = dédup fingerprint puis remplace le bloc marqué ; `append` = `Message::system` en fin ; `insert_ckpt` = après checkpoint compaction |
| **Marqueur** | Sous-chaîne qui identifie le bloc dans l'historique |
| **Source** | Fichier / fonction qui produit le texte |

---

## 1. Boot architect edit (`architect.boot`)

| Ordre | Bloc | Mode | Marqueur | Source |
|-------|------|------|----------|--------|
| 1 | G3 core rail solo | boot | — | `prompts/system/gates/edit.rs` → `01_core_rail_solo.md` |
| 2 | Native thinking supplement | boot (si `think=true`) | — | `agent/nudges/thinking.rs` |
| 3 | Historique replay | boot | — | `drive/boot.rs` |
| 4 | User message | boot | — | `drive/boot.rs` |

**Note** : les protocoles outil **ne sont plus** injectés au boot (context diet 1.4.1.2a) — ils arrivent à `iteration_start`.

---

## 2. Chaque tour LLM — architect (`architect.*.iteration_start`)

Ordre **strict** (code `iteration_start.rs` → Phase 2 `context_frame/apply/iteration.rs`) :

| # | Layer ID | Mode | Marqueur | Source dynamique |
|---|----------|------|----------|------------------|
| 1 | `ctx_run_snapshot` | replace | `## Architect run snapshot (engine)` | `architect_run_context_block_per_turn` |
| 2 | `tool_protocols` | replace | `## Architect tool protocols (engine)` | `tool_supplements_for_station` ou `tool_supplements_all_architect` |
| 3a | `rail_turn_hooks` | — | — | `rail::on_turn_start` (état, pas message) |
| 3b | `rail_snapshot` | replace | `## Run rail (engine)` | `rail::refresh_snapshot` — **si rail actif** |

**Condition rail** : `run_rail_enabled && role == Architect`.

### Protocoles outil par station (layer 2)

| Station | Outils protocole (`T-*`) |
|---------|--------------------------|
| INTENT, READ | `workspace_map_read`, `file_read`, `grep`, `lsp` |
| PROPOSE, PLAN | `todo_write`, `architect_help`, `ask_user_question`, `workspace_map_read`, `file_read`, `grep` |
| ACT | `file_edit`, `file_write`, `todo_write`, `file_read` |
| VERIFY | `lsp`, `grep`, `file_read` |
| ANSWER | `todo_write` |

**Specs LLM** (wire, distinct des protocoles) : `filter_tool_specs_for_station` — voir `rail/policy.rs`.

---

## 3. Post-compaction / todo_write (`architect.*.post_checkpoint`)

| Déclencheur | Layer | Mode | Source |
|-------------|-------|------|--------|
| Live compaction | `ctx_run_snapshot` (profil compaction) | insert_ckpt | `inject_architect_run_snapshot_after_checkpoint` + `architect_run_context_block_compaction` |
| `todo_write` succès | idem | insert_ckpt | `tools.rs` |

---

## 4. Nudges & gates événementiels (`architect.*.gate_nudge`)

**Centralisés Phase 2.3** — `append_gate_nudge(messages, NudgeId, text)` dans `context_frame/apply/gate_nudge.rs` :

| NudgeId | Déclencheur | Fichier |
|---------|-------------|---------|
| `done.missing_mutation` | `[phase: done]` sans mutation | `outcome.rs` |
| `done.missing_answering` | done prématuré | `outcome.rs` |
| `done.unfinished_todos` | todos ouverts | `outcome.rs` |
| `done.verify_not_passed` | VERIFY non passé | `outcome.rs` |
| `done.only_marker` | answering sans done | `outcome.rs` |
| `rail.post_todos_answering` | idle post-todos | `outcome.rs` |
| `rail.act_stall` | stall ACT | `outcome.rs` |
| `schema_error.continue` | tour sans tool ni done | `outcome.rs` |
| `protocol.text_tool_marker` | texte `[tool_use]…` sans `tool_calls` | `outcome.rs` · `nudges/text_tool_marker.rs` |
| `internal_plan.stale` | N outils sans MAJ plan L2 | `tools.rs` |
| `internal_plan.pre_answering` | 1ère phase answering | `outcome.rs` |
| `internal_plan.act_focus` | ACT sans étape in_progress | `llm_turn.rs` |
| `rail.act_mutation_success` | mutation ACT OK | `tools.rs` |
| `rail.act_tool_failure_*` | échec ACT | `tools.rs` |
| `ask_user_question.loop` | anti-boucle JSON | `post_assistant.rs` |

Logs : `drox.context` · `context_frame_gate_nudge` + `nudge_id`.

---

## 5. Métriques observabilité

| Métrique | Cible log | Champs |
|----------|-----------|--------|
| `context_turn_metrics` | `drox.context` | `architect_snapshot_bytes`, `tool_protocol_bytes`, `rail_snapshot_bytes`, `messages_count`, `frame_id`, `layers_applied` |
| `context_frame_gate_nudge` | `drox.context` | `frame_id`, `nudge_id`, `bytes` |

---

## 6. Ordre effectif messages system (tour N typique, rail actif)

```text
[G3 core boot]                    ← tour 0 seulement
[thinking supplement?]
[checkpoint compaction?]          ← si compaction passée
[ctx_run_snapshot]                ← replace chaque tour
[tool_protocols]                  ← replace chaque tour
[rail_snapshot]                   ← replace chaque tour
… transcript user/assistant/tool …
[nudge append?]                   ← événementiel, fin historique
```

**Invariant parité Phase 2** : pour un même `(station, architect_state, todos)`, les trois blocs replace (1–3b) doivent être **bit-identiques** avant/après refactor.

---

## 7. Bytes typiques (smoke `ses_4b2c1d08`, post-1.4.1.2)

| Métrique | Avant patch | Après patch |
|----------|-------------|-------------|
| Tokens in run | ~86k | ~25.6k |
| Protocoles re-injectés identiques | non (boot+turn) | oui (skip unchanged) |

Dump manuel gate G-spec : exporter 3 scénarios (READ, ACT, nudge gate) via logs `drox.context` + transcript debug.

---

## 8. Frontière moteur / IDE

| Responsabilité | Couche |
|----------------|--------|
| Frames, snapshots, nudges, rail | **Rust** `drox-engine` |
| Exécution outils wire, UI chat, replay | **TS** `src/vs/.../drox/` |
| Troncature prompt user (G-CTX-01) | **TS** `droxUserPromptEngine.ts` |
| Aucun bloc `## … (engine)` injecté côté IDE | — |
