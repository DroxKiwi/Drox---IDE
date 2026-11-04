# SDTCM — Simulator Data Transition into Code Map

**Statut** : carte dessinée sur `1.6.4` (`ed88d98d`, `c833c442`, `882a0d4d`). Le rejeu d’un test n’est pas fait.  
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

## Ce qui est dessiné

La carte est un onglet d’éditeur. Elle montre les briques, les liens de fichier, et les data sous la brique qui les a fait naître. Un clic sur une brique peut ouvrir le code. Le header porte le statut, les étapes build / data / trace / link / tag, Launch a run, Realign, le zoom et Reset. Launch a run et Realign appellent le modèle. Choisir une étape dans le header la relance à partir de là.

L’arbre des fichiers vient de `.drox/.SDTCMignore` : le fichier est créé au premier passage, et on peut y ajouter des lignes. Le rôle écrit dans `.drox/sdtcm/map.json`. L’onglet vérifie la syntaxe et que chaque citation est la ligne réelle du fichier. Tant que ce n’est pas le cas, il renvoie les erreurs et le modèle corrige. « The last map was refused. » reste le libellé d’un refus. Un tag refusé revient avec la forme exacte à réécrire. Le fichier n’est écrit qu’une fois la carte acceptée. On peut arrêter et relancer. La carte déjà écrite reste.

Le diff est celui de SDTCM. Il compare le texte actuel au texte gardé dans `.drox/sdtcm/baseline.json` au moment où la brique a été acceptée. Un changement non commité, déjà cité par la carte, entre dans ce diff. **Réaligner**, ou l’outil `sdtcm_align` depuis la discussion, ne reprend que ces fichiers et garde le reste de la carte.

Le chemin factuel d’une donnée, puis le rejeu d’un test pour la voir passer d’une fonction à une autre, reste le principe. Ce rejeu n’est pas branché.
