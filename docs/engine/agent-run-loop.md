# Boucle agent — `agent.run` → `drive_inner`

## Objectif

Décrire le chemin **exact** d’un message utilisateur jusqu’à la clôture du run sous pipeline **`tui_mono`**.

Pour une carte du fichier monolithe : [agent-internals.md](agent-internals.md).  
Pour le protocole textuel imposé au modèle : [system-prompts-and-phases.md](system-prompts-and-phases.md).

## Sémantique : qu’est-ce qu’un « tour » ?

Un **run** est une conversation contrôlée entre trois acteurs :

1. **Le modèle** — produit du texte (dont marqueurs `[phase:]`) et éventuellement des `tool_calls` structurés.
2. **Le moteur** — valide, autorise, exécute (ou délègue), injecte les résultats, décide de continuer ou de s’arrêter.
3. **Le client** — affiche les `AgentEvent`, répond à `tool/exec` / `user/ask`.

La clôture n’est **pas** « le modèle a arrêté d’appeler des outils ». Elle est **signée** par `[phase: done]` après un `[phase: answering]` valide, sous réserve des gates (todos, testing, professor, anti-boucle). Sans `done`, `drive_inner` **relance** jusqu’à `max_iterations`.

`Agent::run` expose un **stream** (`AgentStream`) : chaque événement est poussé dès qu’il est connu (Tokio / futures), ce qui permet à l’UI de peindre sans attendre la fin du run.

## Enchaînement

```text
Client : agent.run(params)
    → handlers::agent_run
         · construit client LLM (factory)
         · permissions + ToolRegistry
         · RemoteTool pour executableTools
         · MCP optionnel
         · charge / crée session
         · system prompt (prompts.rs)
    → Agent::run  (ou continue_from_history)
    → drive_inner  (boucle)
         pour chaque itération (plafond max_iterations, défaut 12) :
           1. maybe_snip / compact (contexte)
           2. llm.stream_chat(messages + ToolSpec)
           3. consume_stream → texte + tool_calls + marqueurs [phase:…]
           4. si phase done + gates OK → sortie
           5. sinon exécuter tools (permissions → hooks → local|remote)
           6. injecter tool_result → tour suivant
           7. si pas d’outils : nudges (réponse sans done, todos, LoopDetector, …)
    → stream AgentEvent → shim → agent/event
    → agent/done
```

Code :

- Entrée RPC : [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) (`agent_run`, `build_agent_setup`, `drive_run`)
- Boucle : [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) — `Agent::run` → `drive_inner`
- Stream : `consume_stream` dans le même fichier

## Phases

Le modèle est guidé pour émettre des marqueurs **seuls sur leur ligne** :

```text
[phase: answering]
Voici la réponse…
[phase: done]
```

- **Clôture propre** : enchaînement `answering` → **`done`**. Ce n’est **pas** « absence d’appels outil » qui arrête le run.
- Des **nudges** rappellent le protocole si le modèle répond trop tôt, oublie `done`, laisse des todos ouverts, ou saute `testing` après mutation code.
- Legacy `[phase: reasoning]` / `[phase: next-move]` : **ignorés** (ligne stripée).

Le shim IDE peut **synthétiser** d’anciens événements `rail_station_*` à partir de ces phases ([`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs)).

Enum Rust : `Phase` dans [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs)  
(`internal_reasoning`, `analyzing`, `reading`, `clarifying`, `planning`, `acting`, `testing`, `verifying`, `answering`, `done`, …).

## Gates moteur (résumé)

| Gate | Effet |
|------|--------|
| `todo_write` avant mutation | Bloque `file_edit` / `file_write` / bash mutateur tant qu’aucun todo n’existe dans le run |
| Todos ouverts | Refuse `[phase: done]` si items `pending` / `in_progress` |
| `testing` après mutation code | Exige phase testing + outil de vérif avant `done` (pas pour seuls `.md` / assets) |
| `answering` avant `done` | `done` sans answering → nudge rewrite |
| Professor | Mutations limitées aux zones / étapes de cours (`professor.rs`) |
| LoopDetector | 2 tours identiques → nudge ; 3 → abort `LoopDetected` |

Détail et constantes de nudge : [agent-internals.md](agent-internals.md).

## Outils dans la boucle

Pour chaque `tool_call` (éventuellement en lots parallèles) :

1. Pre-gates (`run_tool_pre_gates`)
2. Permissions (mode + règles)
3. Hooks pre-tool (`.drox/hooks.json`)
4. Exécution **locale** (`drox-tools`) ou **remote** (`tool/exec`)
5. Hooks post-tool
6. Résultat → message tool → tour LLM suivant

Parallélisme : [`tool_orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tool_orchestration.rs) — plafond défaut **8** appels parallèles pour tools `is_concurrency_safe`. Voir [tools-and-permissions.md](tools-and-permissions.md#parallélisme).

## Contexte

Avant chaque appel LLM coûteux, `maybe_snip` peut :

- estimer les tokens (`drox-context`) ;
- snipper l’historique froid ;
- compacter live et émettre `ContextCompacted` / `ContextSnip`.

Voir [sessions-and-memory.md](sessions-and-memory.md).

## <a id="agentevent"></a>AgentEvent

Émis vers le client (`agent/event`). Variantes (`event.rs`, `#[non_exhaustive]`) :

| Variant | Rôle |
|---------|------|
| `PhaseEnter` / `PhaseClose` | Entrée / sortie de phase |
| `TextDelta` | Texte assistant (stream) |
| `ToolStart` / `ToolFinish` / `ToolProgress` | Cycle outil |
| `ContextUsage` / `TurnUsage` | Compteurs tokens |
| `ContextSnip` / `ContextCompacted` | Budget contexte |
| `MemoryPersisted` | Archive mémoire |
| `RunObjective` | Objectif de run |
| `ScopeParkingUpdate` | Scope différé |
| `HookProgress` | Hook en cours |
| `Stop` | Fin de tour / raison + usage |

## Fichiers

| Rôle | Chemin |
|------|--------|
| Cœur | [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) |
| Événements | [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs) |
| Compaction | [`compaction.rs`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs) |
| Orchestration tools | [`tool_orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tool_orchestration.rs) |
| Permissions bridge | [`permissions.rs`](../../drox-engine/drox/crates/drox-engine/src/permissions.rs) |
| Entrée `agent.run` | [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) |
