# Ambition `@Codebase` — but produit + supervision IDE

**Statut** : **réflexion produit** · **avant tout code d’index / embed**  
**Version** : 1.5.21  
**Parent** : [README 1.5.21](README.md)  
**Tech** : [ARCHITECTURE-CODEBASE-INDEX.md](ARCHITECTURE-CODEBASE-INDEX.md) (pipeline — à aligner après décisions ici)

---

## 1. Qu’est-ce qu’on veut ? (but)

### Le problème

Un agent (local ou API) **ne « voit » pas le dépôt**. Sans mécanisme dédié :

- soit on bourre le contexte → lent, cher, bruité ;
- soit on sous-informe → hallucinations, mauvaises edits, Explore aveugle.

Cursor résout ça avec `@Codebase` : **index local → embeddings → recherche → injection ciblée**. Ce n’est **pas** un fine-tune du modèle sur le projet.

### L’ambition Drox

Donner à Drox la même **capacité de compréhension du code du workspace ouvert**, en restant **local-first** et **observable** :

| Intention | Traduction concrète |
|-----------|---------------------|
| L’agent **comprend** le projet | Retrieval de chunks pertinents (sémantique + lexical) avant / pendant un run |
| L’utilisateur **contrôle** | Pas de boîte noire : statut, per-projet, sondes, ressources |
| **Minimal & embarqué** | Un modèle d’embed **shippé avec l’app** (pas « va installer Ollama pour indexer ») |
| **Borné** | Index par instance de projet, taille plafonnée, ignore secrets / `node_modules` |
| **Vérifiable** | UI de gestion / supervision **dès le design** — pas un afterthought post-MVP |

### Ce que ce n’est pas (pour cette maj)

- Un second LLM « coder » entraîné sur le repo  
- Un service cloud Drox d’indexation (sauf opt-in utilisateur plus tard)  
- Remplacer grep / ouverture de fichiers (complément)  
- La carte visuelle du code (liée, mais **après** un index fiable et supervisable)

### Critère de succès produit (formulation)

> Sur un workspace donné, Drox maintient un index local sain ; l’utilisateur peut **voir** qu’il tourne, **sonder** qu’il récupère les bons fichiers, et **paramétrer** le moteur d’embed (modèle + CPU/GPU/RAM) ; l’agent pourra ensuite s’en servir sans magie opaque.

Le branchement agent / tests de coding (**comment** `@Codebase` nourrit le coder) est **volontairement reporté** après ambition + supervision + choix embed — voir §6.

---

## 2. Instances = un index par projet

Chaque **workspace / dossier ouvert** = une **instance** d’index indépendante.

```text
Projet A  →  index A  (chunks + vecteurs + manifest)
Projet B  →  index B
```

L’UI de supervision doit permettre de :

- lister les instances connues (chemin, taille, dernière synchro, modèle embed utilisé) ;
- ouvrir le détail de **l’instance du projet courant** en un clic ;
- détecter un index **incompatible** (changement de modèle embed / schéma) → rebuild proposé, pas mélange silencieux.

Emplacement (rappel direction) : `{workspace}/.drox/codebase-index/` (détail dans l’archi).

---

## 3. Supervision IDE — exigible dès le début

**Décision produit** : on ne livre pas un index « silencieux » sans surface de contrôle.  
Les outils de vérif / paramétrage font partie du **MVP d’ambition**, pas d’un polish 1.5.x+2.

### 3.1 Surface proposée — « Drox : Codebase »

Commande palette + entrée Settings / panneau dédié (détail UX à figer) :

