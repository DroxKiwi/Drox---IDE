# Boucle agent — `agent.run` → `drive_inner`

## Objectif

Décrire le chemin **exact** d’un message utilisateur jusqu’à la clôture du run sous pipeline **`tui_mono`**.

## Enchaînement

```text
Client : agent.run(params)
    → handlers::agent_run
         · construit client LLM (factory)
         · permissions + ToolRegistry
         · RemoteTool pour executableTools
         · charge / crée session
    → Agent::run  (ou continue_from_history)
    → drive_inner  (boucle)
         pour chaque itération (plafond max_iterations) :
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

## Phases

Le modèle est guidé pour émettre des marqueurs de phase dans le flux (ex. `[phase: answering]`, `[phase: done]`).

- **Clôture propre** : enchaînement answering → **done**, pas « absence d’appels outil ».
- Des **nudges** rappellent le protocole si le modèle répond trop tôt ou tourne en boucle.

Le shim IDE peut **synthétiser** d’anciens événements `rail_station_*` à partir de ces phases pour l’UI.

## Outils dans la boucle

Pour chaque `tool_call` :

1. Vérifier permissions (mode + règles outil).
2. Hooks pre-tool (si configurés).
3. Exécution **locale** (`drox-tools`) ou **remote** (`tool/exec` → client).
4. Hooks post-tool.
5. Résultat renvoyé au modèle au tour suivant.

Détail : [tools-and-permissions.md](tools-and-permissions.md).

## Contexte

Avant chaque appel LLM, le moteur peut :

- estimer les tokens ;
- snip / compacter l’historique ;
- réinjecter snapshot / mémoire utile.

Voir [sessions-and-memory.md](sessions-and-memory.md).

## Fichiers

- `drox-engine/drox/crates/drox-engine/src/agent.rs` — cœur `drive_inner`
- `…/event.rs` — `AgentEvent`
- `…/compaction.rs`
- `…/tool_orchestration.rs`
- `…/permissions.rs`
- `drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs` — entrée `agent.run`
