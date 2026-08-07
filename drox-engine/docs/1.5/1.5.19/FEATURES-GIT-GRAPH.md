# Features — Git Graph natif Drox (1.5.19)

**Statut** : **MVP figé** — parité fonctionnelle avec l’extension VS Code **Git Graph** ([`mhutchie/vscode-git-graph`](https://github.com/mhutchie/vscode-git-graph))  
**Implémentation** : native Drox (pas d’extension embarquée)  
Plan parent : [PLAN-GIT-BRANCH-GRAPH.md](PLAN-GIT-BRANCH-GRAPH.md)

## Décision produit

> Le MVP du graphe Drox doit **récupérer exactement** ce que fait Git Graph aujourd’hui dans VS Code : même vue, mêmes pastilles, mêmes menus contextuels et actions git, même détail commit / compare.

Référence menus (source de vérité amont) : [Context Menus](https://docs.mhutchie.com/vscode-git-graph/general/context-menus).

| Ajout Drox (en plus de la parité) | Note |
|-----------------------------------|------|
| Badge branche header / New session | Hors graphe — voir plan Partie A |
| Double-clic pastille → checkout | Raccourci Drox (Git Graph = menu « Checkout Branch ») |
| Ouverture depuis le badge | Intégration Agents |
| Socle layout réutilisable « carte code » | Hors UX Git Graph · reporté → [1.5.21](../1.5.21/PLAN-CODE-MAP.md) |

**Hors MVP** : cloner pixel-perfect le webview / CSS de l’extension ; on vise la **parité comportementale**, UI native Drox.

**Note livraison** : la parité est le **contrat MVP** ; l’implémentation pourra avancer par tranches internes (vue + lecture → actions branche → commit/stash/tag → détails fichier) tant que le ship 1.5.19 ne part pas avant couverture du catalogue ci-dessous.

---

## 1. Vue principale (parité Git Graph View)

| ID | Feature | MVP |
|----|---------|-----|
| V1 | Colonne graphe (nœuds + arêtes, merges) | ✓ |
| V2 | Colonnes Description / Date / Author / Commit (SHA) | ✓ |
| V3 | Visibilité colonnes (clic droit en-têtes : Date, Author, Commit) | ✓ |
| V4 | Pastilles branches locales + remotes + tags sur les commits | ✓ |
| V5 | Ligne **Uncommitted Changes** en tête (si working tree dirty) | ✓ |
| V6 | Affichage des **stashes** sur le graphe | ✓ |
| V7 | Dropdown **Branches** (Show All / sélection) | ✓ |
| V8 | Checkbox **Show Remote Branches** | ✓ |
| V9 | Toolbar : Search, Terminal/Command, Settings, Fetch, Refresh | ✓ |
| V10 | Une vue = un dépôt (working tree du dossier session / workspace) | ✓ |
| V11 | Commande palette type « View Git Graph » (libellé Drox) | ✓ |

---

## 2. Détail commit & comparaison

| ID | Feature | MVP |
|----|---------|-----|
| CD1 | Clic commit → panneau détails (message, auteur, fichiers changés) | ✓ |
| CD2 | Diff VS Code / Drox d’un fichier du commit (clic fichier) | ✓ |
| CD3 | Ouvrir la version courante d’un fichier touché | ✓ |
| CD4 | Copier chemin fichier (absolu / relatif) | ✓ |
| CD5 | Compare deux commits (clic + Ctrl/Cmd+clic) + diffs entre les deux | ✓ |
| CD6 | Liens HTTP(S) dans le body → ouvrir navigateur | ✓ |
| CD7 | Liens internes (parents SHA) → follow | ✓ |

### Menu fichier (panneau détails)

| ID | Action | MVP |
|----|--------|-----|
| CF1 | View Diff | ✓ |
| CF2 | View File at this Revision | ✓ |
| CF3 | View Diff with Working File | ✓ |
| CF4 | Open File | ✓ |
| CF5 | Copy Absolute / Relative File Path | ✓ |

---

## 3. Menu contextuel — Commit

| ID | Action (Git Graph) | MVP |
|----|--------------------|-----|
| MC1 | Add Tag… | ✓ |
| MC2 | Create Branch… | ✓ |
| MC3 | Checkout… | ✓ |
| MC4 | Cherry Pick… | ✓ |
| MC5 | Revert… | ✓ |
| MC6 | Drop… (si topologiquement possible) | ✓ |
| MC7 | Merge into current branch… | ✓ |
| MC8 | Rebase current branch on this Commit… | ✓ |
| MC9 | Reset current branch to this Commit… | ✓ |
| MC10 | Copy Commit Hash to Clipboard | ✓ |
| MC11 | Copy Commit Subject to Clipboard | ✓ |

---

## 4. Menu contextuel — Uncommitted Changes

| ID | Action | MVP |
|----|--------|-----|
| MU1 | Stash uncommitted changes… | ✓ |
| MU2 | Reset uncommitted changes… | ✓ |
| MU3 | Clean untracked files… | ✓ |
| MU4 | Open Source Control View | ✓ |

---

## 5. Menu contextuel — Branche locale (non checkout)

| ID | Action | MVP |
|----|--------|-----|
| MBL1 | Checkout Branch | ✓ |
| MBL2 | Rename Branch… | ✓ |
| MBL3 | Delete Branch… | ✓ |
| MBL4 | Merge into current branch… | ✓ |
| MBL5 | Rebase current branch on Branch… | ✓ |
| MBL6 | Push Branch… (si remotes) | ✓ |
| MBL7 | Create Pull Request… (si config PR) | ✓ |
| MBL8 | Create Archive | ✓ |
| MBL9 | Select / Unselect in Branches Dropdown | ✓ |
| MBL10 | Copy Branch Name to Clipboard | ✓ |
| MBL11 | **Drox** : double-clic pastille → Checkout | ✓ |

### Branche locale (déjà checkout)

Même menu **sans** Checkout / Delete / Merge / Rebase (comme Git Graph) : Rename, Push, Create PR, Archive, Select/Unselect, Copy name.

---

## 6. Menu contextuel — Branche remote

| ID | Action | MVP |
|----|--------|-----|
| MBR1 | Checkout Branch… | ✓ |
| MBR2 | Delete Remote Branch… | ✓ |
| MBR3 | Fetch into local branch… (si local homonyme non checkout) | ✓ |
| MBR4 | Pull into current branch… | ✓ |
| MBR5 | Create Pull Request | ✓ |
| MBR6 | Create Archive | ✓ |
| MBR7 | Select / Unselect in Branches Dropdown | ✓ |
| MBR8 | Copy Branch Name to Clipboard | ✓ |

---

## 7. Menu contextuel — Stash

| ID | Action | MVP |
|----|--------|-----|
| MS1 | Apply Stash… | ✓ |
| MS2 | Create Branch from Stash… | ✓ |
| MS3 | Pop Stash… | ✓ |
| MS4 | Drop Stash… | ✓ |
| MS5 | Copy Stash Name / Hash | ✓ |

---

## 8. Menu contextuel — Tag

| ID | Action | MVP |
|----|--------|-----|
| MT1 | View Details (annotated) | ✓ |
| MT2 | Delete Tag… | ✓ |
| MT3 | Push Tag… (si remotes) | ✓ |
| MT4 | Create Archive | ✓ |
| MT5 | Copy Tag Name to Clipboard | ✓ |

---

## 9. Dialogs / options (comportement Git Graph)

Parité des dialogues courants (cases à cocher / confirms) :

| ID | Dialog | MVP |
|----|--------|-----|
| DG1 | Create Branch (+ checkout optionnel) | ✓ |
| DG2 | Merge (no FF, squash, etc. selon options GG) | ✓ |
| DG3 | Rebase (ignore date / interactive terminal) | ✓ |
| DG4 | Reset (soft / mixed / hard) | ✓ |
| DG5 | Push (set upstream, force with lease si exposé GG) | ✓ |
| DG6 | Stash / Clean / Delete confirms | ✓ |

Réglages fins type `git-graph.*` : **parité progressive** via settings Drox `drox.gitGraph.*` (P1 si trop large pour le premier ship — le **comportement par défaut** doit matcher Git Graph).

---

## 10. Intégration Drox (hors extension amont)

| ID | Feature | MVP |
|----|---------|-----|
| DX1 | Badge branche (picker + header) | ✓ |
| DX2 | Clic badge → ouvrir Git Graph du repo | ✓ |
| DX3 | Sync badge après toute op qui change HEAD | ✓ |
| DX4 | Service centralisé branches / ops (`ILocalGitService` étendu) | ✓ |

---

## Hors périmètre MVP (volontaire)

| Item | Pourquoi |
|------|----------|
| Embarquer le VSIX / webview `mhutchie.git-graph` | Décision native |
| Carte visuelle du **code** | Feature future ; seulement le socle layout |
| Remplacer le panel SCM stock | MU4 ouvre SCM, ne le remplace pas |
| 100 % des settings `git-graph.*` exotiques au jour 1 | Defaults GG d’abord ; settings Drox ensuite |

---

## Critère d’acceptation MVP

Un utilisateur habitué à Git Graph dans VS Code retrouve dans Drox, sur le même repo :

1. Le graphe (commits, pastilles, remotes, uncommitted, stashes).
2. Les actions des menus listés §§3–8.
3. Le détail / compare commits + diffs fichiers.
4. Le badge Agents aligné sur HEAD après checkout / merge / rebase depuis le graphe.

Référence visuelle terrain : captures utilisateur (pastilles `main` / `origin` / tags, menu Checkout Branch, Uncommitted Changes).
