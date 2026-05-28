# Setup — sous-agents parallèles (profil Low)

**Date** : 2026-05-22  
**Statut** : recommandation produit + moteur M5c

## Recette VRAM (exemple validé par l’utilisateur)

| Rôle | Modèle | Rôle moteur |
|------|--------|-------------|
| Parent | `qwen3.5:9b` (ou équivalent ~9b) | Boucle agent Low, synthèse, `todo_write` |
| Sous-agent | `qwen3.5:2b` | `task` explore uniquement, `num_ctx` 8192 |

**Paramètres IDE**

- `nexus.drox.subagents.enabled` = **true**
- `nexus.drox.subagents.maxConcurrent` = **2**
- `nexus.drox.subagents.model` = **qwen3.5:2b**
- `nexus.drox.subagents.numCtx` = **8192** (défaut)
- `nexus.drox.modelTier` = **low**

## Comportement moteur (M5c + lot parallèle)

1. **Jusqu’à 2** appels `task` + `background: true` dans le **même tour** Low si scopes disjoints.
2. Jobs explore en file (`maxConcurrent`) ; le parent continue en **lecture seule**.
3. Rapports injectés au tour suivant (`drain_subagent_jobs`) — **pas** de trace outil dans le contexte parent.
4. Gate Low : **pas** de mutation tant qu’un explore async tourne.

## Playbook modèle (analyse repo)

1. `todo_write` (≤5 items) si besoin.
2. Deux `task` async exemple :
   - `scope: ["app-kdds-main/"]`, `objective_fragment: "Stack app Next.js"`
   - `scope: [".drox/"]`, `objective_fragment: "État Drox / sessions"`
3. Pendant l’attente : `workspace_map_read` ou `file_read` ciblé sur le parent.
4. `[phase: answering]` : synthèse des deux rapports, puis `[phase: done]`.

## « 3 agents actifs » (Drox) vs 2 lignes `ollama ps` — pas un bug

Le bandeau chat compte **agents logiques** :

| Composant | Compté UI | Modèle Ollama typique |
|-----------|-----------|------------------------|
| Run parent (`busy`) | +1 | `qwen3.5:9b` |
| Sous-agent explore #1 | +1 | `qwen3.5:2b` (souvent **le même tag**) |
| Sous-agent explore #2 | +1 | `qwen3.5:2b` (**même tag** → pas une 3ᵉ ligne) |
| **Total UI** | **3** | |
| **Total `ollama ps`** | — | **2** (9b + 2b) |

`OLLAMA_MAX_LOADED_MODELS=3` = jusqu’à **3 noms de modèles différents** en VRAM, pas 3 copies du même tag ni « 1 ligne par sous-agent ».

Pour 2 explores **en parallèle sur le même** `2b`, c’est **`OLLAMA_NUM_PARALLEL` ≥ 2** sur le runner **2b** (souvent réduit automatiquement si la VRAM restante est faible — ex. parent en `num_ctx` 131072).

## Ollama — un seul chargement pour le même tag (normal)

Drox peut lancer **2 jobs** `task` async (`maxConcurrent: 2`), mais **Ollama ne charge jamais deux copies des mêmes poids** pour un tag identique (ex. deux fois `qwen3.5:2b`). C’est documenté côté Ollama : pas de « double instance » du même modèle — une seule charge VRAM, plusieurs **slots de requête** si le serveur le permet.

| Ce que vous voyez | Ce que ça signifie |
|-------------------|-------------------|
| `ollama ps` → **1×** `qwen3.5:2b` avec 2 sous-agents | **Attendu** si les deux jobs utilisent le même `nexus.drox.subagents.model` |
| Un seul sous-agent « avance » vite, l’autre attend | Souvent `OLLAMA_NUM_PARALLEL=1` (défaut) : la 2ᵉ requête est **mise en file** |
| Parent `9b` + sous `2b` mais une seule ligne dans `ps` | Parent déchargé ou pas encore sollicité ; ou VRAM insuffisante pour `OLLAMA_MAX_LOADED_MODELS` > 1 |

