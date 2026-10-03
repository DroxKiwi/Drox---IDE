# Codebase & RAG — index local et discussion active

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment Drox indexe un dossier** pour le retrieval (`@Codebase` / `codebase_search`), et **quand** ça tourne — surtout dans la fenêtre Agents où plusieurs discussions = plusieurs racines.

Pas de second LLM : un **index de fichiers** sous `.drox/codebase-index/`.  
Référence : [codebase-and-rag.md](../engine/codebase-and-rag.md).

### L’histoire en une phrase

Quand tu **ouvres** ou **focus** une discussion liée à un dossier, Drox lance (ou reprend) l’index de **ce** dossier en arrière-plan — pas de tous les projets de ta liste d’historique.

### Fichiers à laisser ouverts

| Fichier | Rôle |
|---------|------|
| [`droxCodebaseAutoIndex.ts`](../../src/vs/workbench/contrib/drox/common/codebase/supervision/droxCodebaseAutoIndex.ts) | File 1-root + coalesce |
| [`droxCodebaseSupervisionService.ts`](../../src/vs/workbench/contrib/drox/common/codebase/droxCodebaseSupervisionService.ts) | `setActiveRoot`, snapshot cockpit |
| [`droxSessionsActiveSessionSync.ts`](../../src/vs/sessions/contrib/drox/browser/droxSessionsActiveSessionSync.ts) | Focus session → pin root |
| [`droxSessionsCockpitActions.ts`](../../src/vs/sessions/contrib/drox/browser/droxSessionsCockpitActions.ts) | Icônes historique Codebase / Regulation |
| Réf. | [codebase-and-rag.md](../engine/codebase-and-rag.md) |

---

## Partie A — Automatique, mais lazy

| Question | Réponse |
|----------|---------|
| C’est automatique ? | Oui — **1er open** d’un dossier jamais indexé → index en background ; ensuite le watcher prend le relais |
| Hash déjà à jour ? | `ensureIndexed` est quasi noop (hash-skip) |
| Tous les dossiers de l’historique ? | **Non** |
| File d’attente ? | Oui : **un** index à la fois ; si tu changes vite de discussion, seul le **dernier** root est gardé (coalesce) |
| Déclencheur ? | Focus discussion / open folder (`active-root`, `startup`, `missing-index`, …) |

---

## Partie B — Où cliquer (Agents)

1. Liste des discussions (sidebar) → hover une ligne → icônes **database** (Codebase) / **pulse** (Regulation).  
2. Ou chips dans le composer.  
3. Ou activity bar sidebar (mêmes vues que l’IDE).

Le cockpit affiche toujours le root **actif** (celui de la discussion focus / dernière icône cliquée).

---

## Partie C — Lien avec la régulation

- **L1** borne le budget d’inject Codebase.  
- **L5** module la posture retrieval (hint plus ou moins fort).  
- Les **notes** Regulation sont aussi stockées **par racine** — voir [15-regulation-et-notes.md](15-regulation-et-notes.md).

---

## Pour aller plus loin

- [codebase-and-rag.md](../engine/codebase-and-rag.md)  
- [PLAN-AGENTS-PARITY.md](../1.5/1.5.22/PLAN-AGENTS-PARITY.md)  
- [PLAN-CB2b.md](../1.5/1.5.21/codebase/PLAN-CB2b.md)  
- Tutoriel UI : [ide-navigation.md](../tutorials/ide-navigation.md)
