# Implémentation 1.5.19 — Badge + Git Graph

**Statut** : en cours  
Plan : [PLAN-GIT-BRANCH-GRAPH.md](PLAN-GIT-BRANCH-GRAPH.md)

## Livré (tranche 1)

| Item | Détail |
|------|--------|
| `ILocalGitService` | `isGitRepository`, `getRepoRoot`, `getCommitLog`, `getRefs`, `getStatusSummary` + tests |
| `IDroxGitGraphService` | Observables `currentBranch` / `isGitRepo`, refresh, watcher `.git`, `getGraphWindow`, `checkoutBranch`, `openGitGraph` |
| Badge | `DroxBranchBadge` sur New session picker + session header · clic → ouvre le graphe |
| Vue | Editor pane **Git Graph** (liste commits, pastilles, uncommitted, refresh, dbl-clic checkout) |
| Commande | `Drox: Git Graph` (`drox.gitGraph.open`) |

### Fichiers clés

- [`localGitService.ts`](../../../../src/vs/platform/git/common/localGitService.ts) / [`node/localGitService.ts`](../../../../src/vs/platform/git/node/localGitService.ts)
- [`droxGitGraphService.ts`](../../../../src/vs/workbench/contrib/drox/common/droxGitGraphService.ts) (interface)
- [`electron-browser/droxGitGraphService.ts`](../../../../src/vs/workbench/contrib/drox/electron-browser/droxGitGraphService.ts)
- [`browser/gitGraph/`](../../../../src/vs/workbench/contrib/drox/browser/gitGraph/)

## Reste (parité GG)

Suivre [FEATURES-GIT-GRAPH.md](FEATURES-GIT-GRAPH.md) — menus contextuels complets, détail/compare commits, stash/tag/remote ops, toolbar (fetch, search, filtres), dialogs, layout graphe (arêtes merges), virtualisation.

## Smoke manuel

1. Agents → New session sur un repo git → pastille branche à côté du dossier.
2. Clic pastille / commande **Drox: Git Graph** → liste commits + pastilles.
3. Double-clic pastille branche → checkout + pastille header à jour.
4. Hors git → pas de pastille.
