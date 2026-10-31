# Prompts système et protocole des phases

## Où vit le texte

| Couche | Rôle |
|--------|------|
| **[`drox-prompts`](../../drox-engine/drox/crates/drox-prompts/)** | **Source de rédaction** — CORE, gates, runtime nudges, Explore, descriptions outils, compaction, lint `claims` |
| **[`drox-cli/src/prompts/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts/mod.rs)** | Façade CLI / RPC : re-exports + `prepend_core_system_prompt_for_profile` |
| **[`agent/nudges.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/nudges.rs)** | Pont runtime : re-exports des nudges injectés dans `drive_inner` |

Doc crate prompts (injection, ajout, vérif) : [`drox-prompts/docs/injection-map.md`](../../drox-engine/drox/crates/drox-prompts/docs/injection-map.md).

Le moteur **parse** les marqueurs dans [`consume_llm_stream`](../../drox-engine/drox/crates/drox-engine/src/agent/consume_llm_stream.rs) et **applique** les gates dans [`run/drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs). Prompt et Rust doivent rester alignés.

## CORE selon profil moteur

| Profil | Prompt principal | Clôture décrite au modèle |
|--------|------------------|---------------------------|
| **`cloud-full`** | `CORE_SYSTEM_PROMPT` (protocole 1.6.0 complet) | Le texte demande encore `[phase: done]` après `answering`. Le moteur ferme quand même un tour sans outil |
| **`local-9b`**, **`local-27b`** | `CORE_LOCAL_SYSTEM_PROMPT` (allégé) | Tour **sans outil** = réponse finale ; `done` non requis |

Annexes session (hors-WS, Explore, native thinking, professeur) : modules [`session`](../../drox-engine/drox/crates/drox-prompts/src/session.rs), [`local`](../../drox-engine/drox/crates/drox-prompts/src/local.rs).  
Explore parent : `SUBAGENTS_EXPLORE_SUPPLEMENT` vs `SUBAGENTS_EXPLORE_LOCAL_SUPPLEMENT` ([`prompts/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts/mod.rs)).

Injection RPC : [`build_agent_setup`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs) remplit `AgentConfig.system_prompt` + frames intent (`work_plan_frame`, …).

## Pourquoi des phases en texte plat ?

Les tool calls décrivent des **actions**. Les phases décrivent l’**intention** du tour (lecture, édition, réponse) sans faux outil `set_phase`. Une ligne `[phase: …]` :

- se parse ligne à ligne dans `consume_stream` ;
- apparaît dans le JSONL ;
- alimente l’UI (shim `rail_station_*` optionnel).

Le **thinking natif** (stream Ollama / API) n’est **pas** une phase Drox : la prose utilisateur doit vivre dans **`answering`**.

## Marqueurs

Format — **seuls sur leur ligne**, minuscules :

```text
[phase: reading]
[phase: acting]
[phase: answering]
[phase: done]
```

Jamais un tool nommé `phase` / `set_phase` ([`hallucination.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/hallucination.rs)).

## Phases utiles (contrat modèle)

| Phase | Usage |
|-------|--------|
| `analyzing` | Vue d’ensemble / audit (glob, map — pas de mutations) |
| `reading` | Lecture ciblée |
| `planning` | Organisation avant mutations |
| `acting` | Édition / bash mutateur |
| `testing` | Vérif après mutation **code** (soft close check en `local-27b` / `cloud-full`) |
| `verifying` | Checks hors post-mutation build |
| `clarifying` | Questions |
| `answering` | **Prose utilisateur** Markdown |
| `done` | Marqueur de fin demandé par le CORE `cloud-full`. Le run parent s’arrête déjà sur un tour sans outil |

Legacy **ignorés** : `[phase: reasoning]`, `[phase: next-move]`.

## Règles — selon profil

### `cloud-full`

1. **Le moteur ferme le run** sur un tour sans outil (même filet que les profils locaux : tour vide, puis soft close check si todos ou testing). Le CORE décrit encore `[phase: done]` comme sortie ; les refus de `done` plus bas dans `drive.rs` ne s’appliquent pas à ce run parent.
2. **Le texte de gate** dit qu’un `done` exige un `answering` préalable (`MISSING_ANSWERING_PROMPT`). Ce nudge est sur le chemin professeur, pas sur la clôture parent.
3. Prose utilisateur **dans `answering`** uniquement.
4. **Avant mutation** : `todo_write` réussi (**gate dure**). Read-only / bash inspectif peuvent précéder.
5. Le CORE demande encore des todos clos et un `[phase: testing]` après une mutation de code avant le dernier `answering` + `done`. Côté moteur parent, c’est le soft close check one-shot, puis l’arrêt.
6. **Anti-boucle** : LoopDetector + texte CORE ; escalade moteur si répétition — [agent-internals.md](agent-internals.md).

### Profils locaux

- CORE local + clôture **moteur** : pas de protocole « ONLY `done` ends the loop » au même niveau de rigidité.
- Nudges runtime : `LOCAL_EMPTY_TURN` (tout run parent), `LOCAL_EXPLORE_KICKOFF` (`local-9b`), `LOCAL_SOFT_CLOSE_CHECK` (`local-27b` et `cloud-full`), `LOCAL_FINAL_ANSWER` (budget / intent-write).
- `todo_write` **recommandé** (soft) ; gate dure todo-avant-mutation **coupée**.

Détail clôture : [agent-run-loop.md](agent-run-loop.md#clôture).

## Nudges runtime (injection `Message::system`)

Corpus dans **`drox-prompts`** — catégories :

| Catégorie | Exemples |
|-----------|----------|
| **Gates** | `DONE_ONLY_NUDGE`, `MISSING_ANSWERING`, `unfinished_todos`, `CODE_MUTATION_TESTING`, intent-only write |
| **Runtime** | plan frame, post-merge Explore, context-load, step Explore, anti parent-rescue |
| **Loops** | `LOOP_DETECTED`, `LOOP_FORCE_CONCLUDE` (+ SyntheticDone côté code) |
| **Local** | empty turn, soft close check, final answer |

Liste exportée : [`agent/nudges.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/nudges.rs).

## `todo_write` n’est pas une phase

Anti-pattern : `[phase: todo_write]` + JSON inline.  
Correct : texte en `planning` puis **tool_call** `todo_write`.

## Mémoire et clôture

- Archives **`.drox/memory/sessions/`** après run non trivial ([`memory.rs`](../../drox-engine/drox/crates/drox-engine/src/memory.rs)).
- `session_end` : registry oui, **filtré** du LLM — clôture fil = commande utilisateur IDE.

## Mode professor / course

> **Non disponible** dans Drox IDE (downgrade 1.4 ; reprise éventuelle : [professor-2.0.md](../1.4/REPORT/professor-2.0.md)).

`PROFESSOR_MODE_SUPPLEMENT` + [`professor.rs`](../../drox-engine/drox/crates/drox-engine/src/professor.rs) restent dans le dépôt — **pas** un mode produit actif.

## Lien UI

`PhaseEnter` / `PhaseClose` depuis `consume_stream` → [ide-integration.md](ide-integration.md) · shim [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs).
