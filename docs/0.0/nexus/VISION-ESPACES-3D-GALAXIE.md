# Nexus — Vision UI : espace 3D, galaxie, masse et gravité (brouillon)

> **Nexus Space (MVP)** : cette piste **ne définit plus** l’onglet Nexus Space. Le MVP actuel décrit un **graphe lié type Obsidian + profondeur** — voir [`VISION-NEXUS-SPACE-GRAPHE.md`](./VISION-NEXUS-SPACE-GRAPHE.md). Le présent document reste utile comme **exploration long terme** pour d’autres idées workbench (fenêtres, masse, gravité).

Document de travail pour **affiner** une évolution majeure de l’UI/UX : passer d’un workbench essentiellement **plat et docké** à une métaphore **spatiale** (profondeur, empilement, arrière-plan « galaxie »). Ce texte pose la vision, des **mécaniques souhaitées**, et une liste de **questions** pour stabiliser le périmètre avant toute implémentation lourde.

**Lien** : cette vision s’inscrit dans l’environnement partagé humain / IA décrit dans [`DESIGN-VISION.md`](./DESIGN-VISION.md).

---

## 1. Idée directrice

- Chaque **fenêtre** (au sens large : éditeur, panneau, vue détachable…) a une **place** dans un espace **simulé** en 2,5D / 3D : position (x, y), échelle (zoom), et **ordre de profondeur** (**z-index** : ce qui est devant ou derrière).
- L’utilisateur peut **saisir et déplacer** les fenêtres, et avec une **combinaison de touches + molette** **agrandir ou rétrécir** une fenêtre (comme un zoom local).
- Quand plusieurs vues se chevauchent, le **z-index** détermine quelle fenêtre **masque** les autres (la plus haute = au premier plan).

Objectif ressenti : donner **de la profondeur** à l’app et une lecture immédiate de la **hiérarchie d’attention** (quoi est « proche », actif, ou relégué en arrière-plan).

---

## 2. Mode « galaxie » et corps stellaires

### 2.1 Comportement visuel en arrière-plan

- Les fenêtres **non prioritaires** ou **éloignées** peuvent passer en mode visuel **« corps stellaire »** : elles se **réduisent** jusqu’à devenir des **points** dans un fond type **galaxie**.
- La **taille / luminosité** apparente d’un point peut dépendre en partie d’un **indice pseudo-aléatoire** fixé au **démarrage de l’app** (à retravailler : graine déterministe, option utilisateur, ou corrélation avec un ID de workspace).

### 2.2 Masse (réglage utilisateur)

- L’utilisateur peut attribuer une **masse** à **chaque fenêtre** (ou à chaque « surface » mappable sur une fenêtre).
- La **masse** influence le comportement de cette fenêtre **lorsqu’elle est en mode corps stellaire** (arrière-plan), pas nécessairement la taille en mode édition plein écran.

**Correspondance proposée (à valider)** :

| Masse (conceptuelle) | Rendu en mode corps stellaire |
|----------------------|---------------------------------|
| Très élevée | **Étoile** : point plus lumineux / plus marqué (halo, rayon plus fort). |
| Modérée à faible | **Planète** : point plus **faible**, moins lumineux. |

Les seuils exacts (où bascule étoile vs planète) sont **à calibrer** (curseur, valeur numérique, ou presets).

---

## 3. Gravité et systèmes dynamiques (exigence de simplicité)

### 3.1 Intention

- En fonction des **masses**, des **systèmes** avec **gravité** peuvent apparaître : les corps influencent légèrement les mouvements des autres (orbites lentes, regroupements doux, etc.).
- La **logique doit rester simple** côté code : comportement **prévisible**, **stable**, sans **chaos** ni simulation physique lourde (pas de N-corps généraliste en temps réel si cela produit des trajectoires incompréhensibles).

### 3.2 Pistes pour rester prédictibles (à trancher)

