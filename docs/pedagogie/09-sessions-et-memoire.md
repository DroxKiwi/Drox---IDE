# Sessions et mémoire — ce qui survit après un tour

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : la **persistance**. Le contexte LLM en RAM ([08](08-contexte-et-compaction.md)) est éphémère. Les **sessions** et la **mémoire projet** permettent de reprendre un fil, auditer un run, ou rappeler une décision la semaine suivante.

### L’histoire en une phrase

Chaque message / tool peut être **écrit sur disque** (JSONL) ; à certains jalons, le moteur **archive** un résumé sous `.drox/memory/` ; le modèle peut aussi tenir un `MEMORY.md` via les outils fichier.

### Fichiers

| Fichier | Rôle |
|---------|------|
| [`drox-session`](../../drox-engine/drox/crates/drox-session/src/lib.rs) | Transcripts, chemins |
| [`memory.rs`](../../drox-engine/drox/crates/drox-engine/src/memory.rs) / [`long_memory.rs`](../../drox-engine/drox/crates/drox-engine/src/long_memory.rs) | Orchestration mémoire run |
| [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) | `session.list` / `read` / `compact` / truncate |
| Réf. | [sessions-and-memory.md](../engine/sessions-and-memory.md) |

---

## Partie A — Trois couches (ne pas les fusionner mentalement)

| Couche | Où | Rôle |
|--------|-----|------|
| **Transcript JSONL** | Souvent `~/.drox/sessions/{id}.jsonl` | Trace complète du dialogue (reprise UI, debug) |
| **Contexte LLM vivant** | RAM dans `drive_inner` | Ce qui est *réellement* envoyé au modèle (snip/compact) |
| **Mémoire projet** | `.drox/memory/`, `MEMORY.md`, tools `memory_*` | Décisions durables liées au repo |

Écrire sur disque ≠ tout renvoyer au modèle à chaque tour.  
Le transcript peut être **plus riche** que le contexte courant.

---

## Partie B — JSONL, c’est quoi ?

**JSONL** = un objet JSON **par ligne**, fichier append-only.

```text
{"schema_version":1,"timestamp":"…","message":{…}}
{"schema_version":1,"timestamp":"…","message":{…}}
```

| Idée | Pourquoi c’est pratique |
|------|-------------------------|
| Une ligne = un enregistrement | On peut ajouter sans réécrire tout le fichier |
| Texte UTF-8 | Debuggable à l’œil / `grep` |
| Schema version | Évoluer le format plus tard |

**Côté machine** : ouvrir le fichier, écrire des bytes + `\n`, flush. Pas de base SQL obligatoire pour le MVP session.

### Exemple concret — chemins de session

[`paths.rs`](../../drox-engine/drox/crates/drox-session/src/paths.rs) :

```rust
pub fn default_sessions_dir() -> Result<Utf8PathBuf, SessionError> {
    let home = dirs::home_dir().ok_or(SessionError::NoHomeDir)?;
    let joined = home.join(".drox").join("sessions");
    Utf8PathBuf::try_from(joined).map_err(|_| SessionError::InvalidPath)
}

pub fn transcript_path(sessions_dir: &camino::Utf8Path, session_id: &SessionId) -> Utf8PathBuf {
    sessions_dir.join(format!("{session_id}.jsonl"))
}
```

| Morceau | Détail |
|---------|--------|
| `dirs::home_dir()` | Lib **dirs** : chemin du home utilisateur (`C:\Users\…` / `/home/…`) |
| `.ok_or(SessionError::NoHomeDir)?` | `Option` → `Result` : pas de home = erreur typée |
| `home.join(".drox").join("sessions")` | Construit `~/.drox/sessions` |
| `Utf8PathBuf` (**camino**) | Chemin garanti UTF-8 (plus sûr pour JSON / affichage que `PathBuf` opaque) |
| `format!("{session_id}.jsonl")` | Nom de fichier transcript |

Fichiers voisins fréquents : `{id}.meta.json`, `{id}.ui-stats.json`.

---

## Partie C — RPC session.*

| Méthode | Pour l’humain |
|---------|----------------|
| `session.list` | « Quelles conversations ai-je ? » |
| `session.read` | Recharger l’historique dans l’UI / continuer |
| `session.compact` | Forcer un résumé LLM du transcript |
| `session.truncateAfterLastUser` | Couper après le dernier message user (retry / édition) |

`agent.run` peut reprendre via `continue_from_history` plutôt que partir de zéro ([02](02-boucle-agent.md)).

---

## Partie D — Archives automatiques `.drox/memory/sessions/`

Le prompt système explique (et le code fait) à peu près :

1. Quand un plan `todo_write` passe entièrement à `completed` / `cancelled` → archive possible.
2. À la clôture `[phase: done]` d’un run non trivial → autre archive possible.

Chaque fichier porte date, slug, objectif une ligne — réinjectés au **démarrage** d’un run sur le même workspace pour rappeler le passé.

Événement : `MemoryPersisted`.

---

## Partie E — Tools mémoire / notes

| Tool (ex.) | Idée |
|------------|------|
| `memory_read` / `memory_list` | Lire la mémoire structurée |
| `session_note` | Note de session (selon câblage contexte) |
| `file_edit` sur `MEMORY.md` | Mémoire « libre » versionnable dans le repo |

`session_end` côté registry est souvent **filtré** pour le LLM : la clôture de fil chat est une action **utilisateur** IDE.

---

## Récapitulatif

1. Transcript = histoire sur disque ; contexte = ce que le modèle voit *maintenant*.
2. JSONL append-only pour les sessions.
3. Archives auto + `MEMORY.md` = mémoire projet.
4. RPC `session.*` = contrôle depuis l’UI.

## Suite

[10-parallelisme-outils.md](10-parallelisme-outils.md). Index : [README.md](README.md).

