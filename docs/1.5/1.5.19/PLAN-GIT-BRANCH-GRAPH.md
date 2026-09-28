# Plan 1.5.19 — Badge branche + Git Graph natif Drox

**Version** : 1.5.19 · **Priorité** : P0 UX branche visible, P1 graphe Git natif  
**Surfaces** : fenêtre **Agents** (draft New session + header session) · éditeur / vue dédiée · socle réutilisable plus tard (carte code)

## Décisions produit

| Décision | Choix | Pourquoi |
|----------|--------|----------|
| Affichage branche | **Badge visible** à côté du dossier projet | L’utilisateur doit **voir** sur quelle branche il travaille, pas seulement au hover |
| Graphe | **Natif Drox** (pas d’extension `mhutchie.git-graph`) | Contrôle UX + **même famille de mécaniques visuelles** pour une future carte du code |
| Gestion branche | **Service centralisé** Drox | Une source de vérité pour badge, graphe, checkout, refresh — éviter N lectures git dispersées |
| Extension Open VSX | Hors périmètre 1.5.19 | Doc install manuelle inchangée ; on ne shippe pas Git Graph tiers |

## Périmètre

| # | Type | Sujet | Statut |
|---|------|--------|--------|
| A | Feature | Badge branche (dossier git) | ✅ tranche 1 |
| B | Infra | Service centralisé branches / HEAD | ✅ tranche 1–2 |
| C | Feature | Git Graph natif Drox — **parité `mhutchie.git-graph`** | 🔄 layout + menus + détail |

**Docs** :
- [FEATURES-GIT-GRAPH.md](FEATURES-GIT-GRAPH.md) — catalogue MVP = parité Git Graph (+ badge Drox)
- [ARCHITECTURE-BRANCH-SERVICE.md](ARCHITECTURE-BRANCH-SERVICE.md) — socle service + points d’accroche UI

---

# Partie 1 — État des lieux

## Ce qui existe déjà

| Couche | API / UI | Capacité | Limite |
|--------|----------|----------|--------|
| Shared process | [`ILocalGitService`](../../../../src/vs/platform/git/common/localGitService.ts) | `getCurrentBranch`, `checkout`, `fetch`, `commitAll`, `push`, … | Pas de liste branches, pas de log/graph, pas d’événements HEAD |
| Renderer Drox | [`IDroxSessionGitService`](../../../../src/vs/workbench/contrib/drox/common/droxSessionGitService.ts) | Wrapper session (uncommitted / branch / upstream / commit / push) | Orienté **Commit agent**, pas graphe |
| Modèle Sessions | `folder.gitRepository.branchName` | Branch sur workspace session (ex. provider Drox) | Pas toujours à jour hors provider ; **pas de badge** |
| Header session | [`sessionHeader.ts`](../../../../src/vs/sessions/browser/parts/sessionHeader.ts) `_buildWorkspaceHover` | Branche au **hover** du dossier | Invisible en permanence |
| Draft New session | [`sessionWorkspacePicker.ts`](../../../../src/vs/sessions/contrib/chat/browser/sessionWorkspacePicker.ts) | Label dossier seul | **Pas de branche** |
| Composer | Changes / Commit pills | Diff + prompts commit | Indépendant du graphe |

**Verdict** : il y a du git local, **pas** de couche « branche / historique » centralisée ni d’UI graphe. On **étend** plutôt que de dupliquer.

## Besoin utilisateur (A)

Pendant le travail Agents (et idéalement session ouverte) :

```text
New session in  [📁 site-kdds]  [⎇ 0.0.0]  with  [✦ Drox]
```

- Badge **uniquement** si le dossier ouvert est un dépôt git (sinon rien).
- Mise à jour quand HEAD change (checkout depuis le graphe, terminal, SCM, etc.).
- Clic sur le badge → ouvre / focus la vue Git Graph du repo (cible UX après Partie C).

