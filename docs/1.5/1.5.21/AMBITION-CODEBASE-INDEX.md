# Ambition `@Codebase` — but produit + supervision IDE

**Statut** : **réflexion produit** · **avant tout code d’index / embed**  
**Version** : 1.5.21  
**Parent** : [README 1.5.21](README.md)  
**Tech** : [ARCHITECTURE-CODEBASE-INDEX.md](ARCHITECTURE-CODEBASE-INDEX.md) (pipeline — à aligner après décisions ici)

---

## 1. But primaire — à quoi sert `@Codebase`

### En une phrase

> **Donner au LLM les bons morceaux de code du projet, au bon moment, sans lui coller tout le dépôt dans le contexte.**

### Comment ça fonctionne (modèle mental)

Le modèle de chat (Ollama, API, etc.) **n’a aucune mémoire du disque**. `@Codebase` est un **annuaire sémantique local** du workspace :

```text
1. Indexation (fond)     fichiers → chunks → vecteurs → BDD locale
2. Question / run agent  « où est le checkout de branche ? »
3. Retrieval             similarité + lexical → top-k chunks
4. Injection             seuls ces extraits entrent dans le prompt / tools
```

| Étape | Rôle |
|-------|------|
| **Chunk** | Découper le code en unités indexables (fichier / symbole / fenêtre) |
| **Embed** | Transformer chaque chunk en vecteur (modèle **petit**, shippé) |
| **Store** | Garder texte + vecteurs **par projet** sur disque |
| **Retrieve** | À la requête : trouver les chunks proches + grep / chemin |
| **Inject** | Nourrir l’agent avec un **budget** borné (pas 50k lignes) |

Ce n’est **pas** un fine-tune, **pas** un second « cerveau coder », **pas** un upload cloud.  
C’est le même rôle que Cursor `@Codebase` : **retrieval**, pour que l’agent soit efficace sur *ce* dépôt.

### Pourquoi c’est le but #1 de la maj

Sans ça, Explore / edits / plans restent **aveugles ou bruyants**.  
Avec ça (et une UI qui prouve que ça marche), tout le reste de l’agent Drox gagne en pertinence.

### Critère de succès produit

> Sur un workspace donné, Drox maintient un index local sain ; l’utilisateur **voit en direct** qu’il tourne, **sonde** les hits, **lit** les alertes / rapports ; l’embed minimaliste tourne surtout en **RAM** ; l’agent pourra ensuite s’en servir sans magie opaque.

Le branchement agent / tests coding reste **après** ambition + supervision + runtime — §7.

---

## 2. Instances = un index par projet

Chaque **workspace / dossier ouvert** = une **instance** d’index indépendante.

```text
Projet A  →  index A  (chunks + vecteurs + manifest)
Projet B  →  index B
```

L’UI doit lister les instances, ouvrir celle du projet courant, et refuser le mélange silencieux si le modèle embed / schéma change (rebuild proposé).

Emplacement (direction) : `{workspace}/.drox/codebase-index/`.

---

## 3. Supervision — fenêtre complète, double accès

**Décision produit** : pas d’index silencieux. La supervision est un **produit à part entière**, la plus complète possible.

### 3.1 Où elle vit (deux entrées, une même vue)

| Emplacement | Analogie Drox / VS Code | Intention |
|-------------|-------------------------|-----------|
| **Barre d’activité gauche** | Comme **Changes** (outil workbench) | Suivi projet / santé index hors conversation |
| **Zone agent (panneau bas / latéral agent)** | Comme **Terminal** ou **Web visuel** | Suivre l’index **pendant** qu’on dialogue / qu’un run tourne |

Même contenu / même service derrière : on n’écrit pas deux UIs divergentes — **une vue**, deux host containers (activity bar + agent tools area).

### 3.2 Contenu cible — « cockpit » Codebase

Objectif : **temps réel**, **diagnostic**, **anticipation** — pas seulement un voyant vert.

