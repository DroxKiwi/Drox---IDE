# SDTCM

SDTCM (*Simulator Data Transition into Code Map*) dessine une carte du dossier ouvert. L’onglet de la barre d’activité ouvre cette carte dans un onglet d’éditeur. Le panneau latéral dit « The map opens in an editor tab » et porte **Open the map**, l’outil **Move**, et les **Tags**.

La carte n’est pas un run agent. **Launch a run**, **Realign** et la puce **SDTCM Align** appellent le modèle de discussion en une complétion HTTP, hors de `agent.run`, avec une température à 0. Chaque appel consomme des tokens. Le thinking est ramené au plus court que le provider accepte.

## Lire la carte

Quatre sortes, deux formes, quel que soit le langage :

| Sorte | Ce que le modèle y range |
|-------|--------------------------|
| `type` | Classe, struct, enum, table SQL |
| `operation` | Fonction, méthode, macro |
| `value` | Constante, variable, colonne |
| `source` | Import, `#include`, `using` |

`declare` est la ligne qui introduit le nom. `apply` est la ligne qui l’appelle ou le lit. Un clic sur une brique, un fichier ou une donnée ouvre la ligne dans l’éditeur.

L’arbre vient de `.drox/.SDTCMignore`. Le fichier est créé au premier passage. Un nom nu ignore ce segment partout. Un chemin part de la racine du workspace. On peut y ajouter des lignes.

## Construire

**Launch a run** écrit la carte. Les étapes du header sont `build`, `data`, `trace`, `link`, `tag`. En choisir une la relance, et les étapes qui en dépendent suivent : `build` reprend tout ; `data` reprend aussi `trace`.

Chaque citation doit être une ligne réelle du fichier. Tant que ce n’est pas le cas, l’onglet renvoie l’erreur et redemande un JSON. Après plusieurs échecs, le libellé reste « The last map was refused. » Le fichier `.drox/sdtcm/map.json` n’est écrit qu’une fois la carte acceptée.

**Stop** interrompt. `pause.json` garde l’étape et le fichier. **Resume** reprend là. La carte déjà écrite reste.

**Reset** repart d’une carte vide.

## Aligner après une édition

Le diff SDTCM compare le texte actuel à `.drox/sdtcm/baseline.json`, le texte gardé quand la brique a été acceptée. **Realign** ne reprend que les fichiers dont ce texte a bougé.

La puce **SDTCM Align** du chat mémorise le choix pour le workspace. À `agent/done` d’un run réussi, le même appel hors boucle réaligne la carte. On peut aussi le demander depuis la discussion avec l’outil `sdtcm_align`.

## Tags

Dans le panneau latéral : nom, description, portée (`Folder`, `File`, `Brick`, `Data`), puis **Add**. Le nom commence par une lettre, puis des lettres, des chiffres ou des tirets. La description est obligatoire. Un tag refusé revient avec la forme exacte à réécrire. Les tags sont dans `.drox/sdtcm/tags.json`.

Le suivi d’une donnée sur la carte montre où ce nom est déclaré et appliqué. Rejouer un test pour voir la valeur passer d’une fonction à l’autre n’est pas branché.