| Zone | Rôle |
|------|------|
| **Santé instance** | Vert / ambre / rouge : index ouvert ? à jour ? dernière erreur ? |
| **Stockage** | Taille disque, nb fichiers indexés, nb chunks, chemin du dossier |
| **Moteur embed** | Modèle chargé ? device (CPU / GPU) ? latence d’un probe ? |
| **File d’indexation** | Idle / indexing / paused · progress · fichiers en attente |
| **Actions** | Reindex, Pause, Purge index, Ouvrir dossier index, Exporter rapport diag |
| **Sondes** | Requête test + top-k hits (path, score, preview) — **preuve** que ça marche |
| **Ressources** | Budgets CPU / GPU / RAM (voir §5) |

### 3.2 Sondes minimales (checklist « ça tourne »)

Sans attendre le branchement agent :

1. **Probe embed** — encoder une phrase courte → vecteur non nul + latence ms + device utilisé.  
2. **Probe store** — ouvrir la BDD, `COUNT(*)` chunks / vecteurs, cohérence schéma.  
3. **Probe retrieval** — requête utilisateur (champ libre) → liste de hits ; bascule lexical seul / hybride.  
4. **Probe per-projet** — confirmer que les hits viennent bien de **cette** instance (pas d’un autre workspace).  
5. **Probe drift** — fichier modifié récemment encore « stale » ? (hash vs index).

Ces sondes sont aussi la **base des tests manuels / smoke** avant d’attaquer le coding agent.

### 3.3 Ce que l’utilisateur doit pouvoir répondre en 10 secondes

- « Mon index de **ce** projet est-il OK ? »  
- « L’embed tourne-t-il, sur quoi (CPU/GPU), avec quel modèle ? »  
- « Si je cherche X, est-ce que je retrouve les bons fichiers ? »  
- « Combien de ressources je laisse à l’indexeur ? »

---

## 4. Modèle d’embed — embarqué, consommation minimale

### 4.1 Contrainte produit (nouvelle vs archi ancienne)

| Ancienne direction (archi) | Direction ambition |
|----------------------------|--------------------|
| Embed via **Ollama** optionnel | Modèle d’embed **transporté dans l’app** (défaut) |
| User doit pull un modèle | First-run / install : poids déjà là (ou téléchargement contrôlé 1× packagé) |
| Settings provider générique | Runtime **Drox-owned** (ONNX Runtime / llama.cpp embed / équivalent) + override avancé plus tard |

Ollama / API compatible restent éventuellement un **mode avancé**, pas le chemin nominal « ça marche out of the box ».

### 4.2 Critères de choix du modèle défaut

1. **Taille shippable** — viser idéalement **&lt; ~100 Mo** quantizé (hard ceiling à trancher, ex. 150 Mo).  
2. **RAM / CPU frugal** — indexation background acceptable sur machine 8 Go.  
3. **Qualité code** — assez bon sur requêtes « où est le checkout git », pas seulement similarité prose.  
4. **Licence** OK redistribution dans un binaire OSS / produit.  
5. **Dimension stable** documentée dans `manifest.json` (changement = rebuild).

### 4.3 Candidats (discussion — pas encore décidé)

| Candidat | Ordre de grandeur | Notes |
|----------|-------------------|--------|
| **all-MiniLM-L6-v2** (GGUF Q4–Q8 / ONNX) | ~20–45 Mo (GGUF) · ~80 Mo ONNX typ. | Très léger ; généraliste, **pas** code-spécialisé ; bon défaut « partout » |
| **BGE-small** / équiv. | ~40 Mo ONNX ordre | Souvent meilleur retrieval général que MiniLM |
| **Nomic embed text** v1/v1.5 (GGUF) | ~150 Mo Q8 · ~260+ Mo F16 | Meilleure qualité RAG / long contexte ; plus lourd à shipper par défaut |
| **Jina base-code** / modèles « code » | ~260 Mo ordre | Meilleur biais code ; vérifier taille + licence avant ship |

**Proposition de travail (à valider)** :

- **Défaut shippé** : un **small** (famille MiniLM / BGE-small) pour garantir « ça tourne partout ».  
- **Profil « qualité »** (option) : modèle plus gros téléchargeable ou second pack — jamais forcé au first launch.  
- Benchmark interne minimal avant lock : 20–50 requêtes sur le repo Drox IDE + 1–2 repos utilisateurs types ; comparer hit@10 lexical-only vs embed.