| Bloc | Contenu |
|------|---------|
| **Santé live** | État instance (OK / sync / erreur) · heartbeat embed · âge du dernier commit index |
| **Pipeline live** | File d’indexation : fichier courant, queue depth, débit chunks/s, pause / reprise |
| **Stockage** | Taille disque, nb fichiers / chunks / vecteurs, chemin, vacuum / GC |
| **Catalogue des connaissances** | Voir §3.5 — parcourir / administrer **tout** ce qui est indexé |
| **Moteur embed** | Modèle, chargé ?, RSS / RAM budget, threads, latence probe |
| **Sonde retrieval** | Champ requête → top-k hits (path, score, preview) · lexical vs hybride |
| **Journal / rapports** | Erreurs, warnings, skips (binaires, trop gros, secrets) — **rapports de bugs** exportables |
| **Anticipation** | Alertes : dérive (fichiers stale), approche cap disque, RAM proche plafond, modèle incompatible, index corrompu, latence embed qui dérive |
| **Ressources** | Paramètres RAM / threads / batch / priorité (voir §6) |
| **Actions** | Reindex, Pause, Purge, Ouvrir dossier, Exporter rapport diag, Relancer probe |

### 3.3 Sondes minimales (preuve que ça marche)

1. **Probe embed** — phrase → vecteur + latence + RAM  
2. **Probe store** — ouverture BDD + compteurs + schéma  
3. **Probe retrieval** — requête libre → hits  
4. **Probe instance** — hits bien de *ce* projet  
5. **Probe drift** — fichiers modifiés encore stale ?

### 3.4 Ce que l’utilisateur doit pouvoir répondre en 10 secondes

- Index de **ce** projet OK ?  
- Embed en RAM, modèle X, latence Y ?  
- Recherche test → bons fichiers ?  
- Y a-t-il des alertes / un rapport à exporter ?

### 3.5 Administration des connaissances indexées *(cockpit — phase plus tardive OK)*

**Décision produit** : le panneau ne se limite pas au monitoring. L’utilisateur doit pouvoir **voir et administrer l’ensemble** de ce qui est stocké dans la BDD vectorielle / chunk store de l’instance.

| Capacité | Détail |
|----------|--------|
| **Parcourir** | Liste / arborescence des unités indexées (fichiers → chunks) : path, lignes, symbole, taille, date d’index |
| **Inspecter** | Preview du texte chunk + métadonnées (hash, dim vecteur, score de fraîcheur) |
| **Espace** | Coût disque **par fichier / par chunk / total** (et % du soft cap) — pas seulement un total opaque |
| **Suppression** | Retirer un fichier, une sélection, ou un chunk ; sync vecteurs + métadonnées (pas d’orphelins) |
| **Compactage** | Vacuum / compactage **supplémentaire** à la demande (au-delà du GC auto) + feedback « avant / après » taille |
| **Exclusions** | Marquer path / glob comme « ne plus réindexer » (liste locale instance) |
| **Rebuild ciblé** | Reindex d’un sous-ensemble (dossier, fichiers sélectionnés) sans tout purger |

**Priorité livrable** : vision cockpit dès CB0b ; implémentation catalogue / delete / compact **après** santé live + sondes (typiquement **CB3+**), pas bloquant pour CB1–CB2.

---

## 4. Modèle d’embed — minimaliste, privilégie la RAM

### Décisions figées

| Décision | Choix |
|----------|--------|
| Embarqué dans le ship Drox | ✅ |
| Profil | **Minimaliste** (famille small : MiniLM / BGE-small — lock après micro-bench) |
| Device privilégié | **RAM / CPU** (pas GPU-first) |
| GPU | Option avancée plus tard si le runtime le permet sans complexifier le ship v1 |

### Ordres de grandeur candidats

| Candidat | Taille typ. | Notes |
|----------|-------------|--------|
| **all-MiniLM-L6-v2** GGUF | ~20–45 Mo | Défaut probable « partout » |
| **BGE-small** | ~40 Mo ordre | Souvent meilleur retrieval |
| Nomic / Jina-code | 150–260+ Mo | Profil qualité optionnel, pas le défaut |

Changement de modèle → **rebuild** index (dimensions).

---

## 5. Runtime — recommandation (intégré au ship)

Pour **petit modèle + RAM minimale + binaire embarqué**, direction recommandée :

### Direction : **llama.cpp (mode embedding) + GGUF**

