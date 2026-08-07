# Plan — carte visuelle du code (1.5.20)

**Statut** : **backlog / plan léger** · pas d’implémentation  
**Version** : 1.5.20  
**Dépendances** :
- Socle layout canvas livré en [1.5.19 Git Graph](../1.5.19/PLAN-GIT-BRANCH-GRAPH.md) (`droxGitGraphLayout` / pastilles / arêtes)
- Idéalement [index codebase](ARCHITECTURE-CODEBASE-INDEX.md) (hits → nœuds pertinents) — phases CB3+ / CB5

---

## 1. Objectif

Donner une **vue spatiale** du projet : fichiers / dossiers / (plus tard) symboles et imports, navigable comme le Git Graph — **pas** un clone de l’explorateur arborescent.

Cas d’usage :

- Orienter l’utilisateur dans un gros repo
- Relier retrieval `@Codebase` à une représentation visuelle
- Préparer des overlays (fichiers touchés par la session, diffs, etc.)

---

## 2. Principes

| Principe | Décision |
|----------|----------|
| Réutiliser le canvas | Même famille que Git Graph (layout isolé du domaine métier) |
| Domaine séparé | Nœuds = chemins / symboles, pas commits |
| Progressive | MVP fichiers + dossiers ; imports / call-graph ensuite |
| Local-first | Données workspace ; pas d’upload cloud |

---

## 3. MVP (proposition)

1. Commande / vue **Drox: Code Map**
2. Nœuds = dossiers + fichiers (filtre ignore / profondeur)
3. Arêtes simples (parenté dossier → enfant) ou layout force / colonnes
4. Clic → ouvrir fichier ; sélection multi → contexte chat
5. Optionnel : colorer les hits du dernier `codebase_search`

Hors MVP : graphe d’imports complet, UML, édition sur canvas.

---

## 4. Phases

| Phase | Livrable |
|-------|----------|
| **CM0** | Spec UX + choix layout (réutiliser vs adapter `computeDroxGitGraphLayout`) |
| **CM1** | Vue read-only arborescence spatiale + open file |
| **CM2** | Branchement index / highlights retrieval |
| **CM3** | Imports ou symboles (si ROI clair) |

---

## 5. Lien 1.5.19

Le Git Graph a volontairement isolé le **moteur de rendu** pour cette feature. Ne pas ré-embarquer la logique git dans la carte code.
