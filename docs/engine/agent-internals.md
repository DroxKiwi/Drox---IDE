# Internes du module `agent/`

La boucle **`tui_mono`** vit sous [`drox-engine/src/agent/`](../../drox-engine/drox/crates/drox-engine/src/agent/).  
Le cœur est [`run/drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs) (`drive_inner`) ; le reste du module isole phases, gates, nudges, anti-boucle et contexte court.

Pour le chemin RPC → clôture : [agent-run-loop.md](agent-run-loop.md).  
Pour le texte imposé au modèle : [system-prompts-and-phases.md](system-prompts-and-phases.md).

## Types publics

| Type | Rôle |
|------|------|
| `AgentConfig` | Config d’un run (prompt, itérations, permissions, contexte, mémoire, hooks, objectif, **`engine_profile`**, …) |
| `EngineProfile` | `local-9b` · `local-27b` · `cloud-full` — knobs parent (CORE, outils, gates, clôture) |
| `Agent` | Orchestrateur LLM + tools (`Arc` sur ressources lourdes) |
| `AgentStream` | Stream d’`AgentEvent` |

Défauts **struct** `AgentConfig::default()` ([`config.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs)) :

| Champ | Défaut Rust | Note |
|-------|-------------|------|
| `max_iterations` | **12** | L’IDE envoie souvent une valeur plus haute via `agent.run` |
| `max_parallel_tool_calls` | **8** (`DEFAULT_MAX_PARALLEL_TOOL_CALLS`) | [`tools/orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tools/orchestration.rs) |
| `engine_profile` | **`cloud-full`** | RPC / settings : inconnu → **`local-9b`** (`normalize_engine_profile`) |

## Carte des sous-modules

Alignée sur [`agent/mod.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/mod.rs).

| Module | Rôle |
|--------|------|
| [`config`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs) | `AgentConfig`, `EngineProfile`, allowlist outils parent |
| [`run/api`](../../drox-engine/drox/crates/drox-engine/src/agent/run/api.rs) | `Agent::new`, `run`, spawn vers la boucle |
| [`run/drive`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs) | **`drive_inner`** — ordre des gates, nudges, tools, clôture |
| [`run/lifecycle`](../../drox-engine/drox/crates/drox-engine/src/agent/run/lifecycle.rs) | Transcript, `maybe_snip`, permissions, pre-gates outil, persistance mémoire |
| [`consume_llm_stream`](../../drox-engine/drox/crates/drox-engine/src/agent/consume_llm_stream.rs) | Stream LLM → `TextDelta`, `PhaseEnter`, tool calls |
| [`phase`](../../drox-engine/drox/crates/drox-engine/src/agent/phase/) | Parse `[phase:…]`, buffer ligne, inférence phase hors marqueur |
| [`gates`](../../drox-engine/drox/crates/drox-engine/src/agent/gates/) | Todo avant mutation, professor, `session_end`, recréation plan |
| [`nudges`](../../drox-engine/drox/crates/drox-engine/src/agent/nudges.rs) | Re-exports [`drox-prompts`](../../drox-engine/drox/crates/drox-prompts/) (runtime + gates + local) |
| [`hallucination`](../../drox-engine/drox/crates/drox-engine/src/agent/hallucination.rs) | Tool calls qui imitent un marqueur `[phase:…]` |
| [`loop_detect`](../../drox-engine/drox/crates/drox-engine/src/agent/loop_detect/) | Empreintes tour-à-tour → Warn / ForceConclude / **SyntheticDone** |
| [`loop_close`](../../drox-engine/drox/crates/drox-engine/src/agent/loop_close/) | Clôture moteur locale, message vide, `emit_synthetic_done` |
| [`situation`](../../drox-engine/drox/crates/drox-engine/src/agent/situation/) | **Situation card** — bloc system réécrit chaque tour (paths, todos, Explore) |
| [`tool_result_spill`](../../drox-engine/drox/crates/drox-engine/src/agent/tool_result_spill/) | Spill / stub gros résultats, hot-snip Explore |
| [`context_load`](../../drox-engine/drox/crates/drox-engine/src/agent/context_load.rs) | Politique nudge post-`glob` large (L2) |
| [`session_intent`](../../drox-engine/drox/crates/drox-engine/src/agent/session_intent.rs) | Boot intent multi-bool (work / doc / analysis frames) |
| [`dispatch`](../../drox-engine/drox/crates/drox-engine/src/agent/dispatch.rs) | Specs outils LLM, format résultats, confirmation user |
| [`tests/`](../../drox-engine/drox/crates/drox-engine/src/agent/tests/) | Gates, phases, boucles, profils |

## `EngineProfile` — ce qui change sans autre boucle

