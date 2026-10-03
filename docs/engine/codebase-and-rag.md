# Codebase & RAG — index local, inject, Agents

Sous-système IDE (`contrib/drox/.../codebase/`) : index **local** par dossier workspace, retrieval hybride / lexical, inject contexte avant `agent.run`, cockpit admin.

Plans de livraison : [`docs/1.5/1.5.21/codebase/`](../1.5/1.5.21/codebase/) · parité Agents [`PLAN-AGENTS-PARITY.md`](../1.5/1.5.22/PLAN-AGENTS-PARITY.md)  
Archi produit : [`ARCHITECTURE.md`](../1.5/1.5.21/codebase/ARCHITECTURE.md)

---

## 1. Principe

| Ce n’est pas | C’est |
|--------------|--------|
| Un second moteur / LLM | Un **index de fichiers** + recherche + budget d’inject |
| Index cloud par défaut | Store sous `{root}/.drox/codebase-index/` |
| Une indexation de toute la liste Agents | **Lazy** sur le **dossier de la discussion active** |

Une **discussion** (IDE workspace ou session Agents) = un **chemin racine**.  
Codebase, inject et cockpit sont toujours relatifs à **cette** racine.

---

## 2. Cycle de vie index

```text
Focus discussion / open folder
        │
        ▼
  setActiveRoot(uri)     ← Agents : droxSessionsActiveSessionSync
        │
        ▼
  DroxCodebaseAutoIndex.schedule('active-root' | 'startup' | …)
        │
        ▼
  ensureIndexed(root)    ← hash-skip si inchangé
        │
        ▼
  {root}/.drox/codebase-index/
```

### Ordonnancement (figé)

| Règle | Comportement |
|--------|----------------|
| **Quand** | **Ouverture** d’un dossier / focus discussion sans index → `ensureIndexed` auto ; ensuite watcher (debounce) pour les changements |
| **Quoi** | Uniquement le root demandé — **pas** tous les dossiers de l’historique Agents |
| **Concurrence** | **1** `ensureIndexed` à la fois |
| **Coalesce** | Si un job tourne et que l’utilisateur change A→B→C : à la fin de A on indexe **C** seulement |
| **Incrémental** | Watcher fichiers → invalidate path(s) (debounce) — relève après le 1er index |
| **Manuel** | Reindex / Purge / Pause depuis le cockpit (secours) |
| **UI / logs** | Journal pipeline + histo régulation **partitionnés par `rootFsPath`** (pas de mélange multi-repo) |

Code : [`droxCodebaseAutoIndex.ts`](../../src/vs/workbench/contrib/drox/common/codebase/supervision/droxCodebaseAutoIndex.ts).

### Cockpit — alertes & ressources embed

| Signal | Signification |
|--------|----------------|
| `EMPTY_WORKSPACE` | Index OK mais **0 fichiers indexables** (dossier vide ou seulement des ignores : `.drox`, `.git`, `node_modules`, …) — ce n’est pas une panne embed |
| `EMBED_NOT_BUILT` | `drox.exe` sans `--features embed` → retrieval **lexical only** (optionnel) |
| `EMBED_PARTIAL` / `EMBED_CHUNK_SKIPPED` | Chunks invalides (NUL / binaire / encode fail) : **l’embed continue** pour le reste ; alerte + marche à suivre (exclure / réparer → Reindex) |
| Bloc **Live resources** | RSS process `drox.exe` (`embed.status.rssBytes`) + taille GGUF disque ; poll ~2 s tant que le cockpit est ouvert |

---

## 3. Surfaces UI

| Surface | IDE | Fenêtre Agents |
|---------|-----|----------------|
| Cockpit | Activity bar **Codebase** (sidebar) | **Auxiliary bar** (droite, comme Changes) — liste Sessions reste à gauche |
| Toolbar historique discussion | — (QuickPick sessions) | Icônes **Codebase** + **Regulation** sur `SessionItemToolbarMenuId` |
| Composer | Chips Codebase (+ force) + Regulation | Idem (toolbar partagée) |
| Changement de discussion | workspace folder | `setActiveRoot` / `setActiveWorkspaceResource` → cockpit & régulation suivent |
| Tool agent | `codebase_search` | Idem (même client tools) |

Helpers d’ouverture : [`droxOpenWorkbenchViews.ts`](../../src/vs/workbench/contrib/drox/browser/droxOpenWorkbenchViews.ts).

---

## 4. Sync racine Agents

Quand la session Drox active change :

1. `IDroxCodebaseSupervisionService.setActiveRoot(root)` → refresh + `schedule('active-root')`.  
2. `IDroxRunSettingsService.setActiveWorkspaceResource(root)` → Regulation / settings lisent ce folder.  
3. `IDroxRegulationService.ensureHistoryLoaded(root.fsPath)` — best-effort.

Fichier : [`droxSessionsActiveSessionSync.ts`](../../src/vs/sessions/contrib/drox/browser/droxSessionsActiveSessionSync.ts).  
Actions toolbar : [`droxSessionsCockpitActions.ts`](../../src/vs/sessions/contrib/drox/browser/droxSessionsCockpitActions.ts).

---

## 5. Inject & régulation L5

- Auto-inject / force : `IDroxCodebaseContextService` (budget modulable par **L1**).  
- Posture retrieval (**L5**) : hint `codebase_search` / aggressivité — voir [model-regulation.md](model-regulation.md).  
- Le modèle **ne déclenche pas** l’index : le service IDE le tient à jour ; le LLM ne fait que chercher / recevoir un pack.

---

## 6. Fichiers clés

| Zone | Chemin |
|------|--------|
| Index service | `common/codebase/droxCodebaseIndexService*.ts` |
| Supervision / snapshot | `common/codebase/droxCodebaseSupervisionService.ts` |
| Auto-index + coalesce | `common/codebase/supervision/droxCodebaseAutoIndex.ts` |
| Inject | `common/codebase/droxCodebaseContextService.ts` |
| Cockpit UI | `browser/codebase/` |
| Bootstrap Agents | `sessions/contrib/drox/browser/droxSessionsBootstrap.ts` |
