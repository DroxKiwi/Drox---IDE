# Architecture — mémoire long terme (remplacement markdown)

**Date** : 2026-05-20  
**Statut** : conception — remplace progressivement l’empilement `.md` dans le prompt  
**Contrainte produit** : contexte utilisateur typique **16k–64k tokens** — la mémoire ne doit **jamais** consommer plusieurs milliers de tokens en tête de run par défaut.

**Documents liés** : [MODELES-PAR-TAILLE](./MODELES-PAR-TAILLE.md) · [REFACTO-STRUCTURE-CODE](../plans/REFACTO-STRUCTURE-CODE.md) · [BACKLOG-SPRINTS-POST-PHASE2](../suivi/BACKLOG-SPRINTS-POST-PHASE2.md)

---

## 1. État actuel (coûteux)

| Mécanisme | Emplacement | Coût tokens / I/O |
|-----------|-------------|-------------------|
| **Memdir** | `MEMORY.md`, `DROX.md` à la racine workspace | Injection **complète** dans le system prompt (`memdir_system_prefix`) |
| **Sessions archivées** | `.drox/memory/sessions/*.md` | Listing jusqu’à 10 entrées + corps potentiel |
| **Compaction run** | `drox-engine/compaction.rs` | Résumé LLM → nouveau `.md` par session |
| **Long memory IDE** | `droxLongMemoryStore.ts` + `droxEmbeddings.ts` | JSON + embeddings côté workbench (déjà vectoriel partiel) |
| **Règle prompt** | `CORE_SYSTEM_PROMPT` § MEMORY.md | Encourage réécriture markdown après chaque run |

**Symptômes** :

- Double empreinte : Rust injecte des listes markdown **et** le workbench maintient une base embeddings séparée.
- Fichiers `.md` grossissent → relus en entier à chaque run.
- Sur 16k contexte, 3–8k tokens de « mémoire » + tools + transcript = échec ou truncation.

---

## 2. Objectifs V2

1. **Budget mémoire fixe** par run : ex. **≤ 800 tokens** system-side (configurable par `modelTier`).  
   **Interim M4b (2026-05-20)** : profil `low` — listing sessions **omis** (`assemble_low`) ; memdir **tronqué** à 120 tokens (`memory_budget.rs`) ; rappel via `memory_read` / `memory_list`. Medium : budget `None` (legacy inchangé).
2. **Stockage local** sous `.drox/` (ou répertoire utilisateur IDE) — **pas** de cloud.
3. **Récupération à la demande** : le modèle n’a pas tout l’historique ; il dispose d’outils `memory_search` / `memory_read` (déjà partiellement présents côté moteur).
4. **Compat migration** : import one-shot des `.md` existants → chunks indexés.
5. **Embeddings légers** : modèle petit, exécutable localement (Ollama `nomic-embed-text`, `all-minilm`, ou API embed du même host).

---

## 3. Architecture proposée

```
┌─────────────────────────────────────────────────────────┐
│  Workbench Drox (electron)                               │
│  MemoryService ──► SQLite (better-sqlite3 ou VS storage) │
│       │              tables: chunks, sessions, embeds    │
│       └──► Embedder (Ollama / WASM petit modèle)         │
└───────────────────────┬─────────────────────────────────┘
                        │ JSON-RPC memory.* (optionnel)
┌───────────────────────▼─────────────────────────────────┐
│  Moteur Rust                                             │
│  memory_budget.rs — assemble ≤ N tokens pour le prompt   │
│  tools: memory_search, memory_read (déjà en registry)    │
└─────────────────────────────────────────────────────────┘
```

### 3.1 Schéma SQLite (esquisse)

| Table | Rôle |
|-------|------|
| `chunks` | `id`, `workspace_id`, `kind` (fact, decision, snippet, session_summary), `text`, `source_path`, `created_at`, `token_estimate` |
| `embeddings` | `chunk_id`, `vector BLOB` (float32[]), `model_id` |
| `session_closures` | `session_id`, `objective`, `closed_at`, `chunk_id` (FK résumé) |
| `pins` | entrées utilisateur « toujours rappeler » (remplace gros `MEMORY.md`) |

**Fichier** : `<workspace>/.drox/memory/store.sqlite` (ou global `~/.drox/memory/<workspace-hash>.sqlite`).

### 3.2 Pipeline à la clôture de run