| Knob | `local-9b` | `local-27b` | `cloud-full` |
|------|------------|-------------|--------------|
| CORE system | Allégé (`CORE_LOCAL`) | Idem | CORE 1.6.0 complet |
| Clôture | Moteur (tour sans outil) | + soft close check (todo / testing) one-shot | **`[phase: done]`** + gates |
| Gate todo avant mutation | Non | Non | **Oui** |
| Nudges plan / post-merge Explore | Réduits | Actifs | Actifs |
| Outils parent | Allowlist courte | Allowlist élargie | Catalogue (hors `disabledTools` IDE) |

Méthodes : `is_local()`, `plan_nudges()`, `todo_before_mutation_gate()`, `exposes_parent_tool()` — [`config.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs).

## `drive_inner` — ordre logique d’un tour

Après `consume_stream` et push transcript :

1. **Explore child** (`explore_execution`) : `answering` ou `done` sans tool → **Stop** immédiat (rapport moteur ensuite).
2. **Clôture locale** (`engine_closure` = profil local, pas professeur) : tour sans tool → réponse finale ou nudges one-shot (`LOCAL_EMPTY_TURN`, `LOCAL_SOFT_CLOSE_CHECK` en 27b) → `emit_engine_closure` → **Stop**.
3. **`[phase: done]`** (surtout **cloud-full**) : gates answering, todos, testing, professor → **Stop** ou nudge et `continue`.
4. **FX-B** : `[phase: acting]` sans tool → nudges intent-only write (escalade locale → tour final forcé).
5. **`LoopDetector::observe`** — **après** les gates `done` (répétitions de `done` bloqué par todo ne doivent pas abort trop tôt).
6. Tour sans tool ni `done` : `DONE_ONLY` si answering OK et gates clear ; sinon `NUDGE_PROMPT` ou nudge testing.

Snip / compaction : [`run/lifecycle.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/lifecycle.rs) (`maybe_snip`) + crate [`compaction/`](../../drox-engine/drox/crates/drox-engine/src/compaction/).

## LoopDetector (escalade 2026-10)

[`loop_detect/detector.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/loop_detect/detector.rs) + [`decision.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/loop_detect/decision.rs).

| Strike (répétition détectée) | Décision |
|--------------------------------|----------|
| 1 | **Warn** — nudge (`LOOP_DETECTED_NUDGE` ou `LOOP_TOOL_FAMILY_NUDGE`) |
| 2 | **ForceConclude** — tools off, prompt clôture |
| ≥ 3 | **SyntheticDone** — `Stop` propre (`emit_synthetic_done`), pas d’erreur `LoopDetected` systématique |

Variantes : empreinte exacte (texte + tools), **text_only** (corps identique, thinking peut varier), **tool_family** (ex. bash).

**Reset** du détecteur : nudges structurels uniquement — pas sur `DONE_ONLY` / nudge générique (cf. commentaires L-1 dans `drive.rs`).

Texte des nudges : crate **`drox-prompts`** ; le CORE peut mentionner l’anti-boucle au modèle.

## Modules voisins (crate `drox-engine`)

| Module | Rôle |
|--------|------|
| [`compaction.rs`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs) | `summarize_run`, `try_live_compact` |
| [`context_policy.rs`](../../drox-engine/drox/crates/drox-engine/src/context_policy.rs) | Budget / snip agent |
| [`memory.rs`](../../drox-engine/drox/crates/drox-engine/src/memory.rs) | Runtime mémoire session |
| [`agent_permissions.rs`](../../drox-engine/drox/crates/drox-engine/src/agent_permissions.rs) | `PermissionPolicy` (run) |
| [`subagent.rs`](../../drox-engine/drox/crates/drox-engine/src/subagent.rs) | Exécuteur Explore / `task` |
| [`professor.rs`](../../drox-engine/drox/crates/drox-engine/src/professor.rs) | Gates cours (**code présent ; mode IDE non exposé**) |
| [`tools/`](../../drox-engine/drox/crates/drox-engine/src/tools/) | Hooks, orchestration parallèle, progression bash |

## Déboguer un comportement « bizarre »

| Symptôme | Où regarder |
|----------|-------------|
| Run ne s’arrête pas (**cloud-full**) | Gates `done`, `DONE_ONLY`, testing, todos — `drive.rs` après `outcome.final_phase == Done` |
| Double / rafale de conclusions | Profil (**local-27b** soft close · **cloud-full** GLM sans `done`) — [agent-run-loop.md](agent-run-loop.md#clôture) |
| Mutation refusée | [`gates/mutation.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/gates/mutation.rs), `todo_before_mutation_gate`, permissions |
| Boucle d’outils identiques | `loop_detect/` + nudges Explore / file_read |
| Gros tool result / contexte | `tool_result_spill/`, situation card |
| UI rail vs phases | [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) |
| Tool bloqué | `tool/exec` non répondu côté IDE |

Suite : [system-prompts-and-phases.md](system-prompts-and-phases.md) · [tools-and-permissions.md](tools-and-permissions.md).
