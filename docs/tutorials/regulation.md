# Regulation

L’onglet **Regulation** note le run qui vient de finir et resserre, si on le lui demande, ce qu’on expose au modèle au run suivant. Il ne change ni le modèle, ni `drox.numCtx`, ni les permissions d’écriture.

La sonde tourne sur le chat IDE et sur Agents, à chaque `agent/done`. **Auto** ne coupe pas la sonde. Auto décide seulement si le module du levier suit la note. L’historique est dans `.drox/regulation/` et suit le dossier de la discussion.

Référence des formules : [model-regulation.md](../engine/model-regulation.md).

## Lire le panneau

En haut : le dossier, puis la clé `provider::modèle`. La note globale est la moyenne des cinq leviers **de ce run**, pas une moyenne de l’historique. Chaque ligne part de 100 et perd des points là où le moteur a stressé (schéma d’outil, boucle, annulation, erreur, absence de recherche sur une tâche de code).

| Levier | Libellé | Modules | Ce que le module change au run suivant |
|--------|---------|---------|----------------------------------------|
| L1 | Context budget | `minimal` · `compact` · `standard` · `rich` | Taille de l’inject Codebase et des notes de session. `minimal` réduit fort et retire les notes. `rich` élargit. |
| L2 | Tool surface | `core` · `standard` · `full` | Nombre d’outils présentés au modèle. |
| L3 | Directive density | `laissez-faire` · `guided` · `assertive` | Densité des consignes. |
| L4 | Protocol strictness | `soft` · `normal` · `strict` | Strictesse du protocole de tour. |
| L5 | Retrieval posture | `passive` · `nudge` · `aggressive` | Incitation à chercher dans le dépôt (`codebase_search`). |

Le menu de la ligne choisit le module à la main. Ce choix **fige** le levier : Auto passe sur OFF. **Auto ON** réapplique après chaque run le module suggéré par la note. Une note haute desserre (plus de contexte, plus d’outils, consignes plus légères). Une note basse resserre.

`suggest …` s’affiche quand le module recommandé diffère de celui qui est actif.

## Historique

**Run history** liste les derniers runs du dossier : extrait du prompt et les cinq notes. **Trends** trace la note globale. Changer de discussion recharge l’historique de la nouvelle racine.
