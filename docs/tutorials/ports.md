# Ports

L’onglet **Ports** lance un tunnel avec un outil que tu fournis (`ssh`, `socat`, un script) et dit quoi faire quand le port local répond. La prévisualisation `localhost` déjà connue de l’éditeur reste en place. Cette couche ajoute le tunnel vers l’hôte distant.

Le moteur agent n’ouvre pas ces tunnels. Le panneau écrit les réglages `drox.ports.*` et le process principal de l’application lance la commande.

## Deux listes

**External tools** est lié à l’utilisateur (la machine, le compte). **Forwards** est lié au workspace : les ports du projet peuvent suivre le dépôt si l’équipe commit le réglage.

**Open drox.ports settings** ouvre les mêmes clés dans les réglages.

### Outil

Libellé, commande (`ssh`), arguments. Les arguments acceptent `{{localHost}}`, `{{localPort}}`, `{{remoteHost}}`, `{{remotePort}}`. **Add tool**, puis **Set default** sur la ligne qui doit servir quand un forward n’en nomme pas d’autre.

### Forward

Libellé, hôte distant, port distant, port local, outil (ou l’outil par défaut), protocole `http`, `https` ou `tcp`.

**On ready** :

| Choix | Quand le port local répond |
|-------|----------------------------|
| **open preview** | Ouvre la prévisualisation de l’éditeur. |
| **open browser** | Ouvre le navigateur. |
| **notify** | Notification. |
| **none** | Rien. L’adresse est prête, on l’ouvre soi-même. |

**Start** lance l’outil avec les placeholders remplis. **Stop** l’arrête. **Open** réouvre l’adresse locale. **Remove** retire la ligne du réglage.

Une URL HTTP ou HTTPS est `protocole://hôte-local:port-local`. Un forward `tcp` n’a pas cette URL de page : il expose le port, sans prévisualisation web.
