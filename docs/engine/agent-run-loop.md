# Boucle agent — `agent.run` → `drive_inner`

## Objectif

Décrire le chemin d’un message utilisateur jusqu’à la clôture du run sous pipeline **`tui_mono`**, y compris les différences de **profil moteur** (1.6.1).

Carte des modules : [agent-internals.md](agent-internals.md).  
Protocole textuel : [system-prompts-and-phases.md](system-prompts-and-phases.md).

## Sémantique : qu’est-ce qu’un « tour » ?

Un **run** oppose trois acteurs :

1. **Le modèle** — texte (marqueurs `[phase:]`) + éventuels `tool_calls`.
2. **Le moteur** — gates, permissions, exécution locale ou `tool/exec`, nudges, décision de continuer ou **`Stop`**.
3. **Le client** — affiche les `AgentEvent`, répond à `tool/exec` / `user/ask`.

`Agent::run` expose un **`AgentStream`** (Tokio) : l’UI peint au fil de l’eau.

Plafond : **`max_iterations`** (défaut struct **12** ; l’IDE envoie souvent **200** via RPC).

## Enchaînement

```text
Client : agent.run(params)
    → handlers::agent_run          (jsonrpc/handlers/mod.rs)
         · build_agent_setup      (LLM, registry, RemoteTool, MCP, session)
         · CORE + annexes         (drox-cli/prompts → drox-prompts, selon EngineProfile)
         · engine_profile         (local-9b | local-27b | cloud-full)
    → drive_run → Agent::run
    → drive_inner                  (agent/run/drive.rs)
         boucle :
           1. situation card upsert (profils concernés)
           2. maybe_snip / compact  (run/lifecycle + compaction/)
           3. llm.stream_chat + ToolSpec filtrés (profil + disabledTools)
           4. consume_stream        (agent/consume_llm_stream.rs)
           5. clôture ? (voir § Clôture)
           6. sinon tools           (lifecycle pre-gates → hooks → execute)
           7. sinon nudges          (done, testing, loop, intent-write, …)
    → agent/event (+ shim rail optionnel)
    → agent/done
```

## Phases

Marqueurs **seuls sur leur ligne** (parsés par [`phase/`](../../drox-engine/drox/crates/drox-engine/src/agent/phase/)) :

```text
[phase: answering]
Voici la réponse…
[phase: done]
```

- Legacy `[phase: reasoning]` / `[phase: next-move]` : **ignorés** (ligne retirée).
- Enum : [`Phase`](../../drox-engine/drox/crates/drox-engine/src/event.rs) — `reading`, `planning`, `acting`, `testing`, `verifying`, `answering`, `done`, `analyzing`, …
- Shim : [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) → `rail_station_*` pour l’UI historique.

## Clôture

