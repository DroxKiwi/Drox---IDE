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

La règle dépend du **`EngineProfile`** ([`config.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs)).

### Profils locaux (`local-9b`, `local-27b`)

- **`engine_closure`** : un tour **sans** `tool_call` (hors cas `[phase: acting]` intent-write) = **fin de run** ; `[phase: done]` **non requis**.
- Tour vide → nudge one-shot **`LOCAL_EMPTY_TURN`**.
- **`local-27b`** : avant clôture, si todos ouverts ou mutation sans vérif → **`LOCAL_SOFT_CLOSE_CHECK`** (one-shot) puis un dernier tour LLM possible.
- Affichage : [`loop_close/engine_closure.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/loop_close/engine_closure.rs) complète phase `answering` / `done` si besoin.

### `cloud-full`

- Fin propre = **`[phase: done]`** après au moins un **`[phase: answering]`** dans le run.
- Sans `done`, le moteur **relance** (nudges) jusqu’à `max_iterations` ou escalade anti-boucle.
- Cas fréquent (GLM, etc.) : gros bloc **`answering`** sans `done` → nudge **`DONE_ONLY`** (« émets seulement `[phase: done]` ») si todos fermées et gate testing OK.

### Explore (sous-run, `explore_execution`)

- Phase 1 enfant : `answering` ou `done` **sans tool** → **Stop** tout de suite (pas de DONE_ONLY parent) ; le rapport Explore suit côté moteur.

## Gates moteur (`cloud-full` et parties communes)

| Gate | Effet |
|------|--------|
| `todo_write` avant mutation | **`cloud-full` only** — bloque mutateurs sans plan todo |
| Todos `pending` / `in_progress` | Refuse `[phase: done]` → `unfinished_todos_prompt` |
| Mutation code sans `testing` | Refuse `done` ou nudge testing si answering sans `done` |
| `done` sans `answering` | `MISSING_ANSWERING_PROMPT` (réécriture demandée) |
| Professor | Plan de cours / étapes (`professor.rs`) |
| **LoopDetector** | Warn → ForceConclude (tools off) → **SyntheticDone** — voir [agent-internals.md](agent-internals.md#loopdetector-escalade-2026-10) |

Les nudges todo/testing **ne reset pas** le LoopDetector (répétitions de `done` prématuré doivent recevoir le bon message, pas un abort au 2e tour).

## Outils dans la boucle

Par `tool_call` (lots parallèles si `is_concurrency_safe`) :

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
