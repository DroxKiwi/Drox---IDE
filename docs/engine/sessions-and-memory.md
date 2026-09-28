# Sessions et mémoire

## Transcripts

Chaque run / conversation est persisté en **JSONL** (crate `drox-session`) sous le répertoire de sessions du profil (côté IDE : données utilisateur Drox, pas le repo git en général).

Le transcript contient typiquement :

- messages user / assistant ;
- appels d’outils et résultats ;
- métadonnées (modèle, timestamps, stats UI).

## RPC session.*

| Méthode | Usage |
|---------|-------|
| `session.list` | Enumérer les sessions connues |
| `session.read` | Charger historique pour reprise UI / continue |
| `session.compact` | Déclencher une compaction |
| `session.truncateAfterLastUser` | Couper après le dernier message user (édition / retry) |

`agent.run` peut **reprendre** une session (`continue_from_history`) plutôt que partir de zéro.

## Compaction / budget

Dans `drive_inner`, avant les tours LLM coûteux :

- estimation de tokens (`drox-context`) ;
- snip des parties froides ;
- compaction → snapshot réinjectable.

But : rester sous le contexte du modèle sans perdre l’essentiel du plan / des décisions.

## Mémoire projet

Selon config / outils :

- notes de session (`session_note`, …) ;
- memdir / fichiers type `MEMORY.md` ou équivalent projet ;
- skills chargés depuis le workspace.

La mémoire **n’est pas** un cloud imposé : tout reste local au profil + fichiers du repo que tu choisis de versionner.

## Fichiers

- `drox-engine/drox/crates/drox-session/`
- `drox-engine/drox/crates/drox-context/`
- `drox-engine/drox/crates/drox-engine/src/compaction.rs`
- handlers RPC : `drox-cli/src/jsonrpc/handlers.rs`