1. **Gravité hiérarchique (recommandée pour un prototype)**  
   - Un petit nombre d’**attracteurs** (ex. : les fenêtres de masse très élevée, ou le centre de l’écran).  
   - Les autres corps subissent une **accélération bornée** vers l’attracteur le plus « pertinent » (plus proche, ou plus massif), avec une **vitesse max** et un **amortissement** (friction) pour éviter les oscillations folles.

2. **Forces 2 à 2 avec plafonds**  
   - Pour chaque paire (i, j), une force de type \(F \propto \frac{m_i m_j}{r^2+\varepsilon}\) mais **clampée** (valeur min/max), **pas** de pas de temps trop petit sans intégration explicite stable.

3. **Pas de gravité continue**  
   - Uniquement des **ressorts** ou des **snap** vers des positions de repos sur une **grille** ou une **courbe** ; la « gravité » n’est qu’une métaphore d’animation.

4. **Systèmes locaux**  
   - Les interactions ne portent que sur un **voisinage** (k plus proches voisins) pour limiter le coût et les effets en cascade.

**Principe** : privilégier **peu de paramètres**, **bornes** partout (force, vitesse, distance), et des **états de repos** clairs (arrêt du mouvement sous seuil).

---

## 4. Questions ouvertes (à traiter pour affiner la spec)

### Espace et fenêtres

- Qu’est-ce qu’une **fenêtre** exactement dans Nexus : uniquement les **éditeurs** / **groupes**, ou aussi **sidebar**, **panel**, **chat**, **terminal** ?
- Le mode spatial est-il **toujours actif**, ou **optionnel** (bascule « classique VS Code » / « mode Nexus ») ?
- Les fenêtres sont-elles **toujours** dans un **même plan** (pseudo-3D par CSS) ou une **vraie** scène 3D (WebGL) pour le fond ?

### Interaction

- Quelle **combinaison de touches** pour le zoom à la molette (éviter les conflits avec le scroll du contenu) ?
- Le **z-index** est-il modifié au **clic** (mise au premier plan), au **focus**, ou les deux ?
- Faut-il des **raccourcis** pour « ramener toutes les fenêtres » ou « réinitialiser la vue » ?

### Masse et corps stellaires

- La masse est-elle **manuelle uniquement**, ou peut-elle être **suggérée** (ex. : temps passé sur le fichier, priorité IA) ?
- Les seuils **étoile / planète** sont-ils **fixes** ou **relatifs** (percentiles par rapport aux autres fenêtres ouvertes) ?
- L’**indice aléatoire** au démarrage : objectif exact (variété esthétique, seed reproductible pour debug, personnalisation) ?

### Gravité et performance

- Nombre **max** de corps animés simultanément ?
- Animation **continue** ou **uniquement** quand le panneau « galaxie » est visible ?
- Comportement **accessibilité** : réduction des mouvements (**prefers-reduced-motion**), mode **statique** ?

### IA et synchronisation

- L’IA peut-elle **proposer** ou **modifier** masse / position (sous contrôle utilisateur) ?
- Comment documenter le **contrat** (événements, états) entre harness et workbench pour ce mode ?

---

## 5. Prochaines étapes possibles (hors code)

1. Trancher les questions ci-dessus et en ajouter (atelier court).  
2. Produire un **schéma** : états (édition / corps stellaire), transitions, et règles de z-index.  
3. Choisir un **premier prototype minimal** : par ex. **une seule** scène de fond avec **grille hiérarchique** + gravité simplifiée, sans toucher à tout le layout VS Code.  
4. Aligner avec la **roadmap** technique (Electron, webview, performance).

---

## 6. Historique

| Date | Note |
|------|------|
| 2026-04-02 | Première rédaction : vision espace 3D, z-index, molette, galaxie, masse (étoile / planète), gravité simple, questions ouvertes. |
| 2026-04-02 | Nexus Space MVP réorienté vers graphe Obsidian + profondeur ; ce document marqué comme hors périmètre immédiat de l’onglet. |
