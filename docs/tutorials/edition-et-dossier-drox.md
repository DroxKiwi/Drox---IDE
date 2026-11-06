# Édition et dossier `.drox`

Drox édite comme l’éditeur VS Code, et le moteur peut écrire dans le même dossier. Ce qui est à toi (sources, Git) et ce que Drox produit (sessions, index, carte) ne vont pas au même endroit.

## Éditer soi-même

L’explorateur, les onglets, la sauvegarde, le diff et Git sont ceux de Code OSS. Une modification manuelle est un fichier du workspace. La carte SDTCM ne la voit qu’au prochain **Realign** ou si **SDTCM Align** est allumé à la fin d’un run. L’index Codebase la reprend au prochain passage sur la discussion active.

## Laisser le modèle éditer

Le modèle écrit avec ses outils (`file_write`, éditions, `bash`), dans la limite du mode choisi dans le chat :

- **Planifier** — pas d’écriture tant qu’elle n’est pas approuvée.
- **Trust edit** — les éditions passent.
- **I'm not crazy** — chaque outil qui modifie demande confirmation.

Le panneau **Changes** montre les diffs du run. On les relit avant de commit. Sur Windows le shell du moteur est `cmd.exe`, pas PowerShell. Pour un message de commit, le modèle écrit `.drox/COMMIT_MSG`, lance `git commit -F .drox/COMMIT_MSG`, puis supprime ce fichier.

## Ce que le modèle peut lire

Les sources texte, le SVG, le Markdown, le JSON : `file_read` renvoie le corps, dans les plafonds habituels. Une sortie texte longue de `bash` est coupée puis résumée par un aperçu, le reste est déversé à part.

Les images (`png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `ico`), l’audio et la vidéo du disque ne sont pas inlinés. `file_read` renvoie une fiche : chemin, nom, taille, type, et la note que le corps n’est pas inclus. `grep` saute ces fichiers. Une sortie `bash` qui n’est pas du texte (octet NUL, ou trop de caractères de remplacement) devient la même fiche. `glob` continue de lister les noms.

Une image **collée dans le chat** est l’exception : elle part au modèle. Voir [chat.md](chat.md).

## `.drox` du workspace

Le dossier est à la racine du projet. Il est en général ignoré par Git. Le vider depuis le chat (reset des données Drox du workspace) efface sessions, mémoire, pièces jointes et carte, et **garde** `.drox/.env`.

| Chemin | Rôle |
|--------|------|
| `.drox/.env` | Secrets et `DROX_SERVER`. Un réglage Drox explicite l’emporte sur `DROX_SERVER`. Conservé par le reset. |
| `.drox/sessions/` | Transcripts de discussion, capture de run, journal de replay UI. |
| `.drox/attachments/` | Copies des images jointes au chat. |
| `.drox/codebase-index/` | Index local Codebase. |
| `.drox/sdtcm/` | `map.json`, `baseline.json`, `tags.json`, `display.json`, `pause.json`. |
| `.drox/.SDTCMignore` | Fichiers laissés hors de l’arbre SDTCM. |
| `.drox/regulation/` | Historique et surface des leviers L1–L5. |
| `.drox/rules/` | Règles projet injectées dans le run quand `drox` les a activées (défaut : oui). |
| `.drox/memory/` | Archives de mémoire projet, si la mémoire workspace est activée. |
| `.drox/agent-output/` | Rapports d’exécuteur ou de sous-run. |
| `.drox/subagents/` | Rapports Explore. |
| `.drox/COMMIT_MSG` | Fichier temporaire de message de commit. |

`MEMORY.md` et `DROX.md` sont à la **racine** du workspace, pas dans `.drox`. La mémoire workspace est coupée par défaut (`drox` ne les injecte qu’une fois le réglage allumé).

## Ailleurs que dans le projet

| Emplacement | Rôle |
|-------------|------|
| `~/.drox/sessions/` | Transcripts du moteur, hors du dépôt. |
| `~/.drox/rules/` | Règles utilisateur, en plus des règles du projet. |
| Données utilisateur de l’application (`drox-traffic`) | Journal Traffic en mode persisté. |
| `%APPDATA%\.drox-ide` (Windows) | Profil de l’application : réglages, pas le code du projet. |

Aucun de ces fichiers n’est envoyé à un cloud Drox. Les appels réseau sont ceux de la connexion modèle, des embeddings, du MCP et des outils que le run lance. L’onglet [Traffic](traffic.md) les liste.
