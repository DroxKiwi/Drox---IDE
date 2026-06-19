# Idée 12 — Benchmark local & config recommandée par modèle

**Statut** : idée brute  
**Date** : 2026-06-06 (rev. 2)  
**Priorité** : haute produit — onboarding local + éviter les runs impossibles  
**Cible** : [1.4.4](../1.4/1.4.4/PLAN-1.4.4.md) § P4  
**Liens** : [08-performance](08-performance-traitement-rapide.md) · [10-parametrage](10-parametrage-prompts-strictesse.md) · `EngineTuning` (`orchestration/tuning/mod.rs`)

---

## Résumé

L’utilisateur **choisit son modèle** (architecte ou autre). Drox lance un **benchmark local** sur **son matériel** et produit :

1. un **profil de capacités** du modèle (contexte max, vision, cohérence court/long, fiabilité outils…) ;
2. une **config fortement conseillée** — paramètre par paramètre **ou** preset nommé — **pour ce modèle sur ce PC**.

**Le modèle n’est pas dans le preset.** Le preset / la reco = réglages moteur + IDE autour du modèle déjà choisi.

Analogie jeu vidéo : tu gardes ta carte graphique ; le benchmark dit « avec **cette** carte, voici les réglages conseillés » — pas « voici une autre carte ».

---

## Problème actuel

| Zone | Friction |
|------|----------|
| `num_ctx`, parallélisme, strictness | Réglages isolés — pas calibrés au modèle **ni** au hardware |
| Capacités modèle inconnues | Vision ? tool calling fiable ? tient-il un long run architecte ? |
| Runs bloqués / boucles | Mauvais couple modèle × config (ex. gros modèle + contexte trop large → lenteur ; petit modèle + plan complexe → échec outils) |
| Dogfooding | Modèle qui ne parvient ni à planifier ni à éditer souvent = **config** ou **moteur** inadapté — pas forcément le modèle « mauvais » tout seul |

---

## Vision produit

### Entrée utilisateur

```text
Modèle sélectionné (ex. gemma4:26b)     ← choix utilisateur, hors preset
Backend (Ollama local, etc.)
Bouton « Tester ce modèle sur mon PC »
```

### Sortie benchmark — deux artefacts

#### 1. `ModelCapabilityProfile` (ce que le modèle **sait faire**)

| Dimension | Exemple mesure | Usage Drox |
|-----------|----------------|------------|
| **Contexte max stable** | Palier `num_ctx` jusqu’OOM — ex. 16k OK, 32k OOM | Plafond `drox.numCtx` recommandé |
| **Taille / empreinte** | VRAM pic, RAM, params (depuis manifest Ollama) | Avertissement si limite hardware |
| **Vision / image** | Prompt multimodal test → succès / refus / hallucination | Activer ou masquer outils image |
| **Cohérence court run** | Salut + question simple — respect protocole, pas de plan parasite | Discuss viable ? |
| **Cohérence long run** | Mini-scénario edit 3 tours — plan, outils, clôture | Architect edit viable ? |
| **Fiabilité outils** | `todo_write` + `file_read` factices — JSON valide, pas de boucle | Ajuster `max_tools_per_turn`, strictness |
| **Débit / latence** | TTFT, tokens/s court et long contexte | Fast path oui/non, timeouts |
| **Parallélisme** | 1 vs N requêtes concurrentes même modèle | `maxParallelExecutors` conseillé |

Stockage : `.drox/models/<model-id>/profile.json` + `hardware-fingerprint`.

#### 2. `RecommendedConfig` (comment **configurer** Drox)

Deux formes d’affichage (même contenu) :

**A — Paramètre par paramètre** (détail) :

```text
num_ctx ............... 16384   (max stable mesuré)
subagents_num_ctx ..... 8192
max_parallel_executors  1
engine.strictness ..... normal
max_iterations ........ 12
context compaction .... agressive si ctx > 12k
index depth ........... standard (P1)
```

**B — Preset nommé** (raccourci = bundle de A) :

| Preset config | Quand (pour CE modèle) |
|---------------|------------------------|
| **Éco** | ctx bas, 0 parallèle, strictness relaxed, compaction forte |
| **Équilibré** | défaut recommandé benchmark |
| **Performance** | ctx haut si B3 OK, 2 exécuteurs si B4 OK |
| **Personnalisé** | utilisateur a touché un slider |

