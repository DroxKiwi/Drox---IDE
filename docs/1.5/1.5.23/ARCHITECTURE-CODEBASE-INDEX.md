# Architecture — index codebase Drox (type Cursor `@Codebase`)

**Statut** : **direction produit / tech** · pas encore d’implémentation  
**Version** : **1.5.23** (déplacé depuis 1.5.22 / 1.5.21 — hors ship tool calling et shell discussion ; originellement hors 1.5.19 Git Graph)  
**Objectif** : répliquer côté Drox le mécanisme qui rend un modèle **efficace sur la compréhension du code** sans charger tout le repo dans le contexte.

Références liées :
- [README.md](README.md) — périmètre 1.5.23
- [PLAN-CODE-MAP.md](PLAN-CODE-MAP.md) — carte visuelle du code
- [../1.5.19/PLAN-GIT-BRANCH-GRAPH.md](../1.5.19/PLAN-GIT-BRANCH-GRAPH.md) — socle canvas livré avec le Git Graph
- [../1.5.22/README.md](../1.5.22/README.md) — tool calling (précédent)

---

## 1. Problème

Un LLM (local Ollama ou API) n’a **pas** le repo en mémoire. Sans retrieval :

- soit on envoie trop de fichiers → coût / contexte saturé / bruit ;
- soit trop peu → hallucinations, mauvaises edits.

Cursor résout ça avec un pipeline **index → embeddings → recherche → injection ciblée** (`@Codebase`). Drox doit offrir l’équivalent **local-first**, aligné moteur `drox.exe` + Agents / chat IDE.

---

## 2. Ce qu’on réplique (modèle mental Cursor)

```text
Workspace files
      │
      ▼
  Chunking (+ structure : symboles / AST si possible)
      │
      ▼
  Embedding model  ──►  Vector index (local)
      │
      ▼
  Query (user / agent)
      │
      ▼
  Hybrid retrieve (sémantique + lexical)
      │
      ▼
  Top-k chunks  ──►  prompt / tools agent
```

| Brique | Rôle | Analogie Cursor |
|--------|------|-----------------|
| **Chunker** | Découpe le code en unités indexables | Indexation codebase |
| **Embedder** | Vecteurs sémantiques | Embeddings |
| **Store** | Stockage + similarité | Index / “BDD vectorielle” |
| **Retriever** | Top-k + filtres (chemin, lang, ignore) | `@Codebase` |
| **Injector** | Formate les chunks pour le LLM / tools | Contexte chat |

Ce n’est **pas** un fine-tune du modèle sur le projet.

---

## 3. Principes Drox

| Principe | Décision |
|----------|----------|
| Local-first | Index sur machine utilisateur (sous `.drox/` ou profil app) |
| Même stack agent | Consommé par chat natif IDE **et** fenêtre Agents |
| Ignore sensible | Respect `.gitignore` + liste Drox (`node_modules`, `out/`, `.git/objects`, secrets) |
| Hybride | Sémantique **+** ripgrep / chemin (comme Cursor combine souvent) |
| Pas de monolithe disque | Éviter un `state.vscdb`-like de dizaines de Go : index **borné**, GC, pas d’historique chat dans l’index |
| Réutilisable UI | Les hits retrieval peuvent nourrir plus tard la **carte code** (nœuds fichiers / symboles) |

---

## 4. Architecture cible

```text
┌──────────────────────────────────────────────────────────────┐
│  Surfaces                                                    │
│  Chat IDE · Agents · (futur) Carte code · commande palette │
└────────────────────────────┬─────────────────────────────────┘
                             │ IDroxCodebaseIndexService
                             │  - ensureIndexed(workspace)
                             │  - search(query, opts) → hits
                             │  - invalidate(paths)
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Indexer (background)                                        │
│  watch files · queue · chunk · embed · upsert                │
└─────────────┬──────────────────────────────┬─────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────┐    ┌─────────────────────────────┐
│  Chunk store (SQLite)   │    │  Vector store                 │
│  path, range, hash,     │    │  Option A: sqlite-vec /       │
│  lang, symbol, text     │    │  Option B: lance / qdrant     │
│                         │    │  Option C: fichiers + faiss   │
└─────────────────────────┘    └─────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│  Embed provider                                              │
│  local (Ollama nomic / mxbai…)  ou  API compatible           │
│  même famille config que connexions LLM Drox                 │
└──────────────────────────────────────────────────────────────┘
```

