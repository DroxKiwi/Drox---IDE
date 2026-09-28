# Smoke 6b — M5c audit async (`task` + `background: true`)

**Référence** : [PLAN-PROFIL-LOW §5.2](../plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md) scénario **6b** · détail [PLAN-M5c §5.2](../plans/PLAN-M5c-SOUS-AGENTS-ASYNC.md)

**Durée** : ~15–25 min (selon durée de l’explore)

---

## Prérequis

| # | Vérification |
|---|----------------|
| 1 | `cargo build -p drox-cli --release` OK (moteur M5c) |
| 2 | `npm run compile` ou `npm run watch` actif (webview Drox) |
| 3 | Ollama démarré, modèles parent + sous-agent configurés |
| 4 | Workspace ouvert : **ce repo** (assez de fichiers pour un « audit » crédible) |
| 5 | Settings workspace (ou user) — voir § Réglages |

### Réglages recommandés

```json
{
  "nexus.drox.modelTier": "low",
  "nexus.drox.subagents.enabled": true,
  "nexus.drox.subagents.maxConcurrent": 1,
  "nexus.drox.subagents.model": "<modèle explore, ex. qwen3.5:4b>",
  "nexus.drox.subagents.numCtx": 8192,
  "nexus.drox.permissionMode": "acceptEdits"
}
```

Profil **Low** obligatoire pour valider le **gate mutation** (C12). Medium optionnel en fin de session (non bloquant pour 6b).

---

## Prompt suggéré (copier-coller)

Utiliser un objectif qui **force** un gros `task` async (le modèle peut ajuster la formulation) :

```text
Avant toute modification de fichier :
1) Lance un sous-agent Explore en ARRIÈRE-PLAN (task avec background: true) pour auditer la structure du dossier src/vs/workbench/contrib/drox (fichiers, rôles, dépendances principales). Donne un job_id si tu en reçois un.
2) Pendant que l'explore tourne : lis au moins 2 fichiers du même dossier avec file_read et résume brièvement ce que tu as lu (sans modifier de fichier).
3) Ensuite tente UNE modification minimale (ex. commentaire ou .drox/scratch/smoke-6b.txt) pendant que l'explore est encore en cours — je veux voir si le moteur bloque en Low.
4) Quand le rapport explore est injecté, confirme que tu peux enfin modifier si besoin.
Ne lance pas un second task async tant que le premier n'est pas terminé.
```

Variante plus courte si le modèle enchaîne trop vite :

```text
task(background:true) : audit src/vs/workbench/contrib/drox. Pendant le job : file_read x2, puis tente file_write .drox/scratch/smoke-6b.txt. Low profile.
```

---

## Checklist d’observation

Cocher pendant le run. **Échec** = une ligne critique ❌.

| # | Observer | OK | Notes |
|---|----------|----|-------|
| A | Carte **`task`** avec badge **Async** (pas Sync) | ☐ | |
| B | Carte sous-agent avec **`job_id`**, état **En cours** | ☐ | |
| C | Parent continue : **`file_read`** (ou grep) **réussit** pendant running | ☐ | |
| D | Footer **`#ctx`** : pas de saut massif **avant** injection du report explore | ☐ | Noter valeur avant/pendant/après |
| E | **`file_edit` / `file_write`** pendant job running → **bloqué** (Low) avec message explicite | ☐ | Copier le message d’erreur |
| F | Pas de 2ᵉ `task` async accepté si `maxConcurrent: 1` et job déjà running | ☐ | |
| G | À **subagent done** : report structuré dans le fil ; carte **terminée** | ☐ | |
| H | Après injection report : **`#ctx`** augmente (taille report ingéré) | ☐ | |
| I | Après done : mutation autorisée (si tu redemandes une écriture) | ☐ | |
| J | Re-perspective / nudge mentionne jobs en cours (optionnel) | ☐ | |

### Comparaison rapide avec scénario **6** (M5a sync)

| | **6** M5a | **6b** M5c |
|---|-----------|------------|
| `background` | `false` | `true` |
| Parent pendant explore | **Bloqué** (attend report) | **Actif** (reads OK) |
| Badge UI | **Sync** | **Async** |
| Gate mutation Low pendant job | N/A (pas de job async) | **Dur** |

---

## Critères d’échec

- Pas de badge Async sur un `task` censé être async
- Parent totalement idle pendant `background: true` (régression sync)
- `file_edit` accepté pendant job running en **Low**
- `#ctx` reflète le contexte interne explore (bond sans report injecté)
- Crash RPC / moteur / webview
- JSON brut outil dans le fil principal

---

## Compte-rendu (à coller en fin de session)

```text
Date :
Machine / VRAM :
modelTier :
Parent model :
Subagent model :
maxConcurrent :

A Async badge : OK / KO
B job_id running : OK / KO
C reads pendant running : OK / KO
D #ctx stable avant report : OK / KO  (valeurs: avant=  pendant=  après=)
E gate mutation Low : OK / KO  (message: )
F pas 2e async : OK / KO / N/A
G report + done : OK / KO
H #ctx après report : OK / KO
I mutation après done : OK / KO

Verdict 6b : PASS / FAIL
Remarques :
```

Après **PASS** : cocher dans [PLAN-PROFIL-LOW](../plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md) §5.2 ligne 6b et journal §6.
