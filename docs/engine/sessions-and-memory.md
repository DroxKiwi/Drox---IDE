# Sessions et mémoire

## Transcripts JSONL

Crate [`drox-session`](../../drox-engine/drox/crates/drox-session/src/lib.rs).

| Élément | Emplacement / format |
|---------|----------------------|
| Répertoire défaut | `~/.drox/sessions/` (`paths::default_sessions_dir`) |
| Transcript | `{sessions_dir}/{session_id}.jsonl` |
| Stats UI | `{session_id}.ui-stats.json` |
| Métadonnées | `{session_id}.meta.json` |

Chaque ligne JSONL = `ChatMessageRecord` :

- `schema_version` = **1** (`TRANSCRIPT_SCHEMA_VERSION`)
- `timestamp` RFC3339
- `message` (`drox_types::Message`)

Écriture **append-only** (`JsonlTranscriptSink`).

Côté IDE, le profil utilisateur peut rediriger / synchroniser ces chemins ; le moteur accepte `session_dir` dans les params RPC.

## RPC `session.*`

| Méthode | Usage |
|---------|-------|
| `session.list` | Enumérer (`id`, `modified_secs`, `size_bytes`) |
| `session.read` | Charger historique + `ui_stats` |
| `session.compact` | Compaction LLM → résumé / objectif / files_touched / usage |
| `session.truncateAfterLastUser` | Couper après le dernier message user (édition / retry) |

`agent.run` peut **reprendre** une session (`continue_from_history`) plutôt que partir de zéro — handlers dans [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs).

## Compaction / budget dans la boucle

Dans `drive_inner`, avant les tours LLM coûteux ([`maybe_snip`](../../drox-engine/drox/crates/drox-engine/src/agent.rs)) :

1. Estimation tokens ([`drox-context`](../../drox-engine/drox/crates/drox-context/src/lib.rs))
2. Snip des blocs froids → événement `ContextSnip`
3. Compaction live ([`compaction.rs`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs)) → `ContextCompacted`

But : rester sous le contexte du modèle sans perdre plan / décisions.

`session.compact` (RPC) est le chemin **explicite** client (outil remote / commande UI) distinct de la compaction live automatique.

## Mémoire projet vs mémoire moteur

| Mécanisme | Où | Qui écrit |
|-----------|-----|-----------|
| Transcript JSONL | `~/.drox/sessions/*.jsonl` | Moteur (chaque tour) |
| Archives session | **`.drox/memory/sessions/`** (workspace) | Moteur auto : (1) plan entièrement clos, (2) run `done` non trivial |
| `MEMORY.md` | Racine workspace | Modèle via `file_edit` (recommandé, non gate) |
| `session_note` / `memory_read` / `memory_list` | Via tools | Modèle / runtime |
| Memdir / `DROX.md` | Projet | Voir modules `memdir` de `drox-session` |
| Skills | Workspace skills | `skill_list` / `skill_read` |

Orchestration côté engine : [`memory.rs`](../../drox-engine/drox/crates/drox-engine/src/memory.rs), [`long_memory.rs`](../../drox-engine/drox/crates/drox-engine/src/long_memory.rs).  
Événement `MemoryPersisted` quand une archive est écrite.

Au démarrage d’un run, le prompt système peut injecter un résumé des archives workspace (date UTC, slug, objectif une ligne) pour rappel de décisions antérieures.

## Ce qui n’est pas cloud

Aucun compte cloud Drox n’est requis pour le cœur : tout reste **local** au profil + fichiers projet que tu choisis de versionner (souvent `.drox/` est gitignoré — vérifier ton `.gitignore` / `.droxignore`).

## Fichiers

| Rôle | Chemin |
|------|--------|
| Session crate | [`drox-session/`](../../drox-engine/drox/crates/drox-session/) |
| Contexte / tokens | [`drox-context/`](../../drox-engine/drox/crates/drox-context/) |
| Compaction | [`compaction.rs`](../../drox-engine/drox/crates/drox-engine/src/compaction.rs) |
| RPC | [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) |