> **Important** : Éco / Équilibré / Performance = **bundles de paramètres moteur+IDE**, pas de sélection de modèle.

### UX cible

```text
« gemma4:26b sur votre RTX 4070 (12 Go VRAM) »

Capacités détectées :
  ✓ Long run edit (score 7/10)
  ✗ Vision
  ✓ Tool calling (score 8/10)
  · Contexte stable jusqu’à 16k

Config fortement conseillée : preset Équilibré
  [Voir le détail]  [Appliquer]  [Garder mes réglages]
```

Re-benchmark : changement de modèle, GPU, ou driver → « Retester ? »

---

## Scénarios benchmark (suite)

| ID | Scénario | Mesure |
|----|----------|--------|
| B0 | `hardware.detect` | GPU, VRAM, RAM, CPU |
| B1 | TTFT | Premier token, prompt ~512 tok |
| B2 | Débit | tokens/s, génération 128 tok |
| B3 | Contexte max | Paliers 4k → 8k → 16k → 32k… |
| B4 | Parallélisme | Concurrence 1 / 2 / 4 (B2) |
| B5 | **Court run** | Prompt type « Salut » + question simple — qualité réponse, pas de plan |
| B6 | **Long run mini** | Prompt edit réel réduit — `todo_write` + 1 lecture — succès outils |
| B7 | **Tool calling** | Appels outils imposés — JSON valide, pas de texte parasite |
| B8 | **Vision** (si modèle multimodal) | Image test → capacité détectée |
| B9 | (Post-P3) Fast path TTFT | Même modèle ou `completionModel` dédié |

Durée cible MVP : **2–4 min** par modèle.

---

## Architecture technique (ébauche)

### RPC

| Méthode | Rôle |
|---------|------|
| `hardware.detect` | Fingerprint matériel |
| `benchmark.run` | `{ model, scenarios? }` → stream `benchmark.progress` |
| `benchmark.lastResult` | Profil + reco pour dernier run |
| `recommendedConfig.apply` | Applique reco (preset ou champs individuels) |

### Ce que le preset **inclut**

```text
drox.numCtx / drox.subagentsNumCtx
drox.orchestrationMaxParallelExecutors
drox.maxIterations
drox.engine.strictness (+ EngineTuning dérivé)
drox.index.enabled / depth        (P1)
drox.completion.enabled           (P3 — modèle déjà choisi ailleurs)
timeouts / compaction flags
```

### Ce que le preset **n’inclut PAS**

```text
drox.architectModel              ← choix utilisateur
drox.completionModel             ← choix utilisateur (peut = même modèle)
suggestion « utilisez un modèle plus petit »  ← message séparé, pas preset
```

---

## Relation avec l’existant

| Existant | Rôle |
|----------|------|
| `StrictnessPreset` | **Un** levier dans `RecommendedConfig` |
| `EngineTuning` | Résolu depuis preset config + overrides |
| Idée 10 | Détail des variables ; idée 12 = **calibration auto** par modèle×hardware |
| 1.4.1 P3 fast path | Benchmark B9 + flag `completion.enabled` dans la reco |

---

## Livrables

| Phase | Livrable |
|-------|----------|
| 12.0 | Spec `ModelCapabilityProfile` + `RecommendedConfig` |
| 12.1 | B0–B3 + profil ctx / débit |
| 12.2 | B5–B7 cohérence + outils |
| 12.3 | UI reco paramètre par paramètre + preset bundle + Apply |
| 12.4 | B8 vision, B4 parallèle, B9 fast path |
| 12.5 | Cache profils `.drox/models/` — réutiliser si même modèle + même fingerprint |

---

## Critères d’acceptation (MVP)

- Utilisateur choisit un modèle → benchmark → reco affichée **sans changer le modèle**.
- Apply met à jour les settings ; run suivant **sans OOM** et sans boucle outils évitable (seuils adaptés).
- Profil réutilisé si modèle + hardware inchangés.

---

## Questions ouvertes

| # | Question |
|---|----------|
| Q1 | Score long run : scénario synthétique ou vrai mini `agent.run` ? |
| Q2 | Benchmark moteur vs IDE direct Ollama ? |
| Q3 | Afficher un **avertissement modèle** (« ce modèle score faible en tools — préférez X ») sans l’imposer ? |

---

## Liens

- [Plan 1.4.4 § P4](../1.4/1.4.4/PLAN-1.4.4.md)
- [Hub brainstorm](README.md)
