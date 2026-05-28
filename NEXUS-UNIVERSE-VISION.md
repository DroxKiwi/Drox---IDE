# Nexus Space — vision « univers de points » et évolutions

Ce document fixe l’intention produit pour **Nexus Space** : sortir de la lecture linéaire du code et organiser la compréhension autour de **nuages de points en 3D**, avec navigation **globale → locale → symbole**, et trajectoire de la **donnée** à travers les couches.

---

## 1. Vision d’ensemble

### 1.1 Multi-échelles

- **Univers global** : le dépôt / workspace comme un nuage — fichiers, dossiers, liens forts (hiérarchie, imports, plus tard appels, flux de données, etc.).
- **Nuage local (fichier)** : autour d’un fichier, exposition des **symboles** (fonctions, méthodes, constantes, types, variables notables) comme nœuds, reliés par des arêtes sémantiques (appelle, définit, lit/écrit, implémente…).
- **Descente possible jusqu’au grain fonction** : visualiser le **trajet de la donnée** à l’intérieur d’une routine (entrées, branches, sorties), sans que la fenêtre texte soit le seul référentiel.

Objectif : **casser la représentation linéaire** du code et la remplacer par une **topologie navigable** dans un même espace visuel.

### 1.2 Ingénierie (rappel)

- **Liens déterministes** là où les outils le permettent (parseurs, Language Service, résolution de modules, etc.).
- **IA** en complément pour l’intention métier, les ambiguïtés, et les liens cross-artifacts difficiles à prouver statiquement.
- **Cycles** (ex. V3 `linker`) et orchestration future pour séparer « quelle couche du graphe on construit » (fichiers, symboles, scénarios, …).

---

## 2. Feature A — Simulation d’activité (injection de donnée)

### 2.1 Description

- Possibilité de **simuler de l’activité** :
  - **localement** (focus sur un sous-graphe / un fichier / un symbole) ;
  - ou **globalement** (sur l’univers du dépôt).
- L’utilisateur **injecte une donnée** en un point du graphe (ou un type d’événement abstrait).
- Le système **propage** cette activation le long des arêtes pertinentes (« ramification ») avec une **évolution d’état** de la donnée au fil du parcours (valeur, phase, tags, etc. — à préciser dans un schéma de données).

### 2.2 But

Comprendre visuellement **où la donnée va**, **quels chemins s’allument**, et **comment son état change** — utile pour du debugging conceptuel, de la formation, et pour valider des scénarios sans exécuter tout le runtime.

### 2.3 À définir (évolution du format)

- Modèle d’**événement / payload** injecté.
- Règles de **propagation** (graphe statique + priorités, ou règles déclaratives).
- **Horodatage / pas de simulation** (discret vs continu).
- Persistance éventuelle des runs (peut recouper la feature B).

---

## 3. Feature B — Référentiel de scénarios (fichiers JSON, UUID, base de connaissance IA)

### 3.1 Intention (encore à affiner)

- À la **racine du dépôt** (ou emplacement conventionnel), un **référentiel de fichiers** :
  - chaque fichier a un **nom unique** (ex. **UUID**) ;
  - il représente un **test**, une **simulation**, ou une **interaction IA** sur un nuage (global ou local).
- Ces artefacts servent de **base de connaissance additionnelle au code source** : contexte d’**intention utilisateur**, hypothèses produit, scénarios ciblés.

**Exemple d’usage conversationnel** (sans implémenter ici le chat) :

> « Notre système de connexion est basique, c’est du SSO ; je veux limiter la connexion à un seul domaine Google — qu’est-ce que tu conseilles ? »

L’IA peut alors **produire une simulation** décrite en **JSON** :

- ce que le graphe **montrerait** si on appliquait tel changement ;
- où l’IA **envisage** des remplacements / ajouts de code (liens vers fichiers ou symboles) ;
- paramètres d’une simulation **locale ou globale**.

### 3.2 Chargement et tests

- **Charger** une simulation depuis ce référentiel dans Nexus Space.
- Réutiliser les **mécanismes de la feature A** : injection, propagation, état de la donnée, pour des **tests de réactivité** sur le scénario décrit (sans nécessairement muter le disque tant que c’est un mode « prévisualisation »).

### 3.3 À définir

- Schéma JSON versionné (`version`, `scope`, `graphPatch`, `injections`, `expectedHighlights`, …).
- Droit d’écriture / `.gitignore` / sécurité (ne pas committer de secrets).
- Lien avec **nexus-config** et les **cycles** pour savoir quelle couche du graphe la simulation cible.

---

## 4. Synthèse

| Idée | Rôle |
|------|------|
| Univers 3D multi-niveaux | Navigation « code comme paysage » et trajet de données |
| Feature A — simulation / injection | Voir les ramifications et l’état le long du graphe |
| Feature B — repo de scénarios JSON | Intention + scénarios IA chargeables + tests réutilisant A |

Ce document est **vivant** : à mettre à jour quand les schémas (graphe, événements, JSON) se stabilisent.