1. Sur `[phase: done]` accepté : compaction LLM produit un **résumé structuré** (JSON : `objective`, `facts[]`, `files[]`, `pitfalls[]`) — **pas** un markdown libre de 2 pages.
2. `MemoryService.ingest(closure)` : découpe en chunks ≤ 400 tokens, embed, insert.
3. **Ne plus** réécrire `MEMORY.md` automatiquement (opt-in utilisateur `/memory export`).

### 3.3 Injection prompt (budget)

Ordre de priorité (medium tier) :

1. **Pins** (max 3 entrées, ~150 tokens total).
2. **Résumé session précédente** la plus pertinente (similarité question utilisateur OU dernière clôture) — 1 chunk, ~200 tokens.
3. **Workspace map** fresh (inchangé, déjà optimisé).
4. Ligne d’**instruction** : « Use `memory_search` for older context; do not assume full history. »

Profil **low** : pins only (≤ 100 tokens) + instruction courte.

### 3.4 Recherche

- **Phase 1** : BM25 / FTS5 SQLite sur `chunks.text` (zero dépendance embed).
- **Phase 2** : hybrid FTS + cosine sur embeddings (top-k = 5, seuil minimal).
- Tool `memory_search { query, limit }` retourne des **extraits** courts, pas des fichiers entiers.

### 3.5 Dépréciation progressive

| Ancien | Nouveau |
|--------|---------|
| `MEMORY.md` injecté en entier | 0–3 **pins** synchronisés depuis une vue UI « Mémoire projet » |
| `.drox/memory/sessions/*.md` | Import migration ; nouvelles clôtures → SQLite only |
| `format_sessions_listing_for_prompt` | `format_memory_digest_for_prompt` (budget tokens) |
| `LongMemoryStore` JSON ad hoc | Unifier sur même SQLite |

---

## 4. Embeddings « très léger côté client »

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **Ollama** `nomic-embed-text` | Déjà dans la stack, pas de binaire supplémentaire | Appel réseau local, latence |
| **ONNX Runtime** + MiniLM quantifié | Offline, prévisible | Taille binaire, pipeline build |
| **Pas d’embed (FTS5 seul)** | Simple, rapide | Moins bon pour paraphrase |

**Recommandation V1** : FTS5 + option embed Ollama activable via `nexus.drox.memory.embeddings`.

---

## 5. Impact contexte 16k–64k

| Composant | Aujourd’hui (ordre de grandeur) | Cible V2 |
|-----------|----------------------------------|----------|
| System prompt core | ~4–6k | ~4k (medium) / ~1.5k (low) |
| Memdir + sessions listing | 1–8k+ | **≤ 0.8k** |
| Tools schema | 2–4k | 1–2k (low : moins d’outils) |
| Transcript actif | reste | reste (compaction agressive inchangée) |

**Compaction** : conserver `ContextPolicy::for_model_context_window` ; déclencher plus tôt si mémoire digest + tools dépassent 40 % de `num_ctx`.

---

## 6. Roadmap

| Sprint | Livrable |
|--------|----------|
| **Mem-A** | `MemoryService` SQLite + FTS5 ; migration import `.md` ; pins UI minimale |
| **Mem-B** | `memory_budget.rs` moteur ; retrait injection `memdir` complète par défaut |
| **Mem-C** | Embeddings Ollama + `memory_search` hybrid |
| **Mem-D** | Profils low/medium budgets ; métriques (tokens mémoire dans pastille ctx) |

### Critères d’acceptation

- [ ] Run medium sur 32k ctx : mémoire system **< 1000 tokens** mesurés.
- [ ] Ancien workspace avec 20 sessions `.md` : recherche retourne le bon extrait en 1 tool call.
- [ ] `MEMORY.md` optionnel — plus de règle « obligatoire avant done » dans le prompt.

---

## 7. Fichiers code concernés (référence)

| Zone | Fichiers |
|------|----------|
| Rust memdir | `drox-session/src/memdir.rs`, `memory_sessions.rs` |
| Rust compaction | `drox-engine/src/compaction.rs`, `memory.rs` |
| IDE store | `electron-browser/droxLongMemoryStore.ts`, `common/droxLongMemory.ts`, `droxEmbeddings.ts` |
| Tools | `memory_read`, `memory_list` registry |

---

## 8. Risques

- **Double source de vérité** pendant migration — feature flag `nexus.drox.memory.v2`.
- **SQLite concurrent** (plusieurs fenêtres) — WAL mode + verrou par workspace.
- **Qualité résumé** à la clôture — garder revue humaine via commande `/memory review`.

*KDDS Nexus — la mémoire doit être **rappelée**, pas **relue en entier** à chaque message.*
