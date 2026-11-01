# SDTCM — Simulator Data Transition into Code Map

**Statut** : principe posé. Proto phase 1 en cours.  
**Parent** : [1.6.4](README.md)

Outil d’accompagnement du reste de l’IDE. Il présente le code sous un autre angle : une carte visuelle en 2D.

## Niveaux

La carte change de précision le long de l’arborescence :

1. dossier
2. fichier
3. fonction ou classe
4. déclaration de variable

## Suivi d’une donnée

La carte simule en continu le chemin que fait une donnée.

On cible une donnée à un endroit du code. La carte montre où la donnée de cette variable peut être utilisée, de façon factuelle. On joue ensuite des tests pour voir la donnée passer d’une fonction à une autre, et obtenir des informations sur ces déplacements et ces mutations.

Exemple : une application Next de gestion de stock. On cible une donnée de stock dans le code, on voit où elle est réellement utilisée, puis on rejoue un test pour suivre son transfert et ce qui la modifie.

## Proto — phase 1

La phase 1 liste les briques, pas encore le chemin d’une donnée.

L’arbre des fichiers vient de `.drox/.SDTCMignore` : le fichier est créé au premier passage, et on peut y ajouter des lignes. L’onglet les affiche avant les liens. Le rôle ne rédige que les briques, un lot à la fois, dans `.drox/sdtcm/map.json`. L’onglet vérifie la syntaxe et que chaque citation est la ligne réelle du fichier. Tant que ce n’est pas le cas, il renvoie les erreurs et le modèle corrige. Le fichier n’est écrit qu’une fois la carte acceptée. On peut l’arrêter et le relancer. La carte déjà écrite reste.

Le diff est celui de SDTCM. Il compare le texte actuel au texte gardé dans `.drox/sdtcm/baseline.json` au moment où la brique a été acceptée. Un changement non commité, déjà cité par la carte, entre dans ce diff. **Réaligner**, ou l’outil `sdtcm_align` depuis la discussion, ne reprend que ces fichiers.
