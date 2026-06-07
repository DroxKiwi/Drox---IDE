# Plan 1.3.5 — Index, graphe, fast path

**Version** : brouillon juin 2026  
**Base** : moteur 1.3.2 (`role_split` simplifié — voir [CONDUCTEUR-CODE.md](../1.3.2/CONDUCTEUR-CODE.md))  
**Prérequis** : [1.3.3](../1.3.3/README.md) release fiable · [1.3.4](../1.3.4/README.md) stabilisation moteur

---

## Vision

```text
IDE (curseur, LSP, buffer)
  → Index local (.drox/index/)
  → ContextPack (≤5 fichiers + extraits)
  → GraphContext (voisins typés)
       ├─► Fast path (complétion, petit modèle, <100ms perceived)
       └─► Architecte chat (run existant, pack injecté au boot)
```

---

## P1 — Indexation intelligente (RAG local)

**Problème** : `workspace_map_read` donne l'arbre ; le modèle doit encore deviner quoi lire.

**Cible** : à la position du curseur, assembler **~5 fichiers** sans tour LLM de recherche.

### Couches

| Couche | Source | Latence |
|--------|--------|---------|
| A | Fichier ouvert, sélection, diagnostics LSP | 0 ms |
| B | Graphe import / call / tests (index disque) | ms |
| C | Embeddings chunks locaux (optionnel) | 10–50 ms |

### Livrables

| Phase | Livrable | Priorité |
|-------|----------|----------|
| P1.0 | Contrat RPC `ContextPack` (IDE → moteur) | P0 |
| P1.1 | Heuristique A+B sans embeddings | P0 |
| P1.2 | Persistance `.drox/index/symbols.jsonl` + `edges.jsonl` | P1 |
| P1.3 | Chunks + embeddings (sqlite-vec ou équivalent) | P2 |

### Critère d'acceptation

Run edit sur une fonction : le boot system contient un bloc **Context pack** avec ≤5 chemins et extraits bornés ; l'architecte n'appelle pas `workspace_map_read` pour « comprendre » le voisinage immédiat.

---

## P2 — Contexte par graphe

**Problème** : l'arbre plat ne dit pas *pourquoi* les fichiers sont liés.

**Cible** : injecter une **Graph View** condensée :

```text
### Graph context (focus: src/auth/login.ts::validateToken)
  imports → jwt.ts, user.ts
  called_by → middleware.ts
  tests → login.test.ts
```

### Livrables

| Phase | Livrable |
|-------|----------|
| P2.0 | Format markdown `GraphContext` + injection boot edit |
| P2.1 | Builder depuis index P1.2 (arêtes typées) |
| P2.2 | Remplacement progressif de la carte workspace complète en discuss |

### Impact orchestration

- `scope` delegate dérivé du pack (moins d'erreurs)
- Cap `max_reads_before_delegate` moins souvent atteint

---

## P3 — Fast path (latence / workflow)

**Problème** : la boucle architecte (plan, delegate, phases) est trop lente pour Tab / complétion inline.

**Cible** : **deux chemins** distincts :

| Chemin | Modèle | Usage |
|--------|--------|-------|
| **Fast** | Petit, local, quantisé | Complétion, multi-ligne, refactor local |
| **Slow** | Architecte actuel | Chat, delegate, verify |

### Livrables

| Phase | Livrable |
|-------|----------|
| P3.0 | Spec RPC `completion.run` (hors `agent.run` orchestration) |
| P3.1 | ContextPack seul (pas de `todo_write` / delegate) |
| P3.2 | Modèle + settings dédiés IDE (`drox.completionModel`) |
| P3.3 | (Optionnel) LoRA / adapter workflow Drox |

### Critère d'acceptation

Complétion inline : premier token visible &lt; 100 ms perceived sur machine dogfood ; **aucun** event `architect` / `delegate_executor`.

---

## P4 — Benchmark local & config recommandée (par modèle)

**Problème** : l'utilisateur choisit un modèle mais ne sait pas quels réglages (`num_ctx`, parallélisme, strictness…) ni quelles **capacités** (vision, tools, long run) sont viables sur **son** hardware.

**Cible** : benchmark du **modèle choisi** → profil de capacités + **config fortement conseillée** (paramètre par paramètre ou preset bundle). **Le modèle reste hors preset.**

### Sorties

| Artefact | Contenu |
|----------|---------|
| `ModelCapabilityProfile` | ctx max, vision, cohérence court/long, fiabilité outils, débit, parallélisme |
| `RecommendedConfig` | `num_ctx`, exécuteurs, `engine.strictness`, compaction… — preset Éco/Équilibré/Performance = **bundle de paramètres**, pas choix de modèle |

### Benchmark (`benchmark.run`)

| Phase | Livrable |
|-------|----------|
| P4.0 | Spec profil + reco + mapping settings |
| P4.1 | `hardware.detect` + B1–B3 (TTFT, débit, ctx max) |
| P4.2 | B5–B7 cohérence court/long + tool calling |
| P4.3 | UI détail + preset bundle + `recommendedConfig.apply` |
| P4.4 | B8 vision, B4 parallèle, B9 fast path |

Stockage : `.drox/models/<model-id>/profile.json`.

**Fiche** : [12-presets-globaux-benchmark-hardware.md](../../feature-brainstorm/12-presets-globaux-benchmark-hardware.md)

### Critère d'acceptation

Modèle choisi par l'utilisateur inchangé → benchmark → reco appliquée → run sans OOM ; profil réutilisé si hardware identique.

---

## Ordre recommandé

```text
P1.0 ContextPack RPC
  → P1.1 heuristique IDE+LSP
  → P2.0 GraphContext format + injection
  → P1.2 index persistant
  → P4.0–P4.2 presets + benchmark (peut démarrer en parallèle de P1)
  → P3.0 fast path RPC
  → P4.3 apply preset + wizard UI
  → P1.3 embeddings (si besoin réel)
  → P4.4 parallèle + fast path benchmark
```

---

## Références brainstorm

- [08-performance-traitement-rapide.md](../../feature-brainstorm/08-performance-traitement-rapide.md)
- [09-roles-specialises-comprehension-code.md](../../feature-brainstorm/09-roles-specialises-comprehension-code.md) (Cartographe / Analyste — fusionné en index P1/P2)
- [12-presets-globaux-benchmark-hardware.md](../../feature-brainstorm/12-presets-globaux-benchmark-hardware.md)

---

## Non-objectifs

- Gate chain TOML
- Backpack `.drox/backpack/`
- Palier `EditTier` moteur