| Critère | llama.cpp + GGUF | ONNX Runtime |
|---------|------------------|--------------|
| **RAM au runtime** | Très bas (mmap du fichier ; bench public ~**~130 Mo RSS** vs **~700–1200 Mo** pour plusieurs stacks ONNX sur petit embed) | Plus gourmand en buffers / EP |
| **Ship dans Drox** | Une lib C++ déjà dans l’écosystème local-LLM ; modèle = 1 fichier GGUF | Runtime + EP + modèle ONNX (souvent plus gros) |
| **Alignement produit** | RAM-first ✅ | Plutôt throughput / portabilité hardware |
| **GPU** | Possible plus tard (offload) ; **pas requis** pour v1 | Nombreux EP, complexité ship |
| **Contre** | Parfois plus de cycles CPU / token que ONNX quantizé sur certains benches | Meilleur débit batch sur certaines plateformes au prix RAM |

**Verdict Drox v1** : **llama.cpp embarqué** pour l’embed, modèle MiniLM (ou équiv.) en GGUF, **CPU + RAM plafonnée**, lazy-load.  
ONNX = plan B seulement si un bench interne Windows Drox contredit (qualité ou perf inacceptable).

### Comportements runtime

- Process / thread **isolé** du workbench (pas de freeze UI).  
- **Lazy** : pas de modèle en RAM tant qu’indexation / sonde / retrieval ne le demande.  
- Budget RAM **hard** depuis l’UI supervision ; dépassement → pause + alerte cockpit.  
- Un modèle actif ; swap → rebuild.

---

## 6. Ressources — UI de supervision

| Paramètre | Défaut v1 | Notes |
|-----------|-----------|--------|
| Device | **CPU / RAM** | GPU = avancé / plus tard |
| Budget RAM | Conservateur (ex. 256–512 Mo plafond process embed — à calibrer) | Slider dans le cockpit |
| Threads CPU | Bas (ex. 2) | Ne pas concurrencer le LLM agent |
| Batch | Petit | Pics mémoire maîtrisés |
| Priorité | Idle / background | |
| Cap disque index | Soft limit + GC | Alerte anticipation |

---

## 7. Reporté (prochaine discussion)

1. Contrat agent — tool vs auto-inject, budget tokens, Explore  
2. Détail chunking / SQLite+vec / hybrid (archi)  
3. Tests auto / golden queries  
4. Carte code  

---

## 8. Checklist décisions

| # | Question | État |
|---|----------|------|
| A | But = retrieval local pour nourrir l’agent | ✅ |
| B | Cockpit supervision **complet** + live + alertes + rapports | ✅ |
| B2 | Double accès : **activity bar** (comme Changes) + **zone agent** (comme Terminal / Web) | ✅ |
| B3 | Admin connaissances : parcourir / supprimer / compacter / espace détaillé | ✅ vision · 🔲 impl. CB3+ |
| C | Embed shippé, minimaliste, **RAM-first** | ✅ |
| D | Modèle exact (MiniLM vs BGE-small) | 🔲 micro-bench |
| E | Runtime **llama.cpp + GGUF** (direction) | ✅ proposé |
| F | GPU backends | ⛔ hors v1 sauf option tardive |
| G | Emplacement index workspace | ✅ proposé `.drox/codebase-index/` |
| H | Branchement coder | ⛔ plus tard |

---

## 9. Phases

| Phase | Livrable |
|-------|----------|
| **CB0a** | Ce doc (ambition + UI + runtime) |
| **CB0b** | Spec détaillée vue cockpit (les 2 hosts) |
| **CB1** | Store + chunker lexical + **cockpit live** (sans embed si besoin) |
| **CB2** | llama.cpp embed + MiniLM/BGE + probes |
| **CB3** | Budgets RAM / alertes anticipation / multi-instance |
| **CB3b** | **Catalogue admin** : parcourir index, delete, compactage, espace par entrée |
| **CB4+** | Tool agent / `@Codebase` / carte |

L’[ARCHITECTURE](ARCHITECTURE-CODEBASE-INDEX.md) doit abandonner Ollama-first au profit de **llama.cpp embarqué** dès validation E.
