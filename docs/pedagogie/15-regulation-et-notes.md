# Auto-régulation — comment Drox note un run

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment Drox mesure** si un run s’est bien passé côté moteur, et **comment** ces notes peuvent (optionnellement) ajuster ce qu’on montre au modèle.

Pas de Rust moteur ici : le package vit dans l’**IDE** (`contrib/drox/.../regulation/`).  
Référence précise (formules, seuils) : [model-regulation.md](../engine/model-regulation.md).

### L’histoire en une phrase

À la fin d’un `agent.run`, Drox regarde des **signaux** (erreurs d’outils, gros contexte, boucles…) et attribue une note **0–100** à cinq axes. Ces notes alimentent l’observatoire ; si **Auto** est ON, elles peuvent aussi choisir le **module** du levier.

### Fichiers à laisser ouverts

| Fichier | Rôle |
|---------|------|
| [`droxRegulationScorer.ts`](../../src/vs/workbench/contrib/drox/common/regulation/droxRegulationScorer.ts) | Formules L1–L5 |
| [`droxRegulationRunSignals.ts`](../../src/vs/workbench/contrib/drox/common/regulation/droxRegulationRunSignals.ts) | Signaux extraits du run |
| [`droxRegulationAutoPolicy.ts`](../../src/vs/workbench/contrib/drox/common/regulation/droxRegulationAutoPolicy.ts) | Note → module (Auto) |
| [`droxRegulationProbeContribution.ts`](../../src/vs/workbench/contrib/drox/electron-browser/droxRegulationProbeContribution.ts) | `agent/done` → enregistrement |
| Réf. | [model-regulation.md](../engine/model-regulation.md) |

---

## Partie A — Notes ≠ Auto

Deux choses distinctes :

| | Notes / history | Auto |
|--|-----------------|------|
| **Quand** | Chaque run terminé (chat **et** Agents) | Seulement si le levier est en Auto ON |
| **Effet** | Scores, graphiques, suggestions | Change le **module** appliqué au prochain run |
| **Si OFF** | Les notes **continuent** | Le module reste figé (choix manuel) |

Si tu vois `0 runs` alors que tu as lancé des prompts Agents, c’est un bug de sonde (ou une vieille build) — pas un effet de Auto OFF.

### Où ouvrir l’observatoire

- IDE : activity bar **Regulation**.  
- Agents : icône **pulse** sur la toolbar d’historique de discussion (ou chip composer) — même vue, store sous la **racine** de la session.  
- Parité : [16-codebase-et-rag.md](16-codebase-et-rag.md) · [PLAN-AGENTS-PARITY.md](../1.5/1.5.22/PLAN-AGENTS-PARITY.md).

---

## Partie B — Les cinq leviers

On ne note pas « la qualité littéraire » de la réponse. On note le **stress moteur** sur cinq axes :

| Id | Question derrière la note |
|----|---------------------------|
| **L1** Context | Le contexte est-il trop lourd / le format tools se casse ? |
| **L2** Tools | Les appels d’outils sont-ils propres (pas de loop, peu d’erreurs) ? |
| **L3** Directive | Le modèle rumine-t-il trop de tours LLM ? |
| **L4** Protocol | Une tâche de mutation finit-elle mal (error / cancel / tools) ? |
| **L5** Retrieval | Sur du code, a-t-il cherché dans le repo ? |

Chaque levier a des **modules** discrets (ex. L1 `compact` / `standard` / `rich`). Les wrappers appliquent le module choisi — Auto ou manuel.

---

## Partie C — Comment on calcule une note

### Règle mentale

1. On part de **100** (run « parfait » sur cet axe).  
2. Chaque signal « mal » **retire** des points.  
3. On borne entre **0** et **100**.  
4. La **globale** = moyenne des cinq notes du run.  
5. Dans l’UI, pour un modèle donné, on **moyenne** les runs (`n=` = combien).

Sans aucun run : l’UI montre **50** et `0 runs` — c’est un **placeholder**, pas une vraie mesure.

### D’où viennent les preuves ? (avant les formules)

À `agent/done`, le code :

