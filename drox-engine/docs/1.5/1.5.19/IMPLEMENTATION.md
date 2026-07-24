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

## Livré (tranche 2)

| Item | Détail |
|------|--------|
| `ILocalGitService` | Stashes, détails commit + fichiers, create/delete/rename branch, tags, merge/rebase/reset, cherry-pick/revert, pushRef, stash ops, reset/clean uncommitted |
| `IDroxGitGraphService` | Fenêtre + `stashes`, `getCommitDetails`, fetch + toutes les ops menus |
| Layout | `computeDroxGitGraphLayout` — lanes + arêtes merges (SVG) |
| Toolbar | Refresh, Fetch, Show Remote Branches, Search |
| Détail | Panneau latéral (message, meta, body, fichiers, ouvrir / copier chemins) |
| Menus | Commit, branche locale/remote, tag, stash, uncommitted (+ confirms / prompts) |
| Tests | Layout + `getStashes` / `createBranch` |

## Livré (tranche 3)

| Item | Détail |
|------|--------|
| Content provider | Schéma `drox-git` — fichier à une révision (`git show`) |
| Diffs | Clic fichier → diff parent↔commit ; menu View Diff / at revision / vs working tree / Open File |
| Compare | Ctrl/Cmd+clic 2 commits → liste `git diff` + diffs natifs entre les deux |
| Branches (V7) | Quick pick multi-sélection → `getCommitLog({ refs })` |
| Colonnes (V3) | Clic droit en-tête → Date / Author / Commit |
| Liens | URLs dans le body + parents SHA cliquables |
| API | `getFileAtRevision`, `getChangedFilesBetween`, `refs` sur le log |

### Fichiers clés

- [`localGitService.ts`](../../../../src/vs/platform/git/common/localGitService.ts) / [`node/localGitService.ts`](../../../../src/vs/platform/git/node/localGitService.ts)
- [`droxGitGraphService.ts`](../../../../src/vs/workbench/contrib/drox/common/droxGitGraphService.ts) (interface)
- [`electron-browser/droxGitGraphService.ts`](../../../../src/vs/workbench/contrib/drox/electron-browser/droxGitGraphService.ts)
- [`browser/gitGraph/`](../../../../src/vs/workbench/contrib/drox/browser/gitGraph/) — editor, layout, revision content, badge

## Reste (parité GG)

- Create Pull Request / Create Archive
- Virtualisation liste (gros repos)
- Polish dialogs options GG (no-FF, squash, force-with-lease UI fine)
- Drop commit topologique (MC6)
- Select/Unselect branch in dropdown depuis pastille (MBL9)

## Smoke manuel

1. Agents → New session sur un repo git → pastille branche.
2. **Drox: Git Graph** → lanes + pastilles + stashes + uncommitted.
3. Clic commit → détail ; clic fichier → **diff** éditeur.
4. Ctrl/Cmd+clic 2 commits → liste fichiers entre les deux → ouvrir diffs.
5. Branches → filtrer ; clic droit en-tête → masquer Date/Author/Commit.
6. Menus contextuels (branche / commit / stash / fichier).
7. Double-clic pastille → checkout + badge à jour.
8. Hors git → pas de pastille.
