# Chat

La discussion est le même fil dans les deux fenêtres. Dans l’IDE elle est à droite de l’éditeur. Dans Agents elle occupe le centre, avec les sessions à gauche. Le bouton **Open in Agents** / **Open in Editor** du header change de fenêtre sans changer le dossier ouvert. `Ctrl+L` et `Ctrl+Shift+L` pilotent le chat de l’IDE. La largeur du chat IDE a un plancher d’environ 35 % et peut se replier d’un coup. La fenêtre Agents n’a pas ce plancher.

## Envoyer un message

1. Ouvre un dossier.
2. Choisis une connexion et un modèle (Ollama, ou un provider du catalogue, ou un serveur OpenAI-compatible).
3. Choisis le **profil moteur** dans les réglages généraux du chat ou dans le panneau rôle (**Engine profile**).
4. Écris le message et envoie-le.

Le process `drox --serve` reçoit `agent.run`. La boucle `drive_inner` enchaîne tours de modèle et appels d’outils, puis `agent/done`. Stop envoie `agent.cancel`.

Trois profils, un seul binaire :

| Profil | Ce que le modèle peut faire |
|--------|------------------------------|
| **local-9b** | Petit modèle local. Les outils du parent s’exécutent un par un. Pas d’outil de question à l’utilisateur. |
| **local-27b** | Modèle local capable. Outils en série aussi. L’outil `ask_user_question` est disponible : une question à la fois dans le message, au plus 3 questions, 2 ou 3 options. |
| **cloud-full** | Protocole complet. Les outils indépendants partent en parallèle. Un complément dans le même message n’est permis que sur ce profil. `ask_user_question` est disponible. Un enfant Explore lancé depuis un parent local reste en protocole complet. |

Un run parent se ferme sur un tour sans outil, y compris en `cloud-full`. Le mode professeur n’existe plus.

## Modes d’écriture

Les vignettes au-dessus du composer règlent `drox.permissionMode`. Le défaut est **I'm not crazy**.

| Vignette | Effet |
|----------|--------|
| **Planifier** | Le run analyse. Les écritures attendent une approbation. |
| **Trust edit** | Les éditions de fichiers passent sans confirmation une par une. |
| **I'm not crazy** | Chaque outil qui modifie le workspace demande confirmation. |

Le détail des permissions est dans [tools-and-permissions.md](../engine/tools-and-permissions.md).

## Contexte affiché

La puce à côté du modèle est `drox.numCtx`, la fenêtre demandée au provider (64k, 128k, 256k, 1M, …). 256k correspond au préréglage 262 144.

Le pied de discussion montre deux lectures :

- **estim.** — compteur interne du moteur (`RoughTokenCounter`) sur le transport envoyé au modèle, après préparation de l’historique.
- **provider** — ce que le provider a réellement compté. Pour Ollama, c’est `prompt_eval_count` du chunk `done`, qui compte le texte et pas les images mises à part.

Le seuil d’autocompaction n’est pas un nombre fixe. Il vaut la fenêtre moins 33 000 (20 000 réservés à la sortie, 13 000 de marge). Sur 262 144, le moteur compacte autour de 229 000 tokens estimés : il coupe d’abord les résultats d’outils, puis résume l’historique. Le premier message utilisateur est gardé.

## Images collées dans le chat

Une image jointe au message est envoyée au modèle à chaque tour de la session. Une copie est aussi écrite sous `.drox/attachments/`, et le texte du message liste ce chemin. Le compteur **estim.** traite le base64 comme du texte : une image lourde peut afficher `1M` alors que le provider, qui ne compte que le texte, affiche quelques dizaines de milliers. L’image reste dans le transcript, donc elle revient au tour suivant.

Les images, sons et vidéos **trouvés dans le dossier** ne suivent pas ce chemin. `file_read` et `grep` renvoient une fiche (nom, chemin, taille, type) sans le corps. Une sortie `bash` qui n’est pas du texte devient aussi une fiche. Le SVG et les sources texte restent lisibles. Voir [edition-et-dossier-drox.md](edition-et-dossier-drox.md).

## Puces du composer

- La puce de contexte ouvre le choix de `numCtx`.
- **Codebase** arme un inject plus large pour le prochain envoi. Voir [codebase.md](codebase.md).
- **SDTCM Align** demande un réalignement de la carte à la fin d’un run réussi. Cet appel est hors de la boucle agent et consomme des tokens. Voir [sdtcm.md](sdtcm.md).

## Sessions

Reprendre une discussion relit le transcript et lance un nouvel `agent.run` avec cet historique. Compacter ou tronquer passe par `session.compact` et `session.truncateAfterLastUser`. Les fichiers de session du workspace sont sous `.drox/sessions/`. Le moteur garde aussi des transcripts dans `~/.drox/sessions/`.
