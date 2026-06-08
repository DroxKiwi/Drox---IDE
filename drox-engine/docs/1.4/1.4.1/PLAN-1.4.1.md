# Plan 1.4.1 — Onboarding, index, graphe, fast path

**Version** : brouillon juin 2026 (ex-1.3.5, renumérotée en 1.4.1)  
**Base** : moteur [1.4.0 Run Rail](../1.4.0/README.md) + `role_split` — voir [CONDUCTEUR-CODE.md](../../1.3/1.3.2/CONDUCTEUR-CODE.md)  
**Prérequis** : [1.3.3](../../1.3/1.3.3/README.md) release fiable · [1.4.0](../1.4.0/README.md) run rail livré

---

## Vision

```text
Premier lancement
  → Onboarding Drox (assistant paramétrage, pas Copilot)
       ├─► Détection Ollama / drox.exe / workspace
       ├─► Choix modèle + benchmark (P4) → preset conseillé
       └─► Tour rapide Chat + réglages essentiels

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

## P5 — Onboarding & premier lancement (accueil + paramétrage guidé)

**Problème** : D1.x coupe le welcome / onboarding Microsoft (`startupEditor: none`, Copilot off) sans proposer d’alternative Drox — le nouvel utilisateur atterrit dans une IDE vide sans savoir configurer Ollama, les modèles ni le moteur.

**Cible** : une **interface d’accueil Drox** (webview ou workbench editor dédié) au premier lancement (et réouvrable depuis Aide), qui **accompagne intelligemment** le paramétrage minimal pour un premier run Chat réussi.

### Principes produit

| Principe | Détail |
|----------|--------|
| **Zéro Copilot** | Pas de login Microsoft ; ton et visuels Drox (logo, #1E1E1E / vert) |
| **Progressif** | Étapes courtes, skippables, reprise possible (`drox.onboarding.completed`) |
| **Actionnable** | Chaque étape écrit un réglage réel (`drox.*`, preset engine) — pas un tutoriel passif |
| **Branché moteur** | Détection via `drox.exe` / health Ollama ; benchmark P4 en étape optionnelle « optimiser » |

### Parcours proposé (v1)

| Étape | Contenu | Sortie |
|-------|---------|--------|
| O0 | Bienvenue + « qu’est-ce que Drox » (local, privé, Chat agent) | — |
| O1 | Vérif `drox.exe` + Ollama installé / démarré | lien install si KO |
| O2 | Choix **modèle architecte** (+ exécuteur si différent) | `drox.architect.model`, `drox.executor.model` |
| O3 | *(optionnel)* Benchmark rapide (P4.1–P4.2) → preset **Éco / Équilibré / Performance** | `drox.engine.strictness` + bundle reco |
| O4 | Permissions outils (bash, édition fichiers) — rappel sandbox | `drox.tools.*` sensibles |
| O5 | Mini tour : ouvrir Chat, première consigne, historique sessions | ouvre `DroxViews.ChatViewId` |
| O6 | Terminé — « rouvrir l’assistant » dans menu Aide | `drox.onboarding.completed = true` |

### Livrables

| Phase | Livrable | Priorité |
|-------|----------|----------|
| P5.0 | Spec UX + états (`not_started` / `in_progress` / `completed` / `skipped`) | P0 |
| P5.1 | Shell UI (webview `contrib/drox` ou editor onboarding) + routing étapes | P0 |
| P5.2 | O1–O2 : détection + binding settings (sans benchmark) | P0 |
| P5.3 | Intégration benchmark P4 en O3 (si profil absent) | P1 |
| P5.4 | O4–O6 + réouverture Aide · pas de re-show auto si `completed` | P1 |
| P5.5 | i18n FR/EN, télémétrie off (aucun envoi MS) | P1 |

### Critère d'acceptation

Install fraîche 1.4.1 → onboarding s’ouvre au premier lancement → utilisateur sans doc externe configure Ollama + modèle → premier message Chat obtient une réponse → onboarding marqué terminé et ne réapparaît pas au redémarrage (sauf « Relancer l’assistant de configuration »).

**Hors scope P5 v1** : walkthroughs extensions VS Code, import settings Cursor/VS Code, tutoriel orchestration avancée (→ doc / 1.4.x).

---

## Ordre recommandé

```text
P5.0–P5.2 onboarding shell + Ollama/modèle (UX produit — peut démarrer tôt)
  ∥ P1.0 ContextPack RPC
  → P1.1 heuristique IDE+LSP
  → P2.0 GraphContext format + injection
  → P1.2 index persistant
  → P4.0–P4.2 presets + benchmark
  → P5.3 benchmark dans onboarding (O3)
  → P3.0 fast path RPC
  → P4.3 apply preset + P5.4 fin parcours / Aide
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