### 4.4 Runtime

- Process / thread **isolé** de l’UI (pas geler le workbench).  
- Chargement **lazy** : pas d’embed en RAM tant que l’indexation / une sonde n’est pas demandée (ou setting « précharger »).  
- Un seul modèle actif par instance à la fois ; swap modèle → rebuild.

---

## 5. Ressources — paramétrables dans l’UI de supervision

L’utilisateur décide ce qu’il **met à disposition** de l’indexeur / embedder.

| Paramètre | Intention | Exemple UI |
|-----------|-----------|------------|
| **Device** | CPU only · GPU (si dispo) · Auto | Liste détectée (CUDA / Vulkan / Metal / DirectML — selon runtime retenu) |
| **Budget RAM** | Plafond process embed + buffers | Slider Mo / Go |
| **Threads CPU** | Parallelisme encode | 1 … N (défaut conservateur) |
| **GPU layers / offload** | Si backend type llama.cpp | 0 = CPU · max = full GPU |
| **Batch size** | Débit vs pics mémoire à l’indexation | Petit / Moyen / Grand |
| **Priorité** | Background vs agressif | Idle / Normal |
| **Cap disque index** | Soft limit + GC | Mo / workspace |

**Comportements** :

- Défauts **conservateurs** (CPU, peu de threads, pas de spike) pour ne pas concurrencer le LLM agent.  
- Afficher en live : RAM utilisée (approx), device réel, files en attente.  
- Si dépassement budget → pause indexation + message clair dans la supervision (pas crash silencieux).

---

## 6. Reporté volontairement (prochaine discussion)

Après verrouillage ambition + supervision + modèle / ressources :

1. **Contrat agent** — tool `codebase_search` vs auto-inject ; budget tokens ; lien Explore.  
2. **Pipeline détaillé** — chunking, store SQLite+vec, hybrid RRF (déjà ébauché dans l’archi).  
3. **Tests automatisés** — fixtures repos, golden queries, CI sans GPU.  
4. **Carte code** — consommation des hits (secondaire).

Ne pas coder CB1+ tant que §1–§5 ont une direction acceptée.

---

## 7. Décisions à trancher (checklist)

| # | Question | État |
|---|----------|------|
| A | Ambition = retrieval local observable + embarqué (ce doc) | ✅ proposé |
| B | UI supervision **MVP** (sondes + santé + ressources) | ✅ exigée dès le début |
| C | Embed **shippé dans l’app** (pas Ollama-first) | ✅ direction ; modèle exact TBD |
| D | Quel modèle défaut (MiniLM vs BGE-small vs autre) | 🔲 à trancher + micro-bench |
| E | Runtime (ONNX vs llama.cpp embed vs autre) | 🔲 lié à D |
| F | GPU : quels backends ship Windows / Linux / macOS v1 | 🔲 |
| G | Emplacement index workspace vs profil app | 🔲 (archi propose workspace) |
| H | Branchement coder / tests agent | ⛔ plus tard |

---

## 8. Lien phases (réordonnancement proposé)

| Phase | Livrable |
|-------|----------|
| **CB0a** | Ce doc ambition + décisions D–G |
| **CB0b** | Maquette / spec UI « Drox : Codebase » (sondes + ressources) |
| **CB1** | Store + chunker lexical + **UI statut / sondes** (même sans embed) |
| **CB2** | Runtime embed embarqué + probe embed + hybrid |
| **CB3** | Ressources paramétrables branchées + rebuild / multi-instance |
| **CB4+** | Tool agent / `@Codebase` / carte (discussion séparée) |

L’architecture technique existante reste la référence pipeline ; **elle doit être mise à jour** dès que C–E sont figés (Ollama-first → runtime shippé).