### Emplacement disque (proposition)

```text
{workspace}/.drox/codebase-index/
  manifest.json          # version schéma, modèle embed, stats
  chunks.sqlite          # métadonnées + texte chunk
  vectors.*              # selon backend choisi
```

Profil utilisateur si multi-root / cache partagé : `%APPDATA%\.drox-ide\codebase-index\<hash-workspace>\`.

**Règle** : l’index ne stocke **pas** l’historique de chat (ça reste ailleurs, borné).

---

## 5. Chunking (qualité = tout)

### Stratégie MVP

1. Fichier texte / code sous seuil (ex. &lt; 64 KiB) → chunks par **symbole** si tree-sitter / highlighter dispo, sinon fenêtres ~200–400 lignes avec overlap.
2. Fichiers trop gros → skip ou index **outline** seulement (exports, classes).
3. Hash contenu → skip si inchangé (index incrémental).

### Métadonnées par chunk

| Champ | Usage |
|-------|--------|
| `path` | Filtre, citation UI |
| `startLine` / `endLine` | Open file / diff |
| `language` | Filtre |
| `symbol` | Nom fonction/classe si connu |
| `contentHash` | Invalidation |
| `text` | Passage injecté au LLM |

---

## 6. Embeddings

### MVP recommandé

- Provider **local** via stack déjà Drox (Ollama) : modèle dédié embed (ex. famille `nomic-embed-text` / équivalent configurable).
- Dimension fixe documentée dans `manifest.json`.
- Changement de modèle embed → **rebuild** index (pas de mélange de dimensions).

### Settings (brouillon)

```text
drox.codebaseIndex.enabled          boolean
drox.codebaseIndex.embed.provider   ollama | openai-compatible | …
drox.codebaseIndex.embed.model      string
drox.codebaseIndex.maxFileBytes     number
drox.codebaseIndex.exclude          glob[]
```

---

## 7. Vector store — choix

| Option | Avantages | Inconvénients | Verdict 1.5.x |
|--------|-----------|---------------|----------------|
| **A — SQLite + extension vec / voisinage** | Simple, un fichier, local | Perf / features limitées | **MVP favori** |
| **B — LanceDB / SQLite+fichiers** | Bonne perf locale | Dépendance native | P1 si A limite |
| **C — Qdrant process** | Pro | Ops lourdes pour IDE desktop | Hors cible desktop |

**Décision direction** : démarrer **A** (tout local, un dossier `.drox`), mesurer latence / taille ; upgrader si besoin.

Recherche **hybride** obligatoire dès le MVP :

1. Vector top-k  
2. Lexical (`rg` / fuzzy path)  
3. Fusion (RRF ou score pondéré)  
4. Dédup par fichier / symbole  

---

## 8. API service (contrat)

Nom provisoire : **`IDroxCodebaseIndexService`**.

```ts
interface IDroxCodebaseSearchOptions {
  readonly maxResults?: number;       // défaut 8–16
  readonly pathPrefix?: string;
  readonly languages?: readonly string[];
  readonly includeLexical?: boolean;  // défaut true
}

interface IDroxCodebaseHit {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly score: number;
  readonly symbol?: string;
  readonly preview: string;           // extrait borné pour prompt
}

