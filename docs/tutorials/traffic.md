# Traffic

L’onglet **Traffic** montre les appels que Drox lui-même envoie : modèle, embeddings, MCP, outils, RPC. Ce n’est pas un proxy de la machine. Un `curl` dans le terminal du projet n’y apparaît pas.

## Capture

**Enable capture (remembered)** arme le journal. Le choix est gardé.

| Mode | Où vont les lignes |
|------|--------------------|
| **Live session (cleared on quit)** | Mémoire de la fenêtre. Quitter Drox vide le journal. |
| **Persisted on disk** | Le même journal, plus un dossier `drox-traffic` dans les données utilisateur de l’application (pas dans le `.drox` du projet). |

**Clear** vide le tampon. En mode persisté, le dossier sur disque est vidé aussi.

Le **Ledger** est paginé : **Newer** et **Older**. Chaque ligne porte le sens, la destination et si l’appel a abouti.

## Repérer une destination

**Destination tags** : un libellé, une couleur, et un fragment d’hôte, d’IP ou d’URL (`ollama.com`, `127.0.0.1`). Les lignes qui contiennent ce fragment prennent la pastille.

**Destination alerts** : le même genre de fragment, avec un libellé optionnel. Quand un appel part vers cet hôte, Drox prévient. Les alertes et les tags sont des réglages, pas des lignes du journal.

Couper la capture n’efface pas les tags ni les alertes.