1. Lit le status / error du run → `issue` (`ok` / `error` / `cancel` / `loop`).  
2. Relit la session si possible : **trace** `run_summary` (itérations LLM, flags mutation/greeting, compteurs schéma / markers) + **uiStats.ctx** (tokens) + **messages** (erreurs tools, noms d’outils appelés).  
3. Assemble un objet `signals`, puis appelle `scoreRegulationL1` … `L5`.

Ce n’est **pas** un juge LLM sur la qualité du texte : ce sont des **compteurs** et des **flags**.

### Par levier — ce que le code regarde

#### L1 Context budget

- **Regarde** : taille du contexte (`uiStats.ctx`), erreurs de schéma / format tools (trace), cancel.  
- **Logique** : gros contexte + perte de format = le modèle « noie » → on baisse L1 (et plus tard Auto pourra passer en `compact` / `minimal`).

#### L2 Tool surface

- **Regarde** : mêmes compteurs schéma/markers, plus le nombre de `tool_result` en erreur dans le transcript, plus `issue === loop`.  
- **Logique** : mauvais usage / boucle d’outils = surface trop large ou mal digérée → baisse L2.

#### L3 Directive density

- **Regarde** : `llmIterations` (tours LLM) et `greetingOnly` (tâche triviale).  
- **Logique** : beaucoup de tours sur un greeting, ou trop d’itérations en général = rumination → baisse L3 (Auto pourra passer en `assertive`).

#### L4 Protocol strictness

- **Regarde** : le flag `expectsWorkspaceMutation` (la tâche devait muter le workspace).  
- **Si oui** : error / cancel / erreurs tools font baisser. Un `loop` pénalise aussi.  
- **Si non** (simple explication) : L4 reste souvent à 100 — on ne juge pas le « protocole mutation ».

#### L5 Retrieval posture

- **Regarde** : est-ce une tâche code (`mutation` et pas greeting) ? Le modèle a-t-il appelé `codebase_search` / `grep` / `glob` / `lsp` ?  
- **Logique** : code sans chercher dans le repo → baisse L5 (Auto pourra passer en `nudge` / `aggressive`).  
- Hors tâche code → L5 reste à 100.

### Couleurs

- **≥ 75** : vert (good)  
- **≥ 50** : orange (warn)  
- **&lt; 50** : rouge (bad)

### Exemple (intuition)

Un run qui lit le repo proprement, peu d’erreurs tools, contexte raisonnable → notes proches de 100.  
Un run qui boucle sur les tools (`issue: loop`) → L2 (et souvent L3/L4) chutent fort.  
Un run « explique le code » sans jamais `codebase_search` / grep → L5 peut baisser **si** le flag mutation est vrai.

Pénalités exactes et pipeline : [model-regulation.md §4–5](../engine/model-regulation.md#4-pipeline-danalyse-code).

---

## Partie D — De la note au module (Auto)

Quand Auto est **ON** sur un levier :

- note **haute** → on peut **ouvrir** l’offre (plus de contexte, plus de tools, moins de pression) ;  
- note **basse** → on **serre** (contexte compact, tools core, ton assertif, retrieval agressif…).

En Auto **OFF**, tu vois souvent `suggest …` : c’est la même policy, **sans** appliquer.

---

## Partie E — Où ça vit dans le produit

1. Fin de run → notification `agent/done`.  
2. La **sonde** construit les signaux, score, historise.  
3. Fichiers workspace : `.drox/regulation/history.json` + `surface.json`.  
4. Vue **Regulation** : observatoire (scores, trends, history) + overrides.

---

## Pour aller plus loin

- Référence formules & seuils Auto : [model-regulation.md](../engine/model-regulation.md)  
- Plan produit 1.5.22 : [PLAN-MODEL-AUTO-REGULATION.md](../1.5/1.5.22/PLAN-MODEL-AUTO-REGULATION.md)  
- Boucle agent (pourquoi il y a des tours) : [02-boucle-agent.md](02-boucle-agent.md)  
- Outils : [05-outils.md](05-outils.md)  
- Vulgarisation « gros modèle vs Drox » : [Cours/01-gros-modele-vs-drox/](Cours/01-gros-modele-vs-drox/)