interface IDroxCodebaseIndexService {
  ensureIndexed(workspaceRoot: URI): Promise<void>;
  search(workspaceRoot: URI, query: string, opts?: IDroxCodebaseSearchOptions): Promise<readonly IDroxCodebaseHit[]>;
  invalidate(workspaceRoot: URI, paths: readonly URI[]): Promise<void>;
  getStatus(workspaceRoot: URI): IObservable<IDroxCodebaseIndexStatus>;
}
```

### Branchement agent

- Tool moteur / client : `codebase_search` (ou enrichissement automatique du contexte avant `agent.run`).
- UI : picker `@` “Codebase” / commande “Drox: Reindex codebase”.
- Jamais injecter plus de **N** tokens de hits (budget contexte configurable).

---

## 9. Pipeline d’indexation

```text
onDidChangeWorkspace / file watcher (debounce)
        │
        ▼
  filter ignore + taille
        │
        ▼
  hash vs chunks.sqlite
        │
   ┌────┴────┐
   │ skip    │ re-chunk + embed (batch)
   └─────────┘
        │
        ▼
  upsert vectors + metadata
        │
        ▼
  update status (indexedFiles, pending, lastError)
```

Concurrence : **une** file par workspace ; pause si machine sous batterie faible (option).

---

## 10. Privacy & taille disque

| Règle | Détail |
|-------|--------|
| Pas d’upload cloud par défaut | Index local ; cloud embed seulement si user configure API |
| Cap taille index | Soft limit (ex. 500 Mo / workspace) + GC chunks orphelins |
| Secrets | Ne pas indexer `.env`, clés, `credentials*` (liste + gitignore) |
| Logs | Pas de contenu de chunk dans les logs release |

Leçon Cursor `state.vscdb` 40 Go : **séparer** index codebase et historique chat ; **vacuum / rotation** sur les stores d’état.

---

## 11. Lien avec Git Graph / carte code

| Système | Domaine | Partage |
|---------|---------|---------|
| Git Graph 1.5.19 | Commits / branches | Layout canvas (socle) |
| Codebase index 1.5.23 | Contenu fichiers / symboles | Hits → nœuds carte |
| Carte code 1.5.23 | Navigation visuelle | UI + éventuellement graphe d’imports |

Le retrieval fournit **quoi montrer** ; le canvas fournit **comment le voir**.

---

## 12. Phases d’implémentation (hors ship graphe immédiat)

| Phase | Livrable | Dépend |
|-------|----------|--------|
| **CB0** | Spec figée + choix store A + modèle embed défaut | — |
| **CB1** | Chunker + sqlite metadata + index incrémental (sans embed : BM25/lexical only) | CB0 |
| **CB2** | Embed local + vector search + hybrid | CB1 |
| **CB3** | Tool agent + UI statut / reindex | CB2 |
| **CB4** | `@` Codebase dans composer + budget tokens | CB3 |
| **CB5** | Alimentation carte code (optionnel) | CB3 + canvas |

**1.5.23** : cette fiche = **CB0 documentaire** ; ship cible des phases CB1+ dans cette release (à trancher au planning vs carte code).

---

## 13. Critères d’acceptation (quand on implémente)

1. Sur un repo type Drox IDE, `search("checkout git branch")` remonte des fichiers pertinents (`*Git*`, sessions…) dans le top-10.
2. Éditer un fichier → réindex du fichier &lt; quelques secondes (debounce).
3. Dossier index &lt; soft limit ; `node_modules` absent de l’index.
4. Agent utilise les hits sans dépasser le budget contexte.
5. Mode offline (Ollama) fonctionnel de bout en bout.

---

## 14. Hors scope de cette fiche

- Fine-tuning / LoRA sur le code utilisateur  
- Index cloud hébergé Drox (sauf décision produit ultérieure)  
- Remplacer entièrement grep / open file (complément, pas substitution)  
- Parité pixel Cursor indexing UI  

---

## 15. Décisions à trancher avant code

| # | Question | Proposition défaut |
|---|----------|-------------------|
| 1 | Store vectoriel | SQLite (+ vec) local |
| 2 | Modèle embed défaut | Ollama, modèle documenté dans settings |
| 3 | Auto-inject vs tool only | Tool `codebase_search` d’abord, auto-inject opt-in |
| 4 | Emplacement | `{workspace}/.drox/codebase-index/` |
| 5 | Release cible | **1.5.23** |
