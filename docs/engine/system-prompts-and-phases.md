# Prompts système et protocole des phases

Source de vérité : [`drox-cli/src/prompts.rs`](../../drox-engine/drox/crates/drox-cli/src/prompts.rs) (`CORE_SYSTEM_PROMPT` + variants professor / course).

Le moteur **parse** les marqueurs et applique des gates dans [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs). Le prompt et le Rust doivent rester alignés : le texte explique la règle au modèle ; le code **applique** la règle (sinon le modèle peut ignorer le prompt).

## Pourquoi des phases en texte plat ?

Les tool calls structurés décrivent des **actions**. Les phases décrivent l’**intention narrative** du tour (lecture, édition, réponse finale) sans inventer un faux outil `set_phase`. Une ligne seule `[phase: …]` est :

- triviale à parser dans `consume_stream` (buffer ligne) ;
- visible dans le transcript JSONL ;
- mappable vers l’UI (et éventuellement synthétisée en `rail_station_*` par le shim).

Le **thinking natif** du modèle (stream séparé) n’est pas une phase Drox : il ne doit pas remplacer `answering` pour la prose utilisateur.

## Marqueurs

Format obligatoire — **seuls sur leur ligne**, minuscules, crochets :

```text
[phase: reading]
[phase: acting]
[phase: answering]
[phase: done]
```

Ce sont du **texte assistant**, jamais un tool nommé `phase` / `set_phase`.

## Phases utiles (contrat modèle)

| Phase | Usage |
|-------|--------|
| `analyzing` | Vue d’ensemble / audit structure repo (map, glob racine, pas de mutations) |
| `reading` | Lecture ciblée d’un fichier / module déjà identifié |
| `planning` | Organisation avant mutations |
| `acting` | Édition fichier / bash mutateur |
| `testing` | Vérif après mutation **code** (gate moteur) |
| `verifying` | Checks hors post-mutation build |
| `clarifying` | Questions / précision |
| `answering` | **Seul** endroit pour la prose utilisateur Markdown structurée |
| `done` | **Seul** signal d’arrêt de la boucle |

Legacy **ignorés** : `[phase: reasoning]`, `[phase: next-move]` (strip, aucun effet). Le raisonnement long passe par le stream **native thinking** du modèle, pas une phase Drox.

## Règles dures (résumé du prompt + gates)

1. **Seul `[phase: done]` termine le run.** Pas d’outil → le moteur **relance** jusqu’à `max_iterations` s’il n’y a pas de `done`.
2. **`done` exige un `answering` préalable** dans le run (sinon nudge rewrite).
3. **Prose utilisateur uniquement dans `answering`.** Écrire une analyse complète dans `reading` puis la recopier dans `answering` = anti-pattern (coût tokens ×2).
4. **Avant toute mutation** : au moins un `todo_write` réussi dans le run. Read-only + bash inspectif (`git status`, `ls`, `cargo check`, …) peuvent précéder sans todo.
5. **Avant `done`** : fermer les todos (`completed` / `cancelled`). Todos ouverts → refus de `done`.
6. **Après mutation de sources** : passer par `[phase: testing]` + outil de vérif (`bash` / `lsp` / `file_read`) avant le dernier answering+done. Fichiers `.md` / assets seuls → pas de gate.
7. **Micro-cycle d’édition** recommandé : intention courte → answering bref → `acting` + tool → answering post-edit → suite ; `done` seulement à la toute fin.
8. **Question à l’utilisateur** dans answering → émettre `done` et attendre (si todos/testing OK).
9. **Anti-boucle** : ne pas répéter exactement le même texte + mêmes tool calls (voir LoopDetector).

## `todo_write` n’est pas une phase

Anti-pattern interdit : écrire `[phase: todo_write]` + JSON inline.  
Correct : `[phase: planning]` (texte) puis **tool_call** natif `todo_write` avec arguments structurés.

## Mémoire et clôture

- À la fermeture complète d’un plan (`todo_write` tout `completed`/`cancelled`) et à nouveau au `done` non trivial, le moteur peut archiver sous **`.drox/memory/sessions/`** (résumé structuré).
- Recommandation prompt (non gate) : mettre à jour `MEMORY.md` à la racine workspace après un plan durable.
- L’outil `session_end` existe dans le registry mais est **filtré** pour le LLM : la clôture de fil chat est une **commande utilisateur** IDE (`/session_end`).

## Mode professor / course

> **Pas disponible** dans Drox IDE aujourd’hui (retiré / downgrade depuis 1.4.0 ; pas fiable). Reprise future éventuelle : [professor-2.0.md](../1.4/REPORT/professor-2.0.md) · [pédagogie 14](../pedagogie/14-mode-professor.md).

Des prompts additionnels et [`professor.rs`](../../drox-engine/drox/crates/drox-engine/src/professor.rs) peuvent encore figurer dans le dépôt — **ne pas** les traiter comme un mode utilisateur actif.

## Où le prompt est injecté

Construction agent côté RPC : [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) (`build_agent_setup`) remplit `AgentConfig.system_prompt`.  
La TUI utilise la même lib `drox-cli` (`prompts`) via son bootstrap.

## Lien avec les événements UI

`consume_stream` détecte les lignes `[phase: …]` → `AgentEvent::PhaseEnter`.  
Le shim IDE peut mapper vers d’anciennes stations rail — [ide-integration.md](ide-integration.md).

