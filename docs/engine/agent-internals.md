# Internes de `agent.rs`

Le fichier [`drox-engine/src/agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) concentre la boucle `tui_mono` (plusieurs milliers de lignes). Cette page dit **où lire** et **pourquoi** le fichier est structuré ainsi.

## Pourquoi un monolithe ici ?

Après le retrait du rail 1.4 (`agent/loop/`, stations), la sémantique « done-driven » (phases, gates todos/testing, nudges, anti-boucle, snip) est **fortement couplée** : éclater trop tôt en dizaines de fichiers obscurcissait le flux d’un tour. Les satellites (`compaction`, `tool_orchestration`, `subagent`, `professor`, …) absorbent ce qui a une frontière claire ; le reste reste dans `agent.rs` pour garder une lecture linéaire de `drive_inner`.

État partagé du run : clones légers + **`Arc`** sur LLM, registry, permissions — compatible avec l’exécution parallèle d’outils (`buffer_unordered` / Tokio).

## Types publics

| Type | Rôle |
|------|------|
| `AgentConfig` | Config d’un run (prompt système, itérations, permissions, contexte, mémoire, hooks, objectif, parallélisme) |
| `Agent` | Orchestrateur LLM + tools (ressources en `Arc`) |
| `AgentStream` | Stream d’`AgentEvent` |

Défauts notables de `AgentConfig` :

- `max_iterations` ≈ **12**
- `max_parallel_tool_calls` = `DEFAULT_MAX_PARALLEL_TOOL_CALLS` (**8**) — voir [`tool_orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tool_orchestration.rs)

## Carte par zones (approximative)

Les numéros de ligne **bougent** : cherche les symboles dans l’éditeur.

| Zone | Contenu typique |
|------|-----------------|
| En-tête module | Doc protocole phases, rôle de `consume_stream`, clôture « done-driven » |
| Helpers phase | `parse_phase_marker`, buffers de lignes `[phase:]` |
| Gates | `requires_todo_write_gate`, gates plan / testing / professor |
| Constantes nudge | `NUDGE_PROMPT`, `DONE_ONLY_NUDGE_PROMPT`, prompts todo / testing / anti-boucle |
| `AgentConfig` + `Default` | Champs de config |
| `Agent::run*` | Spawn async vers `drive_inner` |
| **`drive_inner`** | Boucle principale (LLM → gates done → tools → nudges → mémoire) |
| **`maybe_snip`** | Snip + compaction live selon `ContextPolicy` |
| **`run_tool_pre_gates`** / `check_permission` | Avant exécution outil |
| Types privés | `PendingToolCall`, `LoopDetector`, `TurnOutcome`, `PhaseLineBuffer` |
| **`consume_stream`** | Parse stream LLM → deltas, phases, tool calls |
| Tests | Fin de fichier |

## `drive_inner` — responsabilités

1. Préparer / mettre à jour le transcript et l’objectif de run.
2. Boucler jusqu’à stop, cancel, erreur, ou plafond d’itérations.
3. Avant le LLM : `maybe_snip` si budget serré.
4. Appeler `stream_chat` avec les `ToolSpec` du registry (filtrés : ex. `session_end` retiré du LLM).
5. `consume_stream` : émettre `TextDelta`, `PhaseEnter`, collecter `PendingToolCall`.
6. Évaluer clôture `[phase: done]` contre les gates (todos, testing, answering).
7. Sinon : `partition_tool_calls` → exécution parallèle/série → `ToolStart`/`ToolFinish`.
8. Si tour sans tools et sans done : injecter un **nudge** système et relancer.
9. Persister mémoire / archives selon milestones plan + fin de run.

## LoopDetector

Fingerprinting tour-à-tour (texte assistant + appels outils) :

- **2** tours strictement identiques → nudge anti-boucle
- **3** → `EngineError::LoopDetected` (abort)

Documenté aussi dans le prompt système ([`prompts.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts.rs)).

## Modules satellites (même crate)

| Module | Rôle |
|--------|------|
| [`compaction.rs`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs) | `summarize_run`, `try_live_compact` |
| [`context.rs`](../../drox-engine/drox/crates/drox-engine/src/context.rs) | Politique budget côté agent |
| [`memory.rs`](../../drox-engine/drox/crates/drox-engine/src/memory.rs) / [`long_memory.rs`](../../drox-engine/drox/crates/drox-engine/src/long_memory.rs) | Mémoire run / longue |
| [`subagent.rs`](../../drox-engine/drox/crates/drox-engine/src/subagent.rs) | Exécuteur Explore |
| [`professor.rs`](../../drox-engine/drox/crates/drox-engine/src/professor.rs) | Gates mode professeur (**code présent ; mode IDE non dispo**) |
| [`tool_hooks.rs`](../../drox-engine/drox/crates/drox-engine/src/tool_hooks.rs) | Pont vers `drox-hooks` |
| [`tool_progress.rs`](../../drox-engine/drox/crates/drox-engine/src/tool_progress.rs) | Progression outils longs (bash) |

## Comment déboguer un comportement « bizarre »

| Symptôme | Où regarder |
|----------|-------------|
| Run ne s’arrête jamais | Gates `done` + nudges dans `drive_inner` ; prompt « ONLY `[phase: done]` ends the loop » |
| Mutation refusée | Gate `todo_write` + mode `plan` / permissions |
| Boucle d’outils | `LoopDetector` + fingerprint |
| UI rail vs phases | [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) |
| Tool bloqué en attente | `tool/exec` non répondu côté client |

Suite logique : [system-prompts-and-phases.md](system-prompts-and-phases.md) puis [tools-and-permissions.md](tools-and-permissions.md).

