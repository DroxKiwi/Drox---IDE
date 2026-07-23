# Architecture — service branches / graphe (1.5.19)

**Statut** : direction · à valider avec le catalogue [FEATURES-GIT-GRAPH.md](FEATURES-GIT-GRAPH.md)

## Problème

Aujourd’hui la branche est lue à plusieurs endroits (`ILocalGitService.getCurrentBranch`, `IDroxSessionGitService`, `gitRepository.branchName` du modèle Sessions) **sans** API unique pour :

- s’abonner aux changements HEAD
- lister les refs / commits pour une UI graphe
- orchestrer checkout / merge depuis l’UI Drox

## Proposition

```text
┌─────────────────────────────────────────────────────────┐
│  UI                                                     │
│  Badge (picker / header)  ·  Vue Git Graph  ·  (futur   │
│                               carte code)               │
└───────────────────────┬─────────────────────────────────┘
                        │ IDroxGitBranchService (renderer)
                        │  - currentBranch(repo): IObservable
                        │  - refs / commits (fenêtre)
                        │  - checkout / ops listées features
                        ▼
┌─────────────────────────────────────────────────────────┐
│  ILocalGitService (shared process) — étendu             │
│  getCurrentBranch · checkout · log · branch -a · …      │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
                   git (CLI)
```

### Nom

Provisoire : **`IDroxGitBranchService`** (focus branche + HEAD pour le badge).  
Si le graphe grossit (commits, layout, cache) : même service ou split `IDroxGitGraphModel` — à trancher en phase 1 d’implémentation.

### Responsabilités

| Responsabilité | Oui | Non |
|----------------|-----|-----|
| Branche courante observable par `URI` repo | ✓ | |
| Invalidate / refresh après ops Drox | ✓ | |
| Watcher filesystem `.git/HEAD` + refs (best effort) | ✓ | |
| Remplacer l’extension Git / SCM panel | | ✗ |
| Prompts agent Commit / Push | | ✗ (reste `IDroxSessionGitService`) |

### Points d’accroche UI (badge)

| Surface | Fichier | Changement prévu |
|---------|---------|------------------|
| Draft New session | [`sessionWorkspacePicker.ts`](../../../../src/vs/sessions/contrib/chat/browser/sessionWorkspacePicker.ts) | Pastille à côté du label dossier si git |
| Header session | [`sessionHeader.ts`](../../../../src/vs/sessions/browser/parts/sessionHeader.ts) | Pastille visible (pas seulement hover) |
| Clic badge | — | Ouvre la vue Git Graph du repo (quand C livré) |

### Socle « canvas » (horizon)

Le layout graphe (nœuds, arêtes, pastilles) doit vivre dans un module **UI isolé** (ex. `droxGraphLayout` / widget browser) sans dépendre du domaine git, pour pouvoir brancher plus tard une **carte visuelle du code** sur le même moteur de rendu.

---

## Étapes d’implémentation (après features figées)

1. Étendre `ILocalGitService` + impl node avec les commandes requises par le catalogue MVP.
2. Ajouter `IDroxGitBranchService` (+ tests unitaires mocks).
3. Brancher le badge (A) sans attendre le graphe complet.
4. Custom editor / view pane Git Graph consommant le même service.
