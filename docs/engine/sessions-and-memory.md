# Sessions et mémoire

## Idée centrale

Trois mémoires **non fusionnées** :

| Couche | Rôle | Durée de vie |
|--------|------|--------------|
| **Transcript JSONL** | Trace run (reprise UI, debug) | `~/.drox/sessions/` |
| **Contexte LLM vivant** | Messages réellement envoyés au modèle | Snip / compact **pendant** le run |
| **Archives / notes projet** | Décisions durables | `.drox/memory/`, `MEMORY.md` |

Snip = **déterministe** (`drox-context`) ; compaction live = **LLM** si budget encore serré ([`compaction.rs`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs)).

En parallèle, la **situation card** ([`agent/situation/`](../../drox-engine/drox/crates/drox-engine/src/agent/situation/)) réécrit un **bloc system court** chaque tour (paths touchés, todos, couverture Explore) — ce n’est pas le JSONL, mais ça compresse l’état visible du run.

## Transcripts JSONL

Crate [`drox-session`](../../drox-engine/drox/crates/drox-session/src/lib.rs).

| Élément | Emplacement |
|---------|-------------|
| Répertoire défaut | `~/.drox/sessions/` |
| Transcript | `{session_id}.jsonl` |
| Stats UI | `{session_id}.ui-stats.json` |
| Meta | `{session_id}.meta.json` |

Ligne = `ChatMessageRecord` (`schema_version` **1**, `Message`). Append via `JsonlTranscriptSink`.

Override : `sessionDir` / profil IDE. Écriture pendant run : [`run/lifecycle.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/lifecycle.rs) (`flush_transcript`).

## RPC `session.*`

| Méthode | Usage |
|---------|--------|
| `session.list` | Index sessions |
| `session.read` | Historique + `ui_stats` |
| `session.compact` | Compaction LLM hors run agent |
| `session.truncateAfterLastUser` | Retry / édition transcript |

Handlers : [`handlers/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs).

`agent.run` : reprise `continue_from_history` si `skipUserTurn` / session existante.

## Budget contexte dans la boucle

Avant tours LLM coûteux — [`maybe_snip`](../../drox-engine/drox/crates/drox-engine/src/agent/run/lifecycle.rs) :

1. Comptage tokens ([`drox-context`](../../drox-engine/drox/crates/drox-context/src/lib.rs))
2. Snip blocs froids → `ContextSnip`
3. Compaction live → `ContextCompacted` ([`try_live_compact`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs))

`session.compact` (RPC) = chemin **client explicite**, distinct de la compaction auto run.

Gros **tool_result** : spill / stub ([`tool_result_spill/`](../../drox-engine/drox/crates/drox-engine/src/agent/tool_result_spill/)) avant snip agressif.

## Mémoire projet vs moteur

| Mécanisme | Où | Qui écrit |
|-----------|-----|-----------|
| JSONL | `~/.drox/sessions/` | Moteur (append) |
| Archives | `.drox/memory/sessions/` | Moteur : plan clos + run non trivial ([`memory.rs`](../../drox-engine/drox/crates/drox-engine/src/memory.rs)) |
| `MEMORY.md` | Racine workspace | Modèle (`file_edit`) — recommandé, non gate |
| Tools | `session_note`, `memory_*`, skills | Modèle / runtime |
| Memdir | `DROX.md`, etc. | [`drox-session`](../../drox-engine/drox/crates/drox-session/) |

Événement **`MemoryPersisted`** · DTO longue durée : [`memory/long.rs`](../../drox-engine/drox/crates/drox-engine/src/memory/long.rs) (réexport `long_memory`).

Au boot run, le prompt peut lister les archives workspace (slug, objectif).

## Local only

Pas de cloud Drox obligatoire pour transcripts / mémoire — profil utilisateur + fichiers projet (souvent `.drox/` gitignoré).

## Fichiers

| Rôle | Chemin |
|------|--------|
| Session | [`drox-session/`](../../drox-engine/drox/crates/drox-session/) |
| Tokens / snip | [`drox-context/`](../../drox-engine/drox/crates/drox-context/) |
| Compaction | [`compaction.rs`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs) |
| Situation card | [`agent/situation/`](../../drox-engine/drox/crates/drox-engine/src/agent/situation/) |
| RPC | [`handlers/mod.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs) |