### Parallélisme réel (2 inférences en même temps sur le **même** tag)

Configurer le **serveur** Ollama (pas Nexus) **avant** `ollama serve` / redémarrage du service :

```powershell
# PowerShell — session ou variables système utilisateur, puis redémarrer Ollama
$env:OLLAMA_NUM_PARALLEL = "2"
# Si parent (9b) et sous-agent (2b) doivent rester chargés en même temps :
$env:OLLAMA_MAX_LOADED_MODELS = "2"
```

| Variable | Rôle |
|----------|------|
| `OLLAMA_NUM_PARALLEL` | Nombre de requêtes **simultanées** sur **un** modèle déjà chargé (contextes KV séparés, poids partagés). Défaut **1**. |
| `OLLAMA_MAX_LOADED_MODELS` | Nombre de **tags différents** en VRAM en parallèle (ex. `qwen3.5:9b` + `qwen3.5:2b`). Défaut ~3× GPU. |
| `OLLAMA_MAX_QUEUE` | File d’attente si saturé (défaut 512). |

**VRAM** : la RAM/VRAM utile doit couvrir le modèle **plus** environ `OLLAMA_NUM_PARALLEL × num_ctx` (sous-agents : `nexus.drox.subagents.numCtx`, souvent 8192). Si Ollama n’a pas assez de marge, il **retombe à 1 slot** sans message clair dans l’IDE — vérifier les logs serveur et `nvidia-smi` / équivalent.

**Ce qui ne marche pas** : dupliquer le Modelfile en `qwen3.5:2b-a` / `qwen3.5:2b-b` pointant vers les mêmes poids — Ollama les traite toujours comme **un** chargement utile pour le parallèle GPU ; inutile sauf pour des **modèles réellement distincts** (autre taille, autre quantification).

### Recette alignée avec Drox (parent 9b + 2× explore 2b)

1. IDE : `maxConcurrent: 2`, `subagents.model: qwen3.5:2b`, `numCtx: 8192`.
2. Ollama : `OLLAMA_NUM_PARALLEL=2` + `OLLAMA_MAX_LOADED_MODELS=2` si le parent doit rester chaud pendant les explores.
3. Vérifier : deux requêtes `/api/chat` actives (logs Ollama) ou latences qui se chevauchent ; `ollama ps` peut toujours n’afficher **qu’une** ligne pour `2b`.

### Si la VRAM ne suffit pas

- Garder `maxConcurrent: 2` côté Drox (orchestration + UI) mais accepter l’exécution **séquentielle** côté Ollama — les rapports arrivent quand même, décalés.
- Ou `maxConcurrent: 1` pour éviter l’illusion « les deux tournent ».
- Ou sous-agents sur **deux petits modèles différents** (ex. `2b` + `4b`) **si** la VRAM permet deux tags (`OLLAMA_MAX_LOADED_MODELS=2`).

Références : [FAQ Ollama — concurrent requests](https://docs.ollama.com/faq), [ollama#358](https://github.com/ollama/ollama/issues/358), [ollama#9054](https://github.com/ollama/ollama/issues/9054).

## Anti-patterns

- Deux explores sur le même dossier.
- Enchaîner 10× `grep` au parent alors que `task` suffit.
- Coller les rapports bruts dans la réponse utilisateur.
- `file_edit` pendant qu’un job explore est `running` (bloqué en Low).
- Réécrire une « réflexion » après les rapports injectés au lieu de `[phase: answering]` + `[phase: done]`.

## Fichiers (parent vs sous-agent)

| Action | Outil | Qui |
|--------|-------|-----|
| Lire lignes N–M | `file_read` + `start_line` / `end_line` | parent **et** sous-agent explore |
| Modifier quelques lignes | `file_edit` (petit `old_string`) | **parent uniquement** |

## Liens

- [PLAN-M5c-SOUS-AGENTS-ASYNC](../plans/PLAN-M5c-SOUS-AGENTS-ASYNC.md)
- [PLAN-PROFIL-LOW-ACCOMPAGNEMENT](../plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md)