---

# Partie 2 — Service centralisé (B)

## Objectif

Une API unique consommée par :

1. Badge header / picker
2. Vue Git Graph
3. (Plus tard) carte code / autres vues « canvas »

## Direction technique

Nouveau service renderer (nom provisoire **`IDroxGitGraphService`** ou **`IDroxBranchService`**) qui :

- Résout le repo à partir d’un `URI` dossier (working tree / `.git`)
- Expose **observables** : branche courante, liste refs, commits (fenêtre), état dirty
- Délègue l’exécution à `ILocalGitService` **étendu** (nouvelles commandes : `branch -a`, `log --pretty=…`, `merge-base`, etc.)
- Émet / écoute les changements HEAD (watcher `.git/HEAD` + `refs/` ou poll léger après opérations Drox)

Ne **pas** faire porter ça à `IDroxSessionGitService` tel quel (trop étroit / orienté commit agent) — soit l’élargir clairement, soit un service frère partagé.

Détail → [ARCHITECTURE-BRANCH-SERVICE.md](ARCHITECTURE-BRANCH-SERVICE.md).

---

# Partie 3 — Git Graph natif (C)

## Pourquoi maison

- UX alignée Drox (Agents + IDE).
- **Socle visuel** : pastilles, liens, layout en colonnes — réutilisable pour une **carte visuelle du code** (feature future hors 1.5.19).
- Pas de dépendance à une extension tierce (licence, branding, menu hors produit).

## Contrat MVP

**Parité fonctionnelle** avec l’extension VS Code **Git Graph** (`mhutchie.git-graph`) : vue, pastilles, menus contextuels, détail/compare commits, stashes, remotes, tags — catalogue complet dans [FEATURES-GIT-GRAPH.md](FEATURES-GIT-GRAPH.md).

| Principe | Note |
|----------|------|
| Parité comportementale | Pas un fork du webview GG ; UI native Drox |
| Pastilles branches / tags / remotes | Comme GG |
| Interaction primaire Drox | Double-clic pastille → **checkout** (+ menu Checkout comme GG) |
| Vue éditeur | Onglet / custom editor Drox |
| Multi-repo | Un graphe = un working tree (dossier session / workspace) |

---

## Plan d’exécution (haut niveau)

| Phase | Item | Dépend | Statut |
|-------|------|--------|--------|
| 0 | Catalogue features = parité Git Graph | — | ✅ figé |
| 1 | Archi service + extension `ILocalGitService` | 0 | ✅ tranche 1–2 |
| 2 | Badge branche (picker + header) branché sur service | 1 | ✅ tranche 1 |
| 3 | Vue graphe + actions (tranches → couverture catalogue) | 0 + 1 | 🔄 diffs + compare + V3/V7 |
| 4 | Smoke parité + badge live Agents | 2 + 3 | ⏳ |

---

## Hors périmètre 1.5.19

- Embarquer / forker `mhutchie.git-graph`
- Carte visuelle du **code** (seulement préparer le socle graphe pour y arriver plus tard)
- Remplacer SCM VS Code / Source Control panel
- Authenticode / ship OR (phase clôture séparée)
- **Implémentation** index `@Codebase` / embed / carte code → **[1.5.22](../1.5.22/README.md)**
- **Tool calling universel** → **[1.5.21](../1.5.21/README.md)**
- **Bugs résiduels / chat IDE** → **[1.5.20](../1.5.20/README.md)**

---

## Risques

| Risque | Mitigation |
|--------|------------|
| Perf `git log` sur gros repos | Fenêtre paginée / limite commits + lazy load |
| Désync badge vs HEAD réel | Watcher refs + refresh après chaque op graphe |
| Charge de travail parité GG complète | Tranches internes ; ship seulement si catalogue §§1–8 couvert |
| Complexité layout graphe (merges) | MVP linéaire puis forks ; lib layout isolée réutilisable |
