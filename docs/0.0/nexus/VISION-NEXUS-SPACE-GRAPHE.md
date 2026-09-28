# Nexus Space — graphe lié type Obsidian + profondeur (MVP refondu)

Document de **référence pour le nouvel onglet Nexus Space** : replacer la métaphore « physique orbitale / cartes » par une **visualisation de graphe** proche de ce qu’offre **Obsidian** (nuage de nœuds reliés par des liens), enrichie d’une **dimension de profondeur** pour distinguer Nexus d’un graphe strictement plat.

**Lien** : cadre produit et charte dans [`DESIGN-VISION.md`](./DESIGN-VISION.md).  
**Implémentation** (évolution à prévoir) : `src/vs/workbench/contrib/nexus-space/`.

---

## 1. Intention

| Axes | Obsidian (référence) | Nexus Space (cible MVP) |
|------|----------------------|-------------------------|
| Structure | Fichiers / notes = **nœuds**, liens wiki ou références = **arêtes** | Même lecture : **nœuds** + **liens** explicites entre eux |
| Rendu | Graphe 2D : disposition des points, attraction / forces, zoom pan | **Fond noir uni** (ancre visuelle), graphe lisible |
| Profondeur | Essentiellement plat (caméra 2D) | **Profondeur** (axe Z, parallax, ou projection 3D à trancher) pour hiérarchie, distance ou focus |

Objectif : offrir une **carte mentale spatiale** du coffre ou du contexte (à préciser : workspace, sous-ensemble de fichiers, graphe fictif de démo, etc.) avec une **hiérarchie perçue en profondeur**, pas seulement un plan.

---

## 2. Périmètre MVP (à affiner avec la suite du cahier des charges)

Les décisions suivantes sont **ouvertes** jusqu’à spécification détaillée :

- **Source des nœuds** : fichiers réels du workspace, entités synthétiques de démo, ou les deux.
- **Source des liens** : imports, `[[wikilinks]]`, analyse de graphe de dépendances, liens manuels — à définir.
- **Modèle de profondeur** : Z normalisé (plus « loin » = plus petit / plus sombre), caméra orbitale légère, ou graphe 2.5D (offset Z pour couches).
- **Interaction** : sélection, navigation vers fichier, zoom, rotation (si 3D), filtres.

**Constante de design confirmée** : **fond noir plein** (#000 ou équivalent charte), sans champ d’étoiles ni nébuleuse, pour maximiser le contraste des nœuds et des arêtes.

---

## 3. Ce que le MVP ne vise plus (par défaut)

- Simulation **gravité / orbites** entre « planètes » et « étoiles » comme pilier de l’expérience.
- Cartes HTML flottantes pilotées par un moteur physique newtonien (héritage prototype précédent).

Ces éléments peuvent rester documentés ailleurs comme **pistes long terme** pour le workbench au sens large ; ils ne sont **plus** la définition de Nexus Space.

---

## 3bis. Liens entre fichiers et dossiers (imports)

Les arêtes du graphe peuvent être dérivées des **imports** (fichier → fichier résolu), avec des règles **même dossier** vs **dossiers différents** (liens dossier–dossier). Détail, algorithme et fichier JSON de règles : **[`NEXUS-SPACE-LIENS-REGLES.md`](./NEXUS-SPACE-LIENS-REGLES.md)**.

---

## 4. Implémentation technique (direction probable)

À valider à l’implémentation :

- **Rendu** : SVG / Canvas 2D avec faux Z, ou **WebGL** / scène 3D légère si la profondeur l’exige.
- **Données** : graphe `{ nodes[], edges[] }` + attributs (label, profondeur, couleur, lien cible).
- **Performance** : limites sur le nombre de nœuds visibles, LOD, `prefers-reduced-motion`.

---

## 5. Historique

| Date | Note |
|------|------|
| 2026-04-02 | Document créé : pivot MVP vers graphe type Obsidian + profondeur, fond noir, hors physique orbitale. |