`engine_closure` vaut pour tout run qui n’est **ni** professeur **ni** enfant Explore ([`drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs)). Les trois profils parent passent par là.

Un tour **sans** `tool_call` ferme le run, sauf `[phase: acting]` sans tour final forcé (intention d’écriture, FX-B). `[phase: done]` n’est pas exigé pour sortir.

- Tour **vide** (thinking seul compris) : un nudge **`LOCAL_EMPTY_TURN`**, puis au tour vide suivant le texte **« Run terminé »** (`ENGINE_CLOSURE_EMPTY_REPLY`).
- **`local-27b` et `cloud-full`** : si la réponse a du texte et que des todos sont encore ouverts, un **`LOCAL_SOFT_CLOSE_CHECK`** one-shot laisse un dernier tour. Une mutation de code sans `[phase: testing]` ne prolonge pas le run. **`local-9b`** n’a pas ce contrôle.
- Affichage : [`loop_close/engine_closure.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/loop_close/engine_closure.rs). Si `DONE_ONLY` a déjà été envoyé et que le tour suivant réécrit une conclusion sans outil ni `[phase: done]`, ce texte n’est pas renvoyé au chat et le run s’arrête.

Les gates `[phase: done]` (answering préalable, todos) sont plus bas dans `drive_inner`. Un run parent n’y arrive pas : le tour sans outil est déjà clos. Elles restent le chemin professeur, et le texte que le CORE `cloud-full` décrit encore au modèle. La phase `testing` n’est plus une gate.

### Explore (sous-run, `explore_execution`)

- Phase 1 enfant : `answering` ou `done` **sans tool** → **Stop** tout de suite (pas de DONE_ONLY parent) ; le rapport Explore suit côté moteur.

## Gates moteur (`cloud-full` et parties communes)

| Gate | Effet |
|------|--------|
| `todo_write` avant mutation | Conseil. Aucun profil parent ne bloque le mutateur |
| Todos `pending` / `in_progress` | Refuse `[phase: done]` → `unfinished_todos_prompt` |
| Mutation code sans `testing` | N’empêche plus la clôture |
| `done` sans `answering` | `MISSING_ANSWERING_PROMPT` (réécriture demandée) |
| Professor | Plan de cours / étapes (`professor.rs`) |
| **LoopDetector** | Warn → ForceConclude (tools off) → **SyntheticDone** — voir [agent-internals.md](agent-internals.md#loopdetector-escalade-2026-10) |

Les nudges todo/testing **ne reset pas** le LoopDetector (répétitions de `done` prématuré doivent recevoir le bon message, pas un abort au 2e tour).

## Outils dans la boucle

Par `tool_call`. `local-9b` et `local-27b` exécutent les appels du tour un par un, dans l'ordre. `cloud-full` les groupe en lots parallèles si `is_concurrency_safe` :

1. Pre-gates (`run_tool_pre_gates` — [`run/lifecycle.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/lifecycle.rs))
2. `PermissionPolicy` + moteur `drox-permissions`
3. Hooks `.drox/hooks.json`
4. Local (`drox-tools`) ou **remote** (`tool/exec`)
5. Format résultat (spill / profil — `dispatch` + `tool_result_spill`)
6. Message tool → tour suivant

Parallélisme : [`tools/orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tools/orchestration.rs) — défaut **8**. Détail : [tools-and-permissions.md](tools-and-permissions.md).

## Contexte

`maybe_snip` : estimation tokens (`drox-context`), snip froid, compaction live → `ContextSnip` / `ContextCompacted`.  
Situation card : résumé court réinjecté chaque tour ([`situation/`](../../drox-engine/drox/crates/drox-engine/src/agent/situation/)).

Voir [sessions-and-memory.md](sessions-and-memory.md).

## AgentEvent

Émis vers le client (`agent/event`). Variantes principales ([`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs), `#[non_exhaustive]`) :

| Variant | Rôle |
|---------|------|
| `PhaseEnter` / `PhaseClose` | Phases (+ thinking natif si activé) |
| `TextDelta` | Texte assistant streamé |
| `ToolStart` / `ToolFinish` / `ToolProgress` | Cycle outil |
| `ContextUsage` / `TurnUsage` | Tokens |
| `ContextSnip` / `ContextCompacted` | Budget contexte |
| `MemoryPersisted` | Archive mémoire session |
| `RunObjective` | Objectif verrouillé |
| `ScopeParkingUpdate` | Scope différé |
| `HookProgress` | Hook long |
| `Stop` | Fin de run |

## Fichiers

| Rôle | Chemin |
|------|--------|
| Boucle | [`agent/run/drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs) |
| API + spawn | [`agent/run/api.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/api.rs) |
| Lifecycle / snip / gates outil | [`agent/run/lifecycle.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/lifecycle.rs) |
| Stream LLM | [`agent/consume_llm_stream.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/consume_llm_stream.rs) |
| Config / profil | [`agent/config.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs) |
| Événements | [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs) |
| Compaction | [`compaction.rs`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs) |
| Permissions run | [`agent_permissions.rs`](../../drox-engine/drox/crates/drox-engine/src/agent_permissions.rs) |
| RPC entrée | [`handlers/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs) |
